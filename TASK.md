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
- **备注**：真机验证时的演示数据原已清理（commands.yml 回空库）；因用户反馈「空库无法复制」，重新写入 4 条演示命令（top-mem/log-clean/proj-test/multi-deploy，含多行与危险命令）供体验，用户可手改 commands.yml 或随 T04 添加功能管理。「上次使用」刷新为 PUT /api/state（机器状态），命令库零写（见调整记录 #10）。

## T04 写操作（F6/F7/F8）

- **状态**：✅（完成日期：2026-08-23）
- **前置**：T03
- **内容**：添加（分组多选/当场新建/默认勾选规则）、编辑、语境化删除（解关联 vs 彻底删除 + 确认 + 5s 撤销）、右键菜单（分组：常驻/重命名/删除；卡片：运行/复制/编辑/删除）、state.json 持久化（pinned/lastUsedView）。
- **完成定义**：
  - [x] 连续增删改 20+ 次后 yml 始终合法、分组聚合正确；
  - [x] 删除语义符合设计文档 §3.5（含分组删除的影响确认弹窗）；
  - [x] 撤销可还原；重命名级联更新且冲突拒绝；
  - [x] 手改 yml 后面板重新打开自动生效。
- **完成证据**：
  - 验收 harness：`dsh-cmd-pad/test/t04-write-ops.test.mjs`（`node test/t04-write-ops.test.mjs`）**25/25 通过**——纯逻辑 7 项（id 生成/危险关键词词边界/默认勾选规则/删除计划/分组删除影响/重命名级联与冲突/常驻切换）+ DOM 交互 18 项（顶栏 + 添加/表单弹窗默认勾选/保存 PUT/新建分组/危险提示/编辑预填/右键菜单/静默解关联/确认彻底删除/5s 撤销恢复/分组删除影响弹窗/重命名冲突弹窗保留/常驻切换持久化/常驻无命令显示/**22 次连续增删改 yml 始终合法**/手改 yml 重开生效/Esc 链/菜单自动关闭）；
  - **回归**：t03-browse-copy 30 + t02-data-layer 33 + t02-cluster-offset 7 + t03-drawer-layout 12 全过（全套 107 项）；
  - **WebBridge 真机实证**（截图见 `dsh-cmd-pad/test/shots/t04-*.png`）：顶栏「+ 添加」→ 表单弹窗（默认勾选上次使用分组、分组多选）→ 填表保存「已添加」新命令出现；右键卡片「复制/编辑/删除」→ 编辑预填改名保存「已保存」；彻底删除确认弹窗 → 删除 → Toast「已删除（5 秒内可撤销）」→ 点撤销恢复「已撤销」；分组右键「设为常驻」→ state.json `pinnedGroups` 持久化 + 侧栏重排；分组删除影响弹窗文案精确（「2 条命令解除关联，其中 1 条仅此分组的将彻底删除」）；重命名冲突拒绝（Toast + 弹窗保留）；危险关键词 'format c: /q' → 提示 + 自动勾选危险；
  - 真机验证中发现并规避：PowerShell `ConvertTo-Json` + `Invoke-RestMethod` 的 body 按 ANSI 传输导致中文变 `?`（数据损坏，非插件 bug）——改用 node fetch（UTF-8）重写演示数据（见调整记录 #14）。
- **备注**：右键菜单「运行」项按路线图在 T05 随运行通道加入（T04 菜单为复制/编辑/删除三项，见调整记录 #15）。演示命令库保留供体验（含 1 条危险命令）。

## T05 运行（对话输入框通道）+ 危险确认（⏸️ 挂起：用户决策移除运行，等完善方案补全）

- **状态**：⏸️（挂起——运行功能按用户决策**整体移除**，见调整记录 #21；完善方案（如 T07 终端直写）落地后恢复本任务范围）
- **前置**：T04
- **内容**：（已撤回实现）「运行」= `ctx.get('conversation')` 探测 + `setDraft` 写对话输入框；通道不可用降级复制 + Toast 明示；`danger: true` 确认弹窗（完整命令原文）；保存时危险关键词提示勾选。
- **完成定义**：（随运行功能移除全部撤回，代码已回退）
  - [ ] ~~运行后输入框内容正确、不自动发送~~（方案被否）
  - [ ] ~~conversation 服务缺失时降级复制 + Toast~~（方案被否）
  - [ ] ~~危险命令必须经确认弹窗才入输入框~~（方案被否；`danger` 标记本身保留：卡片「危险」徽标 + 保存时关键词提示勾选，供未来运行通道恢复时做二次确认）
  - [ ] ~~浏览/搜索/切换分组等任何非点击行为不触发执行~~（方案被否）
- **撤销证据**（记录曾完成的工作，供未来恢复参照）：
  - 曾实现：卡片「运行」按钮 + 右键菜单「运行」、conversation `setDraft` 替换式写入（探测链 `ctx.get('sessions').scope(id)` → `ctx.get('conversation').input.for(actx)`，对齐 better-sidebar `conversation-draft.ts`）、危险确认弹窗（`.cmd-pad-modal-pre` 命令原文块）、降级复制 + Toast；
  - 曾验收：`t05-run.test.mjs` 14/14 + 全套 121 项回归 + WebBridge 真机实证（截图曾存 `test/shots/t05-*.png`）——**2026-08-23 用户评估后否决该方案，以上实现与测试已全部移除/回退**，当前工作区回归 **107 项全过**（t02-data-layer 33 + t02-cluster-offset 7 + t03-drawer-layout 12 + t03-browse-copy 30 + t04-write-ops 25）；
  - 现状：卡片仅「复制」按钮，右键菜单 = 复制/编辑/删除，表单危险勾选标签已改为「危险命令（卡片显示危险徽标；未来运行通道恢复时需二次确认）」。
