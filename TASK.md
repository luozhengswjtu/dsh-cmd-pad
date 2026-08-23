# TASK.md — cmd-pad 稳定落地路线图

> **总目标**：cmd-pad 插件按 `dsh-cmd-pad-功能文档与交互设计.md`（v0.3）的全部既定功能**稳定运行**。
>
> **使用规则**（每次开发会话必读）：
> 1. 开始任何任务前，先读本文件，确认其前置任务的状态与「调整记录」；
> 2. 任务完成后：状态改为 `✅`，填写完成日期与「完成证据」（验证结果/提交号），**立即提交**；
> 3. 做任务时发现与前置假设不符（协议变化、设计缺陷、环境限制）：
>    - 先记录到文末「调整记录」（日期 + 事实 + 影响）；
>    - 再据此修改受影响的后续任务（范围/顺序/验收标准），保持依赖链自洽；
>    - 不得跳过记录直接改任务；
> 4. 稳定性优先：任何一步的「完成定义」未全部满足，不进入下一步；
> 5. 每步完成后在两种环境各验一次：**无 better-sidebar（降级形态）** / **有 better-sidebar（主形态）**（T06 起才两种都有意义，此前只验降级形态）。

**图例**：`⬜` 未开始 | `🚧` 进行中 | `✅` 完成 | `⏸️` 挂起（原因写入备注）

---

## T00 基线提交

- **状态**：✅（完成证据：基线 commit `5784085`）
- **前置**：无
- **内容**：规范文档（AGENTS.md、docs/×2、设计文档、本文件）入库，首个 commit。
- **完成定义**：`git log` 有基线提交；工作区干净。
- **备注**：~~若 v0.1 代码已存在于别处~~ 已与用户确认：**无 v0.1 代码，从零开始**，T01 起按完整范围执行（见调整记录 #1）。

## T01 最小骨架可挂载

- **状态**：✅（完成日期：2026-08-23）
- **前置**：T00
- **内容**：`package.json`（dsh.bundle.patch + dsh.client 声明、peer 含 dsh-better-sidebar optional）+ `cordis.patch.yml` + 空 host 半（`ctx.webServer.register` 前缀就绪）+ client 半手写 `__ModuleLoader__.load` wire format，仅渲染浮动图标 + 空抽屉（非模态、无蒙层、z-index 30、`data-dsh-cmd-pad` 锚点；better-sidebar 角落按钮簇在场时顶栏 ✕ 左移避让）。
- **完成定义**：
  - [x] `dsh plugin --profile web add` 安装成功（`dsh.profile.bundles` 协调 + `node_modules/dsh-cmd-pad` junction 确认）；
  - [x] 重启 `dsh web` + 硬刷新后浮动图标出现，抽屉开合正常（用户实测通过，2026-08-23）；
  - [x] 控制台零报错；Esc / ✕ / 再点图标三种关闭途径均生效（用户实测通过，2026-08-23）。
- **完成证据**：
  - wire format 静态实证：`node` 模拟 `__ModuleLoader__.load` 全流程——id=`dsh-cmd-pad`、factory 导出 `apply`、`ctx.effect` 返回 disposer 且 dispose 幂等，全部通过；
  - host 半 ESM 冒烟：`name`/`inject:['webServer']`/`apply` 导出正常；`cordis.patch.yml` 经 js-yaml 解析为 `[{insert:[{id:'cmd-pad',name:'dsh-cmd-pad'}]}]`；
  - 安装协调：profile `package.json` 的 `dependencies` 增 `dsh-cmd-pad: link:`，`dsh.profile.bundles` 追加 `dsh-cmd-pad`；
  - **用户实测（2026-08-23）**：重启 + 硬刷新后浮动图标出现、抽屉开合正常、Esc / ✕ / 再点图标三种关闭途径生效、控制台零报错；
  - 实测发现并修复：顶栏 ✕ 与 better-sidebar 右上角按钮簇重叠（按钮簇 z-index 45 > 抽屉 30）→ 新增 `applyClusterOffset` 避让，`node` 模拟验证两场景（有/无按钮簇）通过（见调整记录 #4）。
- **风险假设结论**：手写 wire format 在目标 DSH 版本可用性——对照 `dsh-client-modules` 源码（`graphRow`/`arrive`/`materialize` 全链路）与官方 bundle 产物逐条核对 + 本包模拟执行均通过，且**用户真机页面实测通过**，风险假设闭环。
- **备注**：~~若 v0.1 代码已存在于别处~~ 与 T00 一致（无 v0.1 代码，从零开始）；分工边界见调整记录 #3（本会话为执行会话）。

