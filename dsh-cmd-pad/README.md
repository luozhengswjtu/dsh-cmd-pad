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

## 浏览与复制（T03，client 半）

降级抽屉内容区（主形态 T06 复用同一份内容区代码）：

- **布局（用户定稿，2026-08-23）**：抽屉内部呈上下结构——标题栏 → 搜索栏（整宽）→ **分组横条**（分组项横向 chip 排列，放不下换行，最多 3 行）→ 命令区（占满剩余宽度）；
- **打开即定位（用户定稿，调整记录 #17）**：抽屉打开时直接显示**上次使用的分组**（lastUsedViewId，复制/运行命令时刷新），无「上次使用」标签；上次视图失效时回退「全部」；
- **分组横条**（设计文档 §3.3 结构，横条化呈现）：全部 → 项目：当前 cwd → 未分组（仅当存在）→ 常驻分组 → `▸ 更多（N）`（其他项目按最近使用倒序 + 不常驻分组）；
- **项目识别**：client 探测 `ctx.get('sessions')` 取当前会话 id → GET
  `/cmd-pad/api/library?sessionId=` → host 半 `resolveSessionCwd` 回填权威 cwd；
  多项目末段重名时带上一级路径消歧（`Temp_Code` → `docs / Temp_Code`）；
- **命令卡片**（§4.1）：标题 + 危险 pill → 命令等宽块（点击即复制，两行截断）→ 备注 →
  `复制` / `运行` 按钮；`danger: true` 显示「危险」徽标；
- **全局搜索**（F5）：`/` 聚焦、命中高亮（`cmd-pad-hit`）、命中计数、分组名命中、
  Esc 清空（Esc 链：搜索 → 抽屉）；
- **复制**：`navigator.clipboard` 优先，失败回退 `execCommand`；成功 Toast「已复制」；
  复制成功后按功能文档 §3.4 刷新「上次使用」（PUT `/api/state`，机器状态，非命令库写）；
- **回归**：`node test/t03-browse-copy.test.mjs`（29 项：纯逻辑分组模型/消歧/搜索 +
  DOM 渲染 + 视觉规范 §6 静态检查）。

## 写操作（T04，client 半）

顶栏「+ 添加」入口 + 右键菜单，命令库写操作全部走 PUT `/api/library`（原子写 + `.bak`）：

- **添加/编辑**（表单弹窗）：标题/命令（多行等宽）/备注/危险勾选/分组多选；分组列表
  自定义（常驻在前）→ 项目分区，>8 个未勾选不常驻折叠「显示全部分组 ▸」；底部可输入
  新建分组名（保存时自动创建）；默认勾选规则（§3.5）：当前分组视图 → 该分组；全部/搜索态
  → 上次使用的分组 → 当前项目 → 常用；命令输入检测危险关键词（rm/del/format/wipe/reboot
  等，词边界匹配）自动勾选「危险」并提示（可取消）；
- **删除**（§3.5 语境语义）：分组视图下命令还属于其他分组 = 静默解关联；否则确认弹窗
  彻底删除；分组删除弹窗列出「N 条解除关联，M 条仅此分组的将彻底删除」；删除后 5 秒内
  Toast 可撤销（快照恢复）；
- **右键菜单**：分组（设为常驻/取消常驻、重命名[仅自定义，级联更新+冲突拒绝]、删除）；
  卡片（运行/复制/编辑/删除）；
- **常驻**：state.json `pinnedGroups` 持久化；常驻分组无命令也显示（§3.3）；
- **回归**：`node test/t04-write-ops.test.mjs`（25 项：纯逻辑 7 + DOM 交互 18，
  含 22 次连续增删改后 yml 始终合法）。

## 运行（T05，client 半）

「运行」= 把命令写入**当前会话对话输入框**（回车即让 Agent 执行），通道实现为
`conversation` 服务探测（`ctx.get('conversation').input.for(sessions.scope(id)).setDraft`，
替换式写入，**不自动发送**）；任一环节不可用 → 降级复制 + Toast 明示：

- **入口**：卡片操作行「运行」按钮 + 卡片右键「运行」；
- **危险命令**（`danger: true`）：必须经确认弹窗（显示**完整命令原文**等宽块）才入输入框，
  取消不写；确认按钮为危险样式；
- **降级链**（功能文档 §4.2 降级形态）：对话输入框 → 剪贴板（Toast 明示「运行通道不可用，
  已复制到剪贴板」）；剪贴板也失败 → error Toast；
- **刷新「上次使用」**：运行/复制均按功能文档 §3.4 刷新 lastUsedViewId（PUT `/api/state`）；
- **安全性**（§4.3）：仅点击「运行」按钮/菜单项触发执行；浏览、搜索、切换分组、开合抽屉等
  任何非点击行为不触发执行；
- **回归**：`node test/t05-run.test.mjs`（14 项：writeComposerDraft 探测链各分支 +
  DOM 交互：写输入框原文/不自动发送/危险确认/降级复制/右键路径/非点击不触发/Toast 锚定）。
  终端直写三级降级链在 T07（主形态，实验性）。

## 开发守则

见仓库根 `AGENTS.md` 与 `docs/`（接入规范 / 视觉风格统一规范）。