- **里程碑**：~~v0.1 功能闭环 → tag `v0.1.0`~~ **已撤销**：`v0.1.0` tag 已删除（本地未推送），运行不在 v0.1 范围；v0.1 里程碑重新定义为「浏览/复制/写操作闭环」，待未来决定是否补 tag。

## T06 better-sidebar Tab 主形态（v0.2 起点）

- **状态**：✅（完成日期：2026-08-23）
- **前置**：T04（T05 挂起：运行功能已移除，主形态与抽屉均无运行按钮，等价性不受影响；未来运行方案落地时主形态一并接入）
- **内容**：`ctx.get('betterSidebar')` 探测 + `ctx.effect(() => registerTab(...))`（id `cmd-pad:pad`、order 45、single、图标按视觉规范 §3.2）；React 桥接组件（`require('react')`，ref 挂载纯 DOM 面板，scope 变化重挂，`visible` 性能门）；badge 与 onActivate 走 `features` 能力门；插件设置走 `settings.pluginToggles`（能力门后）。
- **完成定义**：
  - [x] 主形态：设置页「侧边卡片」出现「命令」卡片；+ 菜单出现「命令」（终端与浏览器之间）；Tab 内功能与抽屉完全等价；
  - [x] 主形态下无任何自建浮层（浮动图标/抽屉不出现）；
  - [x] 降级形态：禁用/卸载 better-sidebar 后浮动图标 + 抽屉照常，控制台零报错；
  - [x] `onActivate` 拉取最新命令库生效（多标签页/手改 yml 场景）；
  - [x] HMR/禁用重载无 `already registered` 报错。
- **完成证据**：
  - 架构：内容区核心提取为**共享工厂 `createCmdPadPanel(ctx, opts)`**（状态/渲染/写操作/事件绑定/键盘，两形态 100% 复用）；`apply` 先 `probeBetterSidebar(ctx)`（ctx.get → ctx 直读回退，AGENTS 硬规则 1），有 → `registerMainTab`（React 桥接组件 ref 挂纯 DOM 面板 + scope deps 重挂 + `setVisible` 性能门），无 → 降级浮动图标 + 抽屉（原逻辑）——`require('react')` 不可用时自动回退降级（T06 依赖调整点闭环，未触发）；
  - 验收 harness：`dsh-cmd-pad/test/t06-main-form.test.mjs`（`node test/t06-main-form.test.mjs`）**14/14 通过**——探测链 1 + descriptor 字段（id/title/order 45/single/单色 SVG icon）1 + 能力门 3（badge 已移除·能力门与否均不注册 / onActivate / pluginToggles）+ 无浮层 1 + react 不可用回退 1 + HMR 二次 apply 1 + React 桥接 6（挂载渲染/scope 重挂/visible 门/onActivate 刷新/插件设置 openToLastUsed/主形态 Esc 链）；
  - **回归**：t04-write-ops 25 + t03-browse-copy 30 + t03-drawer-layout 12 + t02-cluster-offset 7 + t02-data-layer 33 全过（**全套 121 项**）；`node --check` 全过；
  - **WebBridge 真机实证**（真实浏览器，截图 `dsh-cmd-pad/test/shots/t06-settings-card.png` / `t06-main-tab.png`）：
    - 设置页「侧边卡片」分区出现「命令」卡片（与其他侧边卡片同列）✅；`+` 菜单出现「命令」（**终端与浏览器之间**，order 45 正确）✅；
    - Tab 内功能与抽屉等价：打开 Tab 内容区 = 搜索/分组条/卡片/+ 添加（搜索行右端）/复制（合成点击降级 Toast「复制失败」同抽屉）/添加表单弹窗，初始视图 = 上次使用分组（group:E:\KimiProGram\dshplugin → 跑测试）✅；
    - **主形态无浮层**：`.cmd-pad-fab` / `.cmd-pad-drawer` 均不存在 ✅；
    - **badge 曾显示命令总数**（6 → 手改 yml 加 1 条后 onActivate 刷新为 7）✅——**后按用户决策移除**（调整记录 #23：用户对 tab 角标「6」有异议，决定去掉），真机复核 Tab 无角标、图标换为命令列表符号（截图 `t06-tab-no-badge-new-icon.png`）；
    - **onActivate 保鲜**：API 手改命令库后切走再切回 Tab → 新命令「T06外部新增」出现在全部视图 ✅；
    - **visible 性能门**：cmd-pad tab 落在底部面板（宿主布局，见调整记录 #22）隐藏时内容挂起「加载中…」，展开面板后自动渲染完成（renderDirty 补渲）✅；
    - 降级形态真机未卸载 better-sidebar 验证（卸载影响宿主环境），由 harness M7 + 107 项旧测试覆盖（无 betterSidebar → fab+drawer 照常）。
