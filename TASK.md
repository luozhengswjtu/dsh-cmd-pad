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

- **状态**：⬜
- **前置**：T02
- **内容**：分组侧栏（上次/全部/项目/常驻/▸更多，设计文档 §3.3 去图标版）、命令卡片、全局搜索（命中高亮/计数/Esc 清空）、一键复制 + Toast；项目识别走会话 cwd；全量令牌样式（视觉规范 §1/§2）。
- **完成定义**：
  - [ ] 分组结构与排序符合设计文档 §3.3；多项目重名消歧正确；
  - [ ] 复制内容原样进剪贴板（含多行 && 命令）；
  - [ ] 明暗切换 + 至少 2 款皮肤（含 1 款玻璃皮）目检通过；
  - [ ] 视觉规范 §6 验收清单全过。
- **备注**：零写操作、零执行——最安全的组合先立住核心使用价值。

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

## 已知风险登记（开工即知，随任务推进复核）

1. **手写 wire format**（T01 验证）——不可用则 bundle 方案整体调整；
2. **终端 WS 是未文档化内部协议**（T07 验证）——better-sidebar 每次升级后回归；当前快照 v0.15.1 实证可用，但 tab id 为 `terminal:<uuid>` 且须排除 `agent:` 前缀（接入规范 §3.2）；
3. **conversation 服务探测**（T05）——`ctx.get('conversation')` 在目标 DSH 版本的可用性待实测，缺失时保底 = 复制 + Toast；
4. **皮肤令牌覆盖度**（T03 起每次目检）——玻璃皮肤的 `bg-base` 半透明问题按视觉规范 §1.1 第 5 条处理。
