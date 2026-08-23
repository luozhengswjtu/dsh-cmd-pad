# dsh-cmd-pad

DSH Web UI 里的「测试命令行速查面板」：命令按**自定义分组 + 项目**归档，一键复制；主形态（better-sidebar 在场）支持**一键运行**（新开专用终端直送执行，见下文「运行功能」）。
产品设计见 `dsh-cmd-pad-功能文档与交互设计.md`（v0.4）；落地路线见 `TASK.md`。

## 形态（双形态，软依赖 better-sidebar）

- **主形态**（装了 better-sidebar）：注册为侧边栏 Tab `cmd-pad:pad`（order 45，单实例）；
- **降级形态**（没装）：浮动图标 + 非模态右侧抽屉。

## 安装

```bash
dsh plugin --profile web add <本目录>
```

装完重启 `dsh web` + 硬刷新浏览器（Ctrl+Shift+R）。

## 使用说明

- **打开方式**：
  - 主形态（装了 better-sidebar）：底部/侧边面板 `+` 菜单选「命令」（位于终端与浏览器之间）；
    或在「设置 → 侧边卡片」中确认「命令」卡片在场（id `cmd-pad:pad`，可配置「打开时定位上次使用的分组」）；
  - 降级形态（没装 better-sidebar）：页面右下角浮动图标 → 右侧抽屉。
- **基本操作**：分组条筛选（全部 / 项目：当前工作区 / 常驻 / ▸ 更多）→ 点击命令块或「复制」一键复制
  （成功 Toast「已复制」，锚定按钮左侧）；`/` 聚焦搜索（命中高亮 + 计数，Esc 清空）；**添加命令**
  = 搜索框右侧「添加命令」按钮（标题/命令/备注/危险勾选/分组多选，可当场新建分组快捷路径）；
  **添加分组** = 分组栏右侧「＋」（新建分组自动设为常驻，空分组也显示）；右键菜单：卡片 = 复制/编辑/删除，
  分组 = 常驻/重命名/删除；主形态下卡片「运行」= 新开专用终端直送执行（危险命令先确认、停在提示符
  不回车，见「运行功能」）。
- **数据与手改**：命令库在 `%USERPROFILE%\.dsh\profiles\web\cmd-pad\commands.yml`（人可手改，
  重开面板自动生效；写操作自动 `.bak` 备份）；机器状态在 `state.json`。**插件零预设数据**：
  安装后为**空库**（空态显示「等待添加」，分组条仅「全部」+ 项目分组——分组为聚合语义，
  命令删光分组自动消失）；可用「添加命令」按钮、「＋」新建分组或手改 yml 建立自己的命令库。
- **升级 better-sidebar 后**：必须回归 `test/t07-ws-probe.mjs` + `test/t07-run.test.mjs`
  （终端 WS 为未文档化内部协议，见 `docs/better-sidebar-接入规范.md` §3）。

## 仓库结构