- **依赖调整点**：T01 手写 wire format 与 React 桥接**无冲突**——`require('react')` 在 ModuleLoader 白名单内可用（真机实证）；桥接方案 = component(props) 返回 `createElement('div', {ref}, ...)`，宿主 `createElement(descriptor.component, props)` 渲染（不是直接函数调用），内容区两形态 100% 复用达成。

## T07 终端直写通道（实验性，最后做）

- **状态**：✅（完成日期：2026-08-23）
- **前置**：T06
- **内容**：主形态「运行」= **每次新开专用终端 Tab**（用户决策，调整记录 #24，不再复用活跃终端）→ 短命 WS 附加 `/sidebar/ws/terminal` 发送命令（等 shell 就绪提示符 `>` 后发送；危险命令不带 `\r`）→ **保持连接不 drop**（防 reconnect grace 到期杀 pty）；失败（配额满/禁用/新开被拒/WS 失败）→ `bs.closeTab` 回滚新 tab + **复制 + Toast「已复制，到终端粘贴执行」**（用户确认定稿：不再写对话输入框）；降级形态（无 better-sidebar）**无运行入口只复制**。先实机验证双 WS 附加（设计文档 §8 待确认项 1），通过后落地（非保守方案）。
- **完成定义**：
  - [x] 双 WS 附加实机验证结论写入「调整记录」（通过 + 证据，见调整记录 #24）；
  - [x] 运行命令落位正确，用户侧终端视图不受干扰（新开专用终端 + 双 WS 并存实证 + 端到端写文件副作用）；
  - [x] 终端配额满/被设置禁用/无终端时降级链逐级生效（真机实证：pty 配额满 → 回滚 + 复制降级）；
  - [x] 危险命令停在提示符不回车（确认弹窗 + 不带 \r 发送，真机实证命令停在提示符无执行）。
- **完成证据**：
  - 协议实证：`dsh-cmd-pad/test/t07-ws-probe.mjs`（node 原生 WebSocket 对实际安装 better-sidebar **v0.13.1**）——**13/13 通过**：A/B 双 WS 附加同一 pty 并存、B 写入 A 可见（用户侧视图不受干扰）、B 附加不重建 pty、危险命令不带 `\r` 停在提示符（tag 计数法：仅回显 1 次）、带 `\r` 后执行、双工对称、bare drop 后 pty 走 grace 存活；并实测发现 PowerShell 冷启动 6–7s 未就绪写入被吞（等待提示符的必要性）；
  - 验收 harness：`dsh-cmd-pad/test/t07-run.test.mjs` **17/17 通过**——纯逻辑 4（terminalTabsOf 双树遍历+agent 排除 / 差集识别新终端 / WS URL 构造 / 危险不带 \r）+ runner 成功路径 3（openTab 新开+scope / 危险确认后不带 \r / 等提示符防吞命令）+ 降级链 4（配额满复制 / WS error / WebSocket 缺失 / 宿主主动 close 回滚）+ DOM 交互 6（主形态运行按钮+降级无 / 右键首位 / 点击运行全链路 / 危险确认弹窗命令原文+确认 / 取消不运行 / Esc 关闭弹窗）；
  - **回归**：全套 **138 项全过**（t02-data-layer 33 + t02-cluster-offset 7 + t03-drawer-layout 12 + t03-browse-copy 30 + t04-write-ops 25 + t06-main-form 14 + t07-run 17）；`node --check` 全过；
  - **WebBridge 真机端到端实证**（真实浏览器 + 真实 dsh web，截图 `test/shots/t07-*.png`）：
    - **普通命令**：搜索 e2e 命令 → 点「运行」→ openTab 新开专用终端（底部面板出现 powershell tab）→ WS 附加（调试钩子确认：wsCreated→wsOpen→receivedLen 488→promptSeen→wsSent）→ **命令在终端执行，写文件副作用出现**（`cmdpad-e2e-mark.txt` 内容 = cmdpad-e2e-ok）；
    - **危险命令**：点 log-clean「运行」→ 确认弹窗（标题「运行危险命令」+ 命令原文 `rm -rf /data/log/*` + 取消/确认按钮）→ 确认 → toast「已写入终端，请在终端内确认后回车」→ 激活新终端读取：`PS E:\KimiProGram\dshplugin> rm -rf /data/log/*` **停在提示符、无执行错误输出**（不带 \r 双人工确认闭环）；
    - **降级链（pty 配额满）**：会话 pty 达 `terminalsPerSession=3` 后 run → 宿主 `ws.close(1011)` → 回滚新 tab + 复制降级（toast「复制失败」因浏览器无手势拒绝剪贴板，降级链本身走通）；
    - **实机发现并修复的 4 个问题**（均写入调整记录 #24）：① PowerShell 未就绪命令被吞 → 等提示符再发送；② 8s 总超时早于就绪等待误杀 → 总超时 30s；③ 新开终端 bare drop 会在 grace 30s 后杀 pty（长命令中断）→ 保持连接；④ WS 失败泄漏 UI tab → closeTab 回滚。
- **备注**：里程碑 **v0.2.0 tag 待打**（本地未推送；见调整记录 #24 讨论）。协议实证对象为 v0.13.1（实际安装版），与接入规范 §3（原 v0.15.1 快照实证）一致；**升级 better-sidebar 后必须回归**（t07-ws-probe + t07-run + §8 待确认项 1）。