## T02 host 半数据层

- **状态**：✅（完成日期：2026-08-23）
- **前置**：T01
- **内容**：`/cmd-pad/api/library`（GET/PUT）+ `/cmd-pad/api/state`（PUT）；commands.yml + state.json 读写；原子写（临时文件 + rename）+ `.bak` 备份；串行写队列；Host 头信任围栏；迷你 YAML 读写器（动态加载 `yaml` 包优先）。
- **完成定义**：
  - [x] curl 直接打 API：手改 yml 能 GET 读回；PUT 后文件正确且生成 `.bak`；
  - [x] 非法 yml 输入不破坏既有文件（读回退到 `.bak` 或报错不写入）；
  - [x] 连续并发 PUT 不交错损坏（串行队列生效）。
- **完成证据**：
  - 验收 harness：`dsh-cmd-pad/test/t02-data-layer.test.mjs`（`node test/t02-data-layer.test.mjs`）**33/33 通过**——迷你 YAML 解析/序列化/往返/错误面 15 项、原子写+串行队列 2 项、API 全链路（真实 node:http + 模拟 cordis ctx + 真实 apply）11 项、信任围栏 3 项、yaml 动态加载 1 项、路由/边界 1 项；
  - **真实 curl 实证**（临时服务加载插件真实代码，端口 39876）：手改 yml GET 读回 ✅；PUT 后 commands.yml 内容精确正确 + `commands.yml.bak` 保留写前内容 ✅；非法 body（BOM 前缀 JSON）→ 400 且文件未动 ✅；恶意 Host / `Sec-Fetch-Site: cross-site` → 403、正常 → 200 ✅；state 两次增量 PUT 合并（含嵌套 `viewLastUsedAt`）✅；20 并发 PUT 全 ok 且最终文件恰为 1 条完整命令（无交错）✅；
  - ESM 冒烟：`name`/`inject:['webServer']`/`apply`/`internals` 导出正常；`node --check` 全过；
  - **真实 GUI 复核**（2026-08-23，用户重启 `dsh web` 后，PID 42492）：curl 打 127.0.0.1:3080——GET 200 结构正确；PUT 落盘精确 + mtime 更新；二次 PUT 后 `.bak` 保留前次内容；非法 JSON → 400 且文件未变；恶意 Host → 403、正常 → 200。
- **备注**：此步不碰页面（client.js 未动——重叠修复见调整记录 #6，属 T01 缺陷在 T02 阶段修复）。数据层实现要点与 curl 复核命令见 `dsh-cmd-pad/README.md`「数据层（T02）」。

## T03 抽屉只读浏览 + 复制（F2/F3/F5）

- **状态**：✅（完成日期：2026-08-23）
- **前置**：T02
- **内容**：分组侧栏（上次/全部/项目/常驻/▸更多，设计文档 §3.3 去图标版）、命令卡片、全局搜索（命中高亮/计数/Esc 清空）、一键复制 + Toast；项目识别走会话 cwd；全量令牌样式（视觉规范 §1/§2）。
- **完成定义**：
  - [x] 分组结构与排序符合设计文档 §3.3；多项目重名消歧正确；
  - [x] 复制内容原样进剪贴板（含多行 && 命令）；
  - [x] 明暗切换 + 至少 2 款皮肤（含 1 款玻璃皮）目检通过；
  - [x] 视觉规范 §6 验收清单全过。