```
dsh-cmd-pad/
├── package.json       # dsh.bundle.patch + dsh.client 声明；peer 含 dsh-better-sidebar(optional)
├── cordis.patch.yml   # host 半挂载行（id: cmd-pad / name: dsh-cmd-pad）
├── src/
│   ├── index.js       # host 半：/cmd-pad/api 数据层路由（T02，零运行时依赖）
│   └── client.js      # client 半：手写 __ModuleLoader__.load wire format（零构建）
├── test/              # T02–T07 验收 harness（不随 files 发布）
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
- **分组横条**（设计文档 §3.3 结构，横条化呈现）：全部 → 项目：当前 cwd → **上次使用**（动态最近使用视图，调整记录 #28）→ 未分组（仅当存在）→ 常驻分组 → 更多箭头（**仅图标**：折叠 `▸` 展开 / 展开 `◂` 收起，悬停 title 显示隐藏分组数；其他项目按最近使用倒序 + 不常驻分组，展开区内无「分组」小节标题——调整记录 #26）；
- **项目识别**：client 探测 `ctx.get('sessions')` 取当前会话 id → GET
  `/cmd-pad/api/library?sessionId=` → host 半 `resolveSessionCwd` 回填权威 cwd；
  多项目末段重名时带上一级路径消歧（`Temp_Code` → `docs / Temp_Code`）；
- **命令卡片**（§4.1）：标题 + 危险 pill → 命令等宽块（点击即复制，两行截断）→ 备注 →
  `复制` 按钮；`danger: true` 显示「危险」徽标；
- **全局搜索**（F5）：`/` 聚焦、命中高亮（`cmd-pad-hit`）、命中计数、分组名命中、
  Esc 清空（Esc 链：搜索 → 抽屉）；
- **复制**：`navigator.clipboard` 优先，失败回退 `execCommand`；成功 Toast「已复制」；
  复制成功后按功能文档 §3.4 刷新「上次使用」（PUT `/api/state`，机器状态，非命令库写）；
- **「上次使用」视图（调整记录 #28，替换原「常用」分组概念）**：动态最近使用命令视图——
  复制/运行成功即记录（去重置顶），**保留 100 条、显示 20 条**（已删除命令自动跳过）；
  视图顶部工具栏：**范围切换（项目 | 全部）**（`项目`＝仅当前项目命令，`全部`＝跨项目，
  `recentScope` 持久化）＋ **ⓘ 帮助按钮**（小圆 + 空心问号，悬停提示「切换范围：
  项目＝仅当前项目，全部＝所有项目」）；
- **回归**：`node test/t03-browse-copy.test.mjs`（38 项：纯逻辑分组模型/消歧/搜索/上次使用 +
  DOM 渲染 + 视觉规范 §6 静态检查）。

## 写操作（T04，client 半）

「添加命令」搜索框右侧按钮 / 「＋」新建分组（调整记录 #33/#34：入口解耦）+ 右键菜单，命令库写操作全部走 PUT `/api/library`（原子写 + `.bak`）：

- **添加/编辑**（表单弹窗）：标题/命令（多行等宽）/备注/危险勾选/分组多选；分组列表
  自定义（常驻在前）→ 项目分区，>8 个未勾选不常驻折叠「显示全部分组 ▸」；底部可输入
  新建分组名（保存时自动创建，快捷路径）；默认勾选规则（§3.5）：当前分组视图 → 该分组；全部/搜索态
  → 上次使用的分组 → 当前项目（原「→ 常用」兜底已移除，调整记录 #28）；命令输入检测
  危险关键词（rm/del/format/wipe/reboot 等，词边界匹配）自动勾选「危险」并提示（可取消）；
- **删除**（§3.5 语境语义）：分组视图下命令还属于其他分组 = 静默解关联；否则确认弹窗
  彻底删除；分组删除弹窗列出「N 条解除关联，M 条仅此分组的将彻底删除」；删除后 5 秒内
  Toast 可撤销（快照恢复）；
- **右键菜单**：分组（设为常驻/取消常驻、重命名[仅自定义，级联更新+冲突拒绝]、删除）；
  卡片（复制/编辑/删除）；
- **常驻**：state.json `pinnedGroups` 持久化；常驻分组无命令也显示（§3.3）；
- **回归**：`node test/t04-write-ops.test.mjs`（25 项：纯逻辑 7 + DOM 交互 18，
  含 22 次连续增删改后 yml 始终合法）。

## 运行功能（T07，2026-08-23 落地；调整记录 #28 增补）

**主形态（better-sidebar 在场）**：卡片/右键菜单提供「运行」= **每次新开专用终端 Tab** +
**终端直写**（用户决策，TASK.md 调整记录 #24）：

- **流程**：**底部栏强制落点**（调整记录 #28：新终端一律落在底部栏——底部面板打开且有
  既有 tab 时先 `activateTab` 底部树任一 tab 切 activePane，再 `openTab`；底部面板关闭/
  无底部 tab 时降级当前行为）→ `bs.openTab({type:'terminal'})` 新开 → snapshot 差集识别
  新终端 id → `activateTab` 激活 → 短命 WS 附加 `/sidebar/ws/terminal?sessionId&tab&cwd` →
  **等输出流出现提示符 `>`（PowerShell 冷启动 6–7s，未就绪写入会被吞）** → 发送 `命令+\r` →
  **保持连接不 drop**（新终端无 UI 视图长连时 bare drop 会在 reconnect grace 30s 后杀 pty）→
  运行成功 → onSuccess 记录「上次使用」视图（调整记录 #28）；
- **危险命令**（`danger: true`）：确认弹窗（命令原文 + 取消/确认）→ 只发文本**不带 `\r`**，
  停在提示符由用户亲眼确认后回车（双人工确认）；
- **降级链**（用户确认定稿）：终端直写任一失败（pty 配额满/设置禁用/openTab 被拒/WS 失败）→
  `bs.closeTab` 回滚刚创建的 tab（防泄漏）→ **复制 + Toast「已复制，到终端粘贴执行」**
  （不再写对话输入框——该方案已被否决，调整记录 #21）；
- **降级形态（无 better-sidebar）**：**不渲染运行入口**，只提供复制（用户决策 #24）。
- **协议实证**：双 WS 附加 13/13（`node test/t07-ws-probe.mjs`，better-sidebar **v0.13.1**）
  + 端到端写文件副作用验证；每次升级 better-sidebar 后回归（`docs/better-sidebar-接入规范.md` §3）。
- **回归**：`node test/t07-run.test.mjs`（21 项：纯逻辑/成功路径/底部栏落点/onSuccess/危险确认/降级链×4/回滚/UI）。

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

## 回归汇总（T08 收尾 138 项；调整记录 #28 后 150 项；#33 后 152 项）

全套验收 harness **152 项全过**（`node test/<t0X>-*.test.mjs`，工作目录 `dsh-cmd-pad/`）：

| harness | 项数 | 覆盖 |
|---|---|---|
| `t02-data-layer` | 33 | 迷你 YAML / 原子写+串行队列 / API 全链路 / 信任围栏 / yaml 动态加载 |
| `t02-cluster-offset` | 7 | 顶栏 ✕ 与 better-sidebar 按钮簇避让（双锚点探测） |
| `t03-drawer-layout` | 12 | 抽屉占用式推挤 + 拖拽分栏 + 持久化 |
| `t03-browse-copy` | 38 | 分组模型/消歧/搜索/**上次使用视图（记录/范围切换/ⓘ）** + DOM 渲染 + 视觉规范 §6 静态检查 |
| `t04-write-ops` | 27 | 增删改/删除语境语义/撤销/重命名级联/常驻持久化/**新建分组（＋ 独立入口，自动常驻/校验）** |
| `t06-main-form` | 14 | 主形态探测链/descriptor/能力门/无浮层/React 桥接/插件设置 |
| `t07-run` | 21 | 终端直写成功路径/**底部栏落点/onSuccess**/危险不带 \r/降级链×4/回滚/UI |

另有 `t07-ws-probe`（13 项）为**实机协议探针**（需真实 better-sidebar v0.13.1 + 运行中的 dsh web），
每次升级 better-sidebar 后回归。真机实证（WebBridge，2026-08-23）：主形态入口/无浮层/面板内容/
搜索/明暗切换（浅↔深令牌跟随），截图见 `test/shots/t08-*.png`。

## 开发守则

见仓库根 `AGENTS.md` 与 `docs/`（接入规范 / 视觉风格统一规范）。