## T08 收尾与硬化

- **状态**：✅（完成日期：2026-08-23）
- **前置**：T07
- **内容**：设计文档 §7 功能清单逐项核对销项；P1/P2 项（导入导出 F14、拖拽排序 F15 等）按实际价值另行立项；README 安装/使用说明；两种环境 + 明暗/换肤全量回归。
- **完成定义**：
  - [x] F1–F13 全部 ✅ 且回归通过；
  - [x] README 完备；总目标达成。
- **完成证据**：
  - **§7 逐项核对销项**：F1（主形态入口）/F9（scope.cwd）/F12（降级抽屉非模态无蒙层——T01 起即如此，静态核对）/F13（图标收敛——每形态恰 2 处单色 SVG，视觉规范 §6 静态检查锁定）由 🚧 转 ✅；F2–F8/F10/F11 维持 ✅；F14–F19（P1/P2）**另行立项**（见下方「后续立项」）——功能文档 §7 表格与 T08 销项注记已同步；
  - **全量回归 138 项全过**（`node --check` 全过）：t02-data-layer 33 + t02-cluster-offset 7 + t03-drawer-layout 12 + t03-browse-copy 30 + t04-write-ops 25 + t06-main-form 14 + t07-run 17；
  - **WebBridge 真机实证**（真实浏览器 + 真实 dsh web，截图 `dsh-cmd-pad/test/shots/t08-*.png`）：
    - 主形态入口：设置 → 侧边卡片 → 「命令 | cmd-pad:pad」在场（侧边栏内容 7 项）；底部面板 `+` 菜单展开「文件/源代码管理/任务管理/终端/**命令**/浏览器」——命令恰在终端与浏览器之间（order 45）✅；
    - 主形态无浮层：`.cmd-pad-fab` / `.cmd-pad-drawer` 均不存在（bs 在场）✅；
    - 面板内容：搜索框 + `+ 添加` + 分组条「全部 | 项目：dshplugin | 常用 2 | 性能采集 3 | 日志抓取 2」+ 命令卡片「跑测试 | npm test | 运行 | 复制」（主形态运行按钮在场）✅；
    - 搜索：输入 `test` → 命中计数「命中 1 条」+ `.cmd-pad-hit` 高亮 + 卡片过滤 ✅；
    - **明暗切换**：设置 → 通用设置 → 外观「深色」cube → body 加 `data-ds-dark-theme`、bg 255→21,21,23、cmd-pad 搜索框背景与卡片标题色随令牌翻转；切回「浅色」恢复（截图 light/dark 各一张）✅；
    - 降级形态由 107 项旧测试覆盖（不卸载 better-sidebar 验证，避免影响宿主环境，同 T06）。