- **完成证据**：
  - 验收 harness：`dsh-cmd-pad/test/t03-browse-copy.test.mjs`（`node test/t03-browse-copy.test.mjs`）**29/29 通过**——纯逻辑 9 项（项目分组判定/路径末段/重名消歧/聚合/分组模型排序/上次 slot 有效性/视图命令/搜索匹配/会话探测）+ DOM 渲染 14 项（侧栏结构/更多展开/视图切换/全部视图分节/一键复制含多行 &&/命令块点击/危险 pill/搜索过滤计数高亮/Esc 清空//聚焦/空态/slot 失效隐藏）+ 视觉规范 §6 静态检查 6 项（无裸硬编码色值/无 emoji/类名全 cmd-pad- 前缀/仅 2 处单色 SVG/z-index 层级/纯逻辑面导出完整）；
  - **回归**：t02-data-layer 33 + t02-cluster-offset 7 + t03-drawer-layout 12 全过（共 52 项，T01/T02 功能未破坏）；`node --check` 全过；
  - **WebBridge 真机实证**（真实浏览器，截图见 `dsh-cmd-pad/test/shots/t03-*.png`）：
    - 浮动图标出现；抽屉打开后侧栏结构正确（全部/项目：dshplugin/未分组/common/perf/▸更多（2））、上次 slot「上次：perf」、全部视图 8 张卡片分节正确；
    - 顶栏 ✕ 与 better-sidebar 按钮簇避让生效（padding-right=77.66px）；占用式推挤生效（#root margin-right calc）；
    - 搜索 'rm' → 命中 log-clean + 计数「命中 1 条」+ 高亮 span；Esc 清空恢复；未分组视图、更多展开（其他项目+分组小节）正确；
    - **明暗切换**（设置页 UI 按钮级）：浅色白底深字 ↔ 暗色深底浅字，抽屉/卡片/输入框全令牌跟随；
    - **皮肤跟随**：宿主当前未暴露皮肤中心 UI，按视觉规范 §1.1 机制在变量定义层覆盖 `--dsw-alias-*`（= 皮肤中心行为）验证——玻璃半透明皮 + 暖色纸感皮均完整跟随（抽屉/卡片/输入框/选中行/危险色全变），令牌契约成立；
    - **复制**：合成点击（无用户手势）下浏览器拒绝 clipboard.writeText → 代码正确走降级链 → Toast「复制失败」（error 样式明示）；成功路径由 node 测试断言剪贴板原样（含多行 &&）+ 待用户真实点击复核（见调整记录 #12）。
- **备注**：真机验证时写入的演示命令库已清理恢复（commands.yml 回空库）。「上次使用」刷新为 PUT /api/state（机器状态），命令库零写（见调整记录 #10）。

## T04 写操作（F6/F7/F8）

- **状态**：⬜
- **前置**：T03
- **内容**：添加（分组多选/当场新建/默认勾选规则）、编辑、语境化删除（解关联 vs 彻底删除 + 确认 + 5s 撤销）、右键菜单（分组：常驻/重命名/删除；卡片：运行/复制/编辑/删除）、state.json 持久化（pinned/lastUsedView）。
- **完成定义**：
  - [ ] 连续增删改 20+ 次后 yml 始终合法、分组聚合正确；
  - [ ] 删除语义符合设计文档 §3.5（含分组删除的影响确认弹窗）；
  - [ ] 撤销可还原；重命名级联更新且冲突拒绝；
  - [ ] 手改 yml 后面板重新打开自动生效。
- **依赖调整点**：若 T02 的原子写/备份在实测中有缺陷，必须先回 T02 修复再继续——写操作的错误面直接放大数据层缺陷。

## T05 运行（对话输入框通道）+ 危险确认（v0.1 闭环）

- **状态**：⬜
- **前置**：T04
- **内容**：「运行」= `ctx.get('conversation')` 探测 + `setDraft` 写对话输入框；通道不可用降级复制 + Toast 明示；`danger: true` 确认弹窗（完整命令原文）；保存时危险关键词提示勾选。
- **完成定义**：
  - [ ] 运行后输入框内容正确、不自动发送；
  - [ ] conversation 服务缺失时降级复制 + Toast；
  - [ ] 危险命令必须经确认弹窗才入输入框；
  - [ ] 浏览/搜索/切换分组等任何非点击行为不触发执行。
- **里程碑**：v0.1 功能闭环 → 打 tag `v0.1.0`。

## T06 better-sidebar Tab 主形态（v0.2 起点）

- **状态**：⬜
- **前置**：T05
- **内容**：`ctx.get('betterSidebar')` 探测 + `ctx.effect(() => registerTab(...))`（id `cmd-pad:pad`、order 45、single、图标按视觉规范 §3.2）；React 桥接组件（`require('react')`，ref 挂载纯 DOM 面板，scope 变化重挂，`visible` 性能门）；badge 与 onActivate 走 `features` 能力门；插件设置走 `settings.pluginToggles`（能力门后）。
- **完成定义**：
  - [ ] 主形态：设置页「侧边卡片」出现「命令」卡片；+ 菜单出现「命令」（终端与浏览器之间）；Tab 内功能与抽屉完全等价；
  - [ ] 主形态下无任何自建浮层（浮动图标/抽屉不出现）；
  - [ ] 降级形态：禁用/卸载 better-sidebar 后浮动图标 + 抽屉照常，控制台零报错；
  - [ ] `onActivate` 拉取最新命令库生效（多标签页/手改 yml 场景）；
  - [ ] HMR/禁用重载无 `already registered` 报错。
