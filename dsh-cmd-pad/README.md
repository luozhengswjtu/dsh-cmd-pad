# dsh-cmd-pad

DSH Web UI 里的「测试命令行速查面板」：命令按**自定义分组 + 项目**归档，一键复制（运行功能暂缓，见下）。
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
- **打开即定位（用户定稿，调整记录 #17）**：抽屉打开时直接显示**上次使用的分组**（lastUsedViewId，复制命令时刷新），无「上次使用」标签；上次视图失效时回退「全部」；
- **分组横条**（设计文档 §3.3 结构，横条化呈现）：全部 → 项目：当前 cwd → 未分组（仅当存在）→ 常驻分组 → `▸ 更多（N）`（其他项目按最近使用倒序 + 不常驻分组）；
- **项目识别**：client 探测 `ctx.get('sessions')` 取当前会话 id → GET
  `/cmd-pad/api/library?sessionId=` → host 半 `resolveSessionCwd` 回填权威 cwd；
  多项目末段重名时带上一级路径消歧（`Temp_Code` → `docs / Temp_Code`）；
- **命令卡片**（§4.1）：标题 + 危险 pill → 命令等宽块（点击即复制，两行截断）→ 备注 →
  `复制` 按钮；`danger: true` 显示「危险」徽标；
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
  卡片（复制/编辑/删除）；
- **常驻**：state.json `pinnedGroups` 持久化；常驻分组无命令也显示（§3.3）；
- **回归**：`node test/t04-write-ops.test.mjs`（25 项：纯逻辑 7 + DOM 交互 18，
  含 22 次连续增删改后 yml 始终合法）。

## 运行功能（暂缓，用户决策 2026-08-23）

**「运行」已整体移除**（TASK.md 调整记录 #21）：v0.1 曾实现「运行」= 把命令写入当前会话
对话输入框（`conversation` 服务 `setDraft`，回车即让 Agent 执行），用户评估后认为该方案不佳，
决定**直接去掉**，等有完善的运行方案（如 T07 终端直写三级降级链）再补全。当前命令卡片仅提供
「复制」；`danger: true` 标记保留（卡片「危险」徽标 + 保存时关键词提示勾选），供未来运行通道
恢复时做二次确认。

## 主形态（T06，better-sidebar Tab）

装了 better-sidebar 时 cmd-pad 注册为其侧边栏 Tab（探测 `ctx.get('betterSidebar')`，软依赖）：

- **注册描述符**：id `cmd-pad:pad`、标题「命令」、order 45（终端与浏览器之间）、`single: true`、
  单色 SVG **命令列表图标**（提示符 `>` + 两行命令线，与内置终端 `>_` 图标明显区分）；
- **onActivate**（能力门 `tabLifecycle`）：切回 Tab 时拉取最新命令库（多标签页/手改 yml 保鲜）；
- **插件设置**（能力门 `pluginSettings`）：设置页「命令」卡片齿轮内「打开时定位上次使用的分组」
  开关（`openToLastUsed`，持久化于 `pluginSettings['cmd-pad:pad']`）；
- **React 桥接**：`require('react')`（ModuleLoader 白名单）桥接组件 ref 挂载**纯 DOM 面板**，
  scope（sessionId/cwd）变化重挂、`visible` 性能门（面板隐藏时挂起渲染，恢复可见补渲染）；
- **内容区 100% 复用**：主形态 Tab 与降级抽屉共用同一份内容区代码（`createCmdPadPanel`
  共享工厂：状态/渲染/搜索/写操作/事件/键盘），两形态功能完全等价；
- **主形态不自建浮层**：无浮动图标、无抽屉、无遮罩（外壳全由 better-sidebar 承担）；
- **回归**：`node test/t06-main-form.test.mjs`（14 项：探测链/descriptor 字段/能力门×3/
  无浮层/react 不可用回退/HMR/组件挂载/scope 重挂/visible 门/onActivate/插件设置/Esc 链）。

## 开发守则

见仓库根 `AGENTS.md` 与 `docs/`（接入规范 / 视觉风格统一规范）。