- **备注**：**v0.2.0 tag 未打**（用户未要求，延续调整记录 #24 的结论；如需可随时补打，本地未推送）。P1/P2 另行立项清单见下方「后续立项」。功能文档 §7/§9、README（新增「使用说明」+「回归汇总」）已同步。

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
| 2026-08-23 | T04 | #14 真机验证工具教训：**PowerShell `ConvertTo-Json` + `Invoke-RestMethod` 的 `-Body` 按 ANSI/GBK 传输**，中文字符（分组名/标题）写入后变 `?`——T03 真机验证时侧栏分组名显示的乱码实为**数据损坏**（当时误判为传输显示问题）；插件 API 本身 UTF-8 正常（curl.exe / 浏览器 fetch PUT 均无此问题） | 后续写入含中文的命令库/state 一律用 **node fetch（UTF-8）或 curl.exe + UTF-8 文件**，禁用 PowerShell 管道直接 PUT；已用 node fetch 重写演示数据修复损坏文件；T03/T04 的 node 验收 harness 用 ASCII 分组名不受影响；此教训记入 README「curl 复核示例」旁 |
| 2026-08-23 | T04 | #15 T04 右键菜单范围裁剪：设计文档 §4.1 卡片右键含「运行」，但运行通道（对话输入框 setDraft + 危险确认）属 T05 内容 | T04 右键菜单实现为「复制/编辑/删除」三项（顶栏操作行同理仅复制）；「运行」在 T05 随运行通道一并加入菜单与卡片操作行，避免 T04 渲染半成品入口 |
| 2026-08-23 | T03/T04 | #16 **布局用户定稿**：用户实测反馈「左侧的分组区应在搜索下面，且要与命令区呈上下关系而非左右并列」——即分组区从**左侧竖栏**改为**搜索框下方横贯的横向 chip 条**（`flex-wrap:wrap`，最多 3 行），命令区占满剩余整宽 | 已改造：`cmd-pad-groups` 改横向容器（去 `cmd-pad-layout` 左右分栏）、分组行/chip 化（inline-flex、圆角 6px、名字截断省略号）、`cmd-pad-content` 占满整宽；测试 C7 断言更新（DOM 顺序 search→groups→content + groups flex-wrap + 无 layout 容器），**107 项全过**；WebBridge 真机复核（几何 + 截图 `test/shots/t03-layout-horizontal-groups.png`）：search 41–79 → groups 79–143（横贯 431px）→ content 143–842（整宽），右键菜单/常驻切换在 chip 上正常；同步更新视觉规范 §2（分组横条 chip 配方）与 README；功能文档 §3.3 的「侧栏」呈现以本记录为准（分组结构与排序不变） |
| 2026-08-23 | T03 | #17 **「上次使用」slot 用户定稿移除**：用户反馈「不要有上次这个标签分组了，打开就直接是这个项目上次打开的分组」——① 侧栏不再渲染「上次：xxx」标签；② 抽屉**打开时初始视图 = 上次使用的分组**（lastUsedViewId 有效时直接定位，失效回退「全部」）；③ 复制/运行刷新 lastUsedViewId 的机制保留（§3.4 刷新时机不变，只是从「标签展示」改为「打开即跳转」） | 已实现：`openDrawer` 置 `pendingInitialView` → 数据加载后 `activeView = lastUsed 有效 ? lastUsed.id : 'all'`；删除 `lastSlot` 函数与其 CSS；测试更新（B2 断言无 slot + 初始视图 = 上次分组；B6 复制后重开定位新分组；B13 失效回退全部；E16 适配），**107 项全过**；WebBridge 真机复核——lastUsed='group:常用' 重开即显示常用分组（截图 `test/shots/t03-initial-view-group.png`）、无「上次」标签；同步 README/视觉规范 §2（移除虚线框 chip 配方）；功能文档 §3.4「上次使用 slot」呈现以本记录为准（slot 交互语义保留，呈现改为打开即定位） |
| 2026-08-23 | T03 | #18 **复制 Toast 锚定用户定稿**：用户反馈「已复制的提示就在复制按钮的左侧才对」——Toast 不再固定视口右下角，改为**锚定到被点击的复制按钮/命令块左侧**（垂直居中，视口内 clamp，左侧放不下时放右侧）；其余 Toast（保存/删除/撤销等）保持右下角 | 已实现：`createToast` 增加可选 `anchor` 参数，`positionByAnchor` 计算左侧定位；`onCopyCommand(cmdId, anchorEl)` 由内容区点击委托传入复制元素；测试 B6 增补锚定断言（style.left 为 px + right=auto），**107 项全过**；WebBridge 真机复核——toast 显示于复制按钮左侧（toast 右缘 2042 < 按钮左缘 2086、垂直对齐 188≈189、styleRight=auto），截图 `test/shots/t03-toast-anchored.png`（合成点击复制失败分支同样锚定；成功分支同路径） |
| 2026-08-23 | T03 | #19 **Toast 停留时长用户定稿**：用户反馈「停留太久了，1s 够了」 | 普通提示（已复制/已保存/已删除等）显示时长 4s → **1s**；带操作按钮的 Toast（删除后「撤销」）保持 5s（与 5s 撤销窗口一致，保证用户来得及点撤销）；测试 107 项全过 |
| 2026-08-23 | T05 | #20 **setDraft 写入语义落定**：功能文档 §4.2「运行 = 写入对话输入框」未明示替换 vs 追加。better-sidebar 的 appendToDraft（@引用用）是空格分隔**追加**；「运行」语义是"让 Agent 执行这条命令"，落定为**替换式**——命令原文整体进入输入框，用户回车即执行，避免与既有草稿混杂（对应完成定义「输入框内容正确」）。Toast 文案：「已写入输入框，回车执行」；降级 Toast「运行通道不可用，已复制到剪贴板」（明示原因） | 已实现并测试锁定（t05-run R2/S2/S5）；探测链契约（`ctx.get('sessions').scope(id)` → `ctx.get('conversation').input.for(actx)` → `setDraft`）对齐 better-sidebar `conversation-draft.ts`，ctx.get 缺失时回退 `ctx.sessions`/`ctx.conversation` 直读，与接入规范 §5.6 的降级链一致 |
| 2026-08-23 | T05 | #21 **用户决策：运行功能整体移除**。T05 实现完成并经真机验证（14/14 harness + 121 回归 + WebBridge 实证）后，用户评估「运行 = 写对话输入框（回车让 Agent 执行）」方案不佳，明确要求**直接去掉运行功能**，「后面有完善的解决方案才补全」 | **代码全部回退**：卡片「运行」按钮、右键菜单「运行」、`writeComposerDraft`/`resolveSessionScope`/`resolveConversationInput`、危险确认弹窗（`.cmd-pad-modal-pre`）删除；卡片仅「复制」按钮、右键菜单 = 复制/编辑/删除（t04 E18 恢复）；表单危险勾选标签改「危险命令（卡片显示危险徽标；未来运行通道恢复时需二次确认）」；`t05-run.test.mjs` 与 t05 截图删除；当前回归 **107 项全过**。**T05 转 ⏸️ 挂起**（完成定义撤回，待完善方案——如 T07 终端直写——落地后恢复本任务范围）；`v0.1.0` tag **已删除**（本地未推送，里程碑撤销）；T06 前置改 T04（主形态与抽屉均无运行按钮，等价性不受影响）；T07 降级链第二级（对话输入框）待用户重新确认（见该任务备注）；同步更新 README、功能文档 §4.1/§4.2/§4.3/§7、接入规范 §5.6、视觉规范 §2 |
| 2026-08-23 | T06 | #22 **主形态落地 + 宿主落点观察**。T06 实现完成：内容区共享工厂 `createCmdPadPanel` 两形态 100% 复用；`registerMainTab`（React 桥接 + badge/onActivate/pluginToggles 能力门）；真机实证（设置页卡片 / + 菜单 order 45 / badge 6→7 / onActivate 手改 yml 保鲜 / 无浮层 / HMR）。**观察项**：cmd-pad tab 首次打开**落在 better-sidebar 底部面板**（该会话布局持久化的落点），面板隐藏时 `visible=false` → 内容挂起「加载中…」，展开面板后自动补渲染（性能门设计如此，非缺陷）；落点由宿主布局管理，插件不干预 | T06 转 ✅（14/14 harness + 121 回归 + WebBridge 实证，见完成证据）；接入规范增 §2.4 实现注记（badge 模块级缓存 / onActivate panel 注册表 / pluginToggles 读取 / 落点观察）；视觉规范 §3.2 定稿 Tab 图标（`>_` 终端符号）+ §3.3 主形态宿主容器配方；README 增「主形态（T06）」小节；T07 前置满足（可启动，但 T05 挂起注记仍适用） |
| 2026-08-23 | T06 | #23 **用户反馈：badge 角标与 Tab 图标**。① 用户问「命令 Tab 旁为什么有 6 字」——即 T06 按设计文档 §2.2 实现的**命令总数 badge**（命令库 6 条）；用户选择**去掉 badge**。② 用户反馈 Tab 图标（`>_` 终端符号）与 better-sidebar 内置 terminal 图标**几乎一样、容易混淆** | ① **badge 移除**：`descriptor.badge` 与模块级 `mainTabBadgeCount` 删除，主形态 Tab 不再显示数字角标（设计文档 §2.2 badge 行标记移除；README/接入规范 §2.4 同步；t06 M3 断言改为「能力门与否均不注册 badge」）。② **图标更换**为「命令列表符号」：rect 外框 + 提示符 `m4 5.75 1.5 1.5L4 8.75` + 两行命令线 `M7.75 7.25h3.75`/`M4 12h4.5`，与终端（居中 `>_` + 顶部窄边窗口）明显区分（视觉规范 §3.2 同步）。真机复核：Tab 无角标、新图标生效、与 powershell 终端 Tab 明显可辨（截图 `t06-tab-no-badge-new-icon.png`）；回归 **121 项全过**（t06 14/14 更新后） |
| 2026-08-23 | T07 | #24 **T07 落地 + 用户决策定稿 + 实机验证结论（双 WS 附加通过）**。① 用户决策（开工前确认）：**运行 = 每次新开专用终端 Tab 并在其中运行**（设计文档 §8 待确认项 2 的备选策略）；**终端直写失败 → 直接复制 + Toast**（不再写对话输入框，延续 #21）；**降级形态无运行入口只复制**。② **双 WS 附加实机验证 13/13 通过**（对实际安装 better-sidebar **v0.13.1**，`test/t07-ws-probe.mjs`）：同一 pty 多路 WS 并存、写入 A/B 互见、附加不重建 pty、危险命令不带 \r 停在提示符、双工对称、bare drop 走 grace 后 pty 存活——**设计文档 §8 待确认项 1 闭环，按 §4.2 落地（非保守方案）**。③ **实机发现 4 个协议级事实并修复**：a) PowerShell 冷启动 6–7s，shell 未就绪写入被吞 → **等输出流出现提示符 `>` 再发送**（25s 超时兜底）；b) 原 8s 总超时早于就绪等待 → 误杀本应成功的运行 → **总超时 30s**；c) **新开专用终端（无 UI 视图长连）发送后 bare drop 会在 reconnect grace（默认 30s）到期后杀 pty**，长命令/交互命令中断（实证：probe 附加 drop 后 UI 终端 pty 重建只剩 banner）→ **发送后保持连接不 drop**；d) **pty 配额 `terminalsPerSession`（默认 3）独立于 UI 配额**，附加被宿主 close(1011) 拒绝时 openTab 创建的 tab 泄漏 → **WS 失败时 `bs.closeTab` 回滚** | T07 转 ✅（17/17 harness + **138 项全套回归** + WebBridge 真机端到端实证：普通命令写文件副作用出现、危险命令停提示符无执行、pty 配额满降级回滚复制）；同步更新：接入规范 §3 解冻（实证状态 + 新流程 + 新陷阱）、设计文档 §4.2/§8/§9（v0.4：运行定稿 + 待确认项 1/2 闭环）、README「运行功能」；**T05 挂起注记保持**（其「完善方案」即本任务，T07 落地后 T05 范围实际被本任务覆盖，恢复与否留待用户定夺）；里程碑 v0.2.0 tag 未打（本地无推送需求，用户未要求；如需可在 T08 收尾时打） |
| 2026-08-23 | T08 | #25 **T08 收尾与硬化完成**。① §7 功能清单逐项核对：F1/F9/F12/F13 由 🚧 转 ✅（F1 主形态入口、F9 scope.cwd 为 T06 已落地但清单未更新；F12 非模态无蒙层自 T01 起即如此；F13 图标收敛由视觉规范 §6 静态检查锁定），F2–F8/F10/F11 维持 ✅。② P1/P2（F14–F19）**另行立项**：按实际价值评估后确认均不进入当前路线图，立项清单见文末「后续立项」小节。③ **全量回归 138 项全过** + WebBridge 真机实证（主形态入口 order 45 / 无浮层 / 面板内容 / 搜索命中 / 明暗切换令牌跟随，截图 t08-*.png）。④ 真机验证方法补充：better-sidebar `+` 菜单需**完整鼠标事件序列**（pointerdown→mousedown→pointerup→mouseup→click）才弹出，`el.click()` 合成点击无效；主题切换 = 设置 → 通用设置 → 外观 cube（`_8HJdBW_themeCube`），机制为 `body[data-ds-dark-theme]` 属性翻转令牌 | T08 转 ✅（总目标「按 v0.3 设计文档全部既定功能稳定运行」达成）；README 新增「使用说明」「回归汇总」、修正 t03 项数 29→30；功能文档 §7 销项注记 + §9 版本历史更新；**v0.2.0 tag 仍未打（用户未要求，延续 #24）**；「后续立项」小节记录 F14–F19 价值评估，供未来按需单独立项 |
| 2026-08-23 | T03（T08 后打磨） | #26 **用户反馈分组条「更多」细节打磨**（截图：`全部 | 项目：dshplugin | 常用 2 | ▾ 更多 | 分组 | 性能采集 3 | 日志抓取 2`）。①「更多展开区里为什么还要写个『分组』」——展开区内 `分组` 小节标题冗余；② 不需要显示「更多」两个字；③ 箭头图标放大一点点；④ 展开是**横向内联**的（更多 chip 流入同一行右侧），当前展开箭头 `▾`（向下）不符合横向展开的行业常规，要求按行业常规调整方向 | 已实现并测试锁定：① 移除 `分组` 小节标题（`其他项目` 小节保留以区分项目分组）；② 「更多」chip 改为**纯箭头图标**（无文字无计数，隐藏分组数移入 `title` 悬停提示，`aria-expanded` 标注状态）；③ 箭头字号 12px→**15px**（略放大）；④ 箭头方向按**横向展开行业常规**（VS Code 面板 `»/«` 式，箭头指向隐藏内容/收起方向）：**折叠 `▸`（U+25B8）→ 展开 `◂`（U+25C2）**。测试：t03 B2/B3 断言更新（纯箭头 + aria-expanded + title 计数 + 仅「其他项目」小节），t03 30/30、t04 25/25 全过；文档同步：功能文档 §3.3（结构图更新）、视觉规范 §2 chip 配方 + §3.1 图标规则、README「浏览与复制」 |
| 2026-08-23 | T03（T08 后打磨，发布准备） | #27 **发布版数据策略定稿 + 本机数据清理**。用户询问「这些是有些预设的（演示分组/命令），如果是发布版本呢」——确认：插件代码**零预设数据**（commands.yml 缺失→默认空库，仓库内无任何数据文件），演示命令仅存在于本机 profile 用户数据目录。用户决策：① **空库起步不加示例**（不引入 examples 模板/首次写入示例）；② 空库空态文案「还没有命令，可手改 commands.yml 添加」改为 **「等待添加」**；③ 清空命令库后分组条应只剩「全部」（+ 项目：cwd）——分组为聚合语义，命令删光分组自动消失；④ 本机清理：清空 commands.yml（PUT /api/library 空库，`.bak` 保留 6 条演示命令）+ state.json 重置 `{}`（原子写；清除 #14 遗留乱码 key `group:????`/`group:??`、pinnedGroups、lastUsedViewId） | 已实现：空态文案改「等待添加」（t03 B12 断言同步，**138 项回归全过**）；本机 profile 已恢复全新安装状态（`commands: []` + `state: {}`，API 实证 `{"library":{"commands":[]},"state":{}}`）；WebBridge 真机实证：分组条 `全部 | 项目：dshplugin`（性能采集/日志抓取消失、无更多箭头）+ 空态「等待添加」（截图 `t03-empty-state-v2.png`）；注意：本次 state.json 重置绕过 PUT /api/state（其为增量合并设计，无法删除键），走文件级原子写，需对 profile 目录有写权限；README 同步（空库空态说明） |
| 2026-08-2x | 全部（产品迭代） | #28 **用户产品迭代三项定稿**（「现在产品还有一些需要改的内容」）。① **运行终端一律落底部栏**：「不是落在当前活动面板，默认给我无论在哪点击，都是底部栏」——better-sidebar **无指定面板落点 API**（openTab 落在 activePane，`openTabInActivePane` reducer 实证），且 activateTab 不改变 `bottomOpen`（面板隐藏判定，实证 bundle 源码）→ 实现：**底部面板打开（`state.bottomOpen===true`）且底部树有既有 tab 时，先 `activateTab` 底部树任一 tab（把 activePane 切到底部树）再 openTab**（`firstBottomTab`，排除 `agent:`）；底部面板关闭/底部树无 tab 时降级当前行为（避免终端落在隐藏面板）。② **「常用」→「上次使用」动态视图**（用户确认：「是一个动态的上次使用的分组，只是视图，会跟着命令的使用，来更迭这里面的视图，**保留 100 条显示 20 条**，替换掉现在的常用分组」）：`state.json` 新增 `recentCommands`（`{id,at}` 去重置顶、上限 100）与 `recentScope`（`all|project`）；**复制成功/运行成功即记录**（运行走 runner 新增 `onSuccess` 回调）；视图只显示 20 条（已删除命令跳过）；分组条「常用」位置改为常驻视图 chip「上次使用」（无计数）；`defaultCheckedGroups` 兜底链移除「常用」步骤（上次使用 → 当前项目）。③ **「上次使用」视图内 项目/全部 范围切换 + ⓘ 帮助**（用户确认：「这个是针对上次使用分组的，这个分组是一个视图的概念，用以快速找到上次使用的命令」）：视图顶部工具栏 = 二选一分段控件（`项目 | 全部`，`aria-pressed`，`recentScope` 持久化）+ **ⓘ 帮助按钮**（小圆 + 空心问号 SVG = 全插件第 3 处单色图标，`title` 悬停提示「切换范围：项目＝仅当前项目，全部＝所有项目」简短语言） | 已实现并测试锁定：client 半新增 `pushRecent`/`recentCommandsView`/`firstBottomTab` + `HELP_SVG` + 上次使用视图渲染 + runner `onSuccess`；t03 扩至 **38 项**（A10–A12 纯逻辑 + B15–B19 DOM：空态/记录/范围切换持久化/lastUsed 语境/删除跳过）、t07 扩至 **21 项**（R5/S5/S6/S7：firstBottomTab/强制底部栏/不强制降级/onSuccess 成功才触发）、t04 D3 断言更新（无「常用」兜底）、t03 C4（SVG 2→3）+ B2/B3（分组条含「上次使用」）+ bootScene 深拷贝隔离（client 改写 data.state 导致 SAMPLE_STATE 用例间串扰）；**全套 150 项回归全过**；文档同步：功能文档 §3.3/§3.4/§3.5/§4.2/§7/§9、视觉规范 §2/§3.1/§3.2/§6、接入规范 §3.3、README、AGENTS.md（规则 5 运行恢复 + 规则 7 SVG 3 处）；本机真机实证（WebBridge）：cmd-pad tab 在底部面板时运行新终端落底部栏（powershell tab 新增激活）+ 上次使用视图渲染（详见本轮会话记录）；**待用户实机复核**：cmd-pad tab 停靠右面板时运行强制落底部栏（需真实拖拽布局验证）、上次使用视图交互手感 |