- **依赖调整点**：若 T01 的 wire format 与 React 桥接冲突（如 `require('react')` 不可用），调整桥接方案并更新接入规范 §1.3——内容区代码必须保持两形态 100% 复用。

## T07 终端直写通道（实验性，最后做）

- **状态**：⬜
- **前置**：T06
- **内容**：三级降级链第一级——按接入规范 §3.3 流程选终端（排除 `agent:` 前缀）→ 短命 WS 附加 `/sidebar/ws/terminal` 发送命令（危险命令不带 `\r`）→ bare drop；失败降级对话输入框 → 再降级复制 + Toast。**先实机验证双 WS 附加**（设计文档 §8 待确认项 1），不通过则落地保守方案（openTab + 复制 + Toast「已复制，到终端粘贴执行」）。
- **完成定义**：
  - [ ] 双 WS 附加实机验证结论写入「调整记录」（通过/不通过 + 证据）；
  - [ ] 运行命令落位正确，用户侧终端视图不受干扰；
  - [ ] 终端配额满/被设置禁用/无终端时降级链逐级生效；
  - [ ] 危险命令停在提示符不回车。
- **里程碑**：v0.2 功能闭环 → 打 tag `v0.2.0`。

## T08 收尾与硬化

- **状态**：⬜
- **前置**：T07
- **内容**：设计文档 §7 功能清单逐项核对销项；P1/P2 项（导入导出 F14、拖拽排序 F15 等）按实际价值另行立项；README 安装/使用说明；两种环境 + 明暗/换肤全量回归。
- **完成定义**：
  - [ ] F1–F13 全部 ✅ 且回归通过；
  - [ ] README 完备；总目标达成。

---

## 调整记录

> 格式：`日期 | 任务 | 事实 | 影响与调整`。新记录追加在末尾，不删旧记录。

