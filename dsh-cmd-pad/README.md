# dsh-cmd-pad

DSH Web UI 里的「测试命令行速查面板」：命令按**自定义分组 + 项目**归档，点一下直接跑，或一键复制。
产品设计见 `dsh-cmd-pad-功能文档与交互设计.md`（v0.3）；落地路线见 `TASK.md`。

## 形态（双形态，软依赖 better-sidebar）

- **主形态**（装了 better-sidebar）：注册为侧边栏 Tab `cmd-pad:pad`（order 45，单实例）；
- **降级形态**（没装）：浮动图标 + 非模态右侧抽屉。

## 安装

```bash
dsh plugin --profile web add <本目录>
```

装完重启 `dsh web` + 硬刷新浏览器（Ctrl+Shift+R）。

## 仓库结构

```
dsh-cmd-pad/
├── package.json       # dsh.bundle.patch + dsh.client 声明；peer 含 dsh-better-sidebar(optional)
├── cordis.patch.yml   # host 半挂载行（id: cmd-pad / name: dsh-cmd-pad）
├── src/
│   ├── index.js       # host 半：/cmd-pad/api 数据层路由（T02，零运行时依赖）
│   └── client.js      # client 半：手写 __ModuleLoader__.load wire format（零构建）
├── test/              # T02 验收 harness（不随 files 发布）
└── README.md
```

## 数据层（T02，host 半）

- **存储目录**：`%USERPROFILE%\.dsh\profiles\web\cmd-pad\`（`DSH_HOME` 可覆盖 `.dsh` 前缀；
  profile 补丁可给 cmd-pad 配 `config.dataDir` 覆盖，例如
  `- update: { id: cmd-pad, config: { dataDir: "~/my/cmd-pad" } }`）。
- **文件**：`commands.yml`（人可手改）+ `state.json`（机器维护）；写入原子化
  （随机后缀临时文件 + rename），`commands.yml` 写前自动备份 `.bak`；同文件写入走串行队列。
- **YAML**：优先动态加载 `yaml` 包（从插件真实路径 / profile 解析，装上即用），
  缺省回退内置迷你读写器（commands.yml 子集，解析失败抛错绝不落盘）。
- **信任围栏**：所有 `/cmd-pad` 请求校验 Host（loopback / webRuntime.trustedHosts）、
  拒绝 `Sec-Fetch-Site: cross-site`、Origin 须同源——防止 DNS rebinding / 跨站写。
- **API**：

| 路由 | 方法 | 说明 |
|---|---|---|
| `/cmd-pad/api/library?sessionId=` | GET | `{ ok, library, state, cwd, mtime }`；commands.yml 损坏时回退 `.bak` 并带 `recovered` 标记 |
| `/cmd-pad/api/library` | PUT | 全量保存 `{ library: { commands: [...] } }`；校验失败 400，不落盘 |
| `/cmd-pad/api/state` | PUT | 增量合并 `state.json`（对象逐键深合并，数组/标量整体替换） |

- **curl 复核示例**（重启 `dsh web` 后）：

```bash
# GET（手改 yml 后读回）
curl http://127.0.0.1:3080/cmd-pad/api/library
# PUT 保存（生成 .bak）
curl -X PUT -H "content-type: application/json" \
  -d '{"library":{"commands":[{"id":"top-mem","title":"查看整机内存","cmd":"hdc shell \"top -n 1 | head -30\"","groups":["性能采集"]}]}}' \
  http://127.0.0.1:3080/cmd-pad/api/library
# 增量 state
curl -X PUT -H "content-type: application/json" -d '{"pinnedGroups":["常用"]}' \
  http://127.0.0.1:3080/cmd-pad/api/state
```

- **回归**：`node test/t02-data-layer.test.mjs`（33 项全过：迷你 YAML / 原子写 / API /
  并发 / 围栏）。

## 开发守则

见仓库根 `AGENTS.md` 与 `docs/`（接入规范 / 视觉风格统一规范）。