## 已知风险登记（开工即知，随任务推进复核）

1. **手写 wire format**（T01 验证）——不可用则 bundle 方案整体调整；
2. **终端 WS 是未文档化内部协议**（T07 已实证）——**每次升级 better-sidebar 后回归**；
   实际安装 **v0.13.1** 已实机实证可用（双 WS 附加 13/13 + 端到端），tab id 为 `terminal:<uuid>`
   且须排除 `agent:` 前缀；升级后跑 `test/t07-ws-probe.mjs` + `test/t07-run.test.mjs`（接入规范 §3）；
3. **conversation 服务探测**（调整记录 #21 + #24）——写对话输入框方案已否决且不再恢复
   （T07 用户确认降级 = 直接复制），该探测**无消费方**，契约保留备查（接入规范 §5.6）；
4. **皮肤令牌覆盖度**（T03 起每次目检）——玻璃皮肤的 `bg-base` 半透明问题按视觉规范 §1.1 第 5 条处理。

## 后续立项（T08 收尾时另行立项，不在当前路线图内）

> 设计文档 §7 的 P1/P2 项（F14–F19）在 T08 逐项评估后**另行立项**：均不进入当前落地路线图，
> 此处记录价值评估与立项建议，未来按需单独立项（新任务承接时以此清单为输入，遵循「调整记录先行」规则）。