| 日期 | 任务 | 事实 | 影响与调整 |
|---|---|---|---|
| 2026-08-23 | T00 | #1 用户确认无 v0.1 代码，项目从零开始（设计文档头注「v0.1 代码已落地」为超前描述） | T00 保持纯文档基线；T01 起按完整范围执行，无代码校准工作 |
| 2026-08-23 | 全部 | #2 用户明确分工：**本对话（协调会话）不修改代码**，只维护文档/规范/任务账本；代码实现由其他对话（执行会话）完成 | 执行会话开工前读 AGENTS.md 硬规则与本文件前置状态；实现完成后由协调会话按执行会话的验证反馈更新状态与完成证据、维护调整记录 |
| 2026-08-23 | T01 | #3 用户在本次会话明确选择「由 AI 直接实现 T01」（覆盖 #2 对本对话的协调角色限定）；AGENTS.md 已同步为「执行会话写代码、协调会话只维护账本」双会话分工 | 本会话按执行会话角色完成 `dsh-cmd-pad/` 初版（package.json / cordis.patch.yml / host 半 / client 半 / README）+ `dsh plugin --profile web add` 安装 + 静态验证；T01 标 🚧（运行时目检需重启 `dsh web` 当前 GUI 宿主，重启补验后转 ✅） |
| 2026-08-23 | T01 | #4 用户真机实测：T01 全部完成定义通过，但发现**抽屉顶栏 ✕ 与 better-sidebar 右上角按钮簇重叠**（按钮簇 `[data-dsh-toggle-cluster]` z-index 45 > 抽屉 30，盖住 ✕） | T01 转 ✅；新增 `applyClusterOffset` 避让（挂载时探测按钮簇，右缘可见时顶栏 `padding-right = 视口宽 - 按钮簇左缘 + 8px`），`node` 模拟两场景通过；同步更新接入规范 §5.5 与视觉规范 §4.2（交互面/视觉双文档，规则 10） |
| 2026-08-23 | T02 | #5 本会话按执行会话角色（同 #3）完成 T02 host 半数据层：三条完成定义均为 API 级、不依赖 GUI，故以「验收 harness 33/33 + 真实 curl 实证（临时服务加载真实 apply 代码）」闭环，无需重启 GUI 即可完成验证 | T02 转 ✅；host 半改动需重启 `dsh web` 生效——新 GUI 上按 README「数据层（T02）」curl 复核（手改 yml 读回 / PUT+.bak / 非法输入不破坏 / 并发）由用户执行，复核无回归即进入 T03；T03 起前端消费本 API，数据层已具备写操作地基 |
| 2026-08-23 | T01（缺陷，T02 阶段修复） | #6 用户重启 `dsh web` 后实测：**抽屉 ✕ 仍与 better-sidebar 右上角按钮簇重叠**。排查：实际安装为 better-sidebar **v0.13.1**，按钮簇（CSS Modules 哈希类 `.nArs4W_toggleCluster`，fixed top:3px right:10px，z-index 45）**没有** `[data-dsh-toggle-cluster]` 锚点——该锚点是 v0.15.1 快照实证的；T01 的 `applyClusterOffset` 单锚点 `querySelector` 落空，避让从未生效 | 修复为**双锚点探测**（`findClusterRect`）：① `[data-dsh-toggle-cluster]`（v0.15.1+ 优先）；② `[data-dsh-better-sidebar]` 宿主内几何探测（顶部 top≤40px 且右缘贴近视口右缘的可见按钮，取最右者量其父容器）；并**每次抽屉打开时重算**（better-sidebar React 挂载时序不定）。验证：node 模拟 7 场景全过（`test/t02-cluster-offset.test.mjs`）；WebBridge 真实浏览器实证——按钮簇 right≈1697（视口 1707）、避让后 ✕(1602–1630) 与按钮簇(1637–1697) 间距 7px、overlap=false、截图 ✕ 清晰可点；同步更新接入规范 §5.5 与视觉规范 §4.2（规则 10） |
| 2026-08-23 | 降级形态（T03 前） | #7 用户反馈体验差异：better-sidebar 面板是**占用式窗口**（打开时 `#root` margin-right 推挤，主页面左移让位，不遮任何内容）；而 cmd-pad 降级抽屉是 **fixed 浮层覆盖**（不推挤布局，直接盖在页面上，遮挡对话输入框） | 降级抽屉改为**占用式布局**（`pushLayoutForDrawer`）：打开时给 `#root` 注入 `margin-right: calc(var(--dsh-sidebar-width,0px) + 抽屉宽)`（与 better-sidebar 变量并存、两面板同开 margin 相加），关闭/卸载移除（回退 better-sidebar 规则）、窗口 resize 重算。验证：node 模拟 7 场景全过（`test/t03-drawer-layout.test.mjs`）；WebBridge 真机实证——`#root` computedMargin=360.7px（页面左移）、对话输入框 right 1199 < 抽屉 left 1347（`inputCoveredByDrawer=false`）、截图输入框完整可见、面板呈独立窗口占位；同步更新接入规范 §5 与视觉规范 §4.5（规则 10） |
| 2026-08-23 | 降级形态（T03 前） | #8 用户反馈：抽屉宽度固定（min(360,92vw)），不支持像 better-sidebar 面板那样拖左缘调整宽度 | 新增**拖拽分栏**（`attachResize`）：抽屉左缘 8px 把手（pointer 事件），宽度 clamp `[280, min(92vw, 视口-320)]`；拖动中 `#root` transition 禁用（margin 即时跟随指针）、抽屉加 `[data-dragging]`；宽度 localStorage 持久化（`dsh-cmd-pad:drawerWidth`，刷新/重开恢复），resize 时超上限自动 clamp。验证：`test/t03-drawer-layout.test.mjs` 扩至 **12 场景全过**；WebBridge 真机实证——拖 200px 宽 361→561、margin 实时同步 `calc(+561.33px)`、pointerup 后 `data-dragging` 清理 + localStorage=561、刷新恢复 561px、输入框仍不遮挡（`inputCovered=false`）、与 better-sidebar 面板并存时 margin 相加 868px 两面板完整显示；同步更新接入规范 §5 与视觉规范 §4.5（规则 10） |
| 2026-08-23 | 降级形态（T03 前，设计决策） | #9 讨论：better-sidebar 面板与 cmd-pad 抽屉**同时打开**时，margin 相加会把主页面挤到很小（实测 868/1707）。用户决策：**过渡期保持现状**（不做动态上限协调），接受相加；**T06 主形态为根本解**（cmd-pad 注册为 better-sidebar Tab，不再存在两个独立窗口；降级抽屉仅在 better-sidebar 完全不在场时出现，无并存场景）；并给出参考参数：**主内容最小保留宽度 = 视口 40%** | 本阶段不改代码。决策与参数记入账本：若未来（T06 主形态或后续）涉及两占用式窗口并存/布局协调，以「主内容 ≥ 视口 40%」为约束；现有 `calc` 并存与 resize clamp 机制保留（用户可手动拖窄缓解）；T03 起按此决策推进，无需为此改动 |
| 2026-08-23 | T03 | #10 「零写操作」边界澄清：T03 备注「零写操作」指**命令库（commands.yml）零写**；复制成功时按功能文档 §3.4「刷新时机：在该视图语境下运行/复制命令」更新「上次使用」——PUT `/api/state`（lastUsedViewId / viewLastUsedAt）是机器状态写，属 §3.4 明确定义的刷新行为，不违背 T03 只读定位 | 实现含 state 刷新（本地即时 + 远端持久化，失败静默）；命令库零写零执行保持不变 |
| 2026-08-23 | T03 | #11 设计决策（未见于文档细节，按文档语义落定）：①「全部」/「未分组」视图语境下复制时，lastUsed 指向命令**第一个所属分组**（`all` 不作为 lastUsed 存储——slot 点击需跳转具体视图才有价值）；② 抽屉初始视图 = 全部；③ 搜索态**平铺**命中命令（计数 = 命中命令数，不按分组分节——避免多分组命令重复计数） | 已实现并测试锁定（t03-browse-copy B6/B10 等）；后续任务（T04 添加/编辑）按「搜索态平铺 + 全部视图分节」语义延续 |
| 2026-08-23 | T03 | #12 真机验证（WebBridge 控制真实浏览器）发现两条环境限制：① 当前宿主 dsh-web-ui **未暴露皮肤中心 UI**（设置→通用设置仅浅色/深色/跟随系统），视觉规范描述的「皮肤中心 10 款皮肤」入口不在场；② 浏览器安全边界：`navigator.clipboard.writeText` 要求**用户手势**，webbridge 合成点击（`isTrusted=false`）被浏览器拒绝，代码正确走 fallback（execCommand）→ 仍无手势 → Toast「复制失败」error 明示 | ① 皮肤目检以**变量覆盖模拟**完成（在变量定义层覆盖 `--dsw-alias-*` 即皮肤中心机制）：玻璃半透明皮 + 暖色纸感皮均完整跟随（computed style 实证 + 截图），令牌契约成立；待有皮肤中心的环境补走真 UI。② 复制成功路径由 node 测试断言剪贴板原样（含多行 &&）+ 待用户真实点击复核；失败降级链真机已验证闭环。两条均不影响 T03 完成定义达成 |
| 2026-08-23 | T03 | #13 用户实测反馈：**抽屉布局错乱——搜索框不在上方**。根因：`.cmd-pad-drawer-body` 缺 `flex-direction:column`（flex 默认 row），搜索栏与内容区**水平并排**、搜索框挤占左侧一大块 | 修复：body 加 `flex-direction:column`、search 加 `flex:none`（固定顶部一行不拉伸）；测试新增 **C7 静态断言**（body 纵向 + search 不拉伸 + DOM 顺序 search 先于 layout）防回归；WebBridge 真机复核——`flex-direction:column`、search 全宽横贯顶部、layout 在其下，截图 `test/shots/t03-fixed-layout.png` |

## 已知风险登记（开工即知，随任务推进复核）

1. **手写 wire format**（T01 验证）——不可用则 bundle 方案整体调整；
2. **终端 WS 是未文档化内部协议**（T07 验证）——better-sidebar 每次升级后回归；当前快照 v0.15.1 实证可用，但 tab id 为 `terminal:<uuid>` 且须排除 `agent:` 前缀（接入规范 §3.2）；
3. **conversation 服务探测**（T05）——`ctx.get('conversation')` 在目标 DSH 版本的可用性待实测，缺失时保底 = 复制 + Toast；
4. **皮肤令牌覆盖度**（T03 起每次目检）——玻璃皮肤的 `bg-base` 半透明问题按视觉规范 §1.1 第 5 条处理。