| # | 功能 | 优先级 | 价值评估与立项建议（T08，2026-08-23） |
|---|---|---|---|
| F14 | 导入/导出命令库 | P1 | 高价值：命令库是纯文件（commands.yml），导出/导入 = 文件复制级收益；建议立项时提供「导出 YAML 下载 + 导入覆盖/合并」，风险低（数据层 T02 已有原子写）。**未立项原因**：T08 收尾范围控制，用户未要求。 |
| F15 | 拖拽排序 | P1 | 中高价值：命令排序目前靠手改 yml（无 order 字段）；拖拽排序需引入 order 存储与迁移，改动面覆盖数据层+渲染+写操作。**未立项原因**：与现有「分组浏览/搜索」价值重叠度一般，收益不确定。 |
| F16 | 终端选中即存 | P1 | 中价值：终端选中文本一键存为命令，依赖终端选区 API（better-sidebar 内部实现，升级敏感）；需先做协议可行性验证（类似 T07 ws-probe）。**未立项原因**：依赖面宽、协议未实证。 |
| F17 | 键盘 ↑↓+Enter | P2 | 低-中价值：目前搜索有 `/` 聚焦、Esc 清空，键盘选择是锦上添花；运行已恢复（T07），原「运行暂缓期间不启用」前提已失效，可重新评估。**未立项原因**：收益有限，避免键盘链复杂度（Esc 链已三层）。 |
| F18 | 命令参数占位符 | P2 | 中价值：模板命令（如 `hdc shell %{param}`）运行时替换参数，依赖运行通道（T07 已有）+ 弹窗表单扩展。**未立项原因**：需与「运行」交互链扩展，价值场景有限。 |
| F19 | 入驻 better-sidebar 推荐插件目录 | P2 | 中价值：提 PR + 打 topic 扩大曝光；需先过 better-sidebar 上游审查规范（外部插件指南）。**未立项原因**：社区贡献流程独立于本仓库功能开发，可随时并行推进。 |
