# cmd-pad × better-sidebar 接入规范

> 本文档是 cmd-pad（dsh-cmd-pad）依赖 better-sidebar 的**权威接入规范**，全部条目已对
> `DSH-better-sidebar-main` 源码（当前快照 **v0.15.1**）实证，非转述。
> 配套文档：`docs/视觉风格统一规范.md`（样式侧）、`dsh-cmd-pad-功能文档与交互设计.md`（产品侧）。
>
> 权威源码速查：`src/client/service.ts`（服务实现）、`src/client/builtins/tabs.tsx`（内置 7 tab 注册参考）、
> `src/index.ts`（host 路由 + 终端 WS 协议）、`docs/external-plugin-guide.md`（官方接入指南）。

---

## 1. 依赖形态：软依赖，双形态

cmd-pad 以**可选 peer 依赖 + 运行时探测**集成 better-sidebar：

- 装了 better-sidebar → 注册为其侧边栏 Tab（主形态）；
- 没装 → 静默跳过注册，走独立浮动图标 + 非模态抽屉（降级形态）。

### 1.1 package.json 声明

```jsonc
{
  "peerDependencies": {
    "cordis": "^4.0.0-rc.8",
    "dsh-better-sidebar": ">=0.12.0"
  },
  "peerDependenciesMeta": {
    "dsh-better-sidebar": { "optional": true }
  }
}
```

- 必须是 **peerDependency**（不是 dependency），避免双实例；`optional: true` 保证未安装时也照常加载。
- 版本下限 0.12.0 是 badge / 生命周期 / pluginSettings 的引入点；低于它的版本也能用，靠能力门降级（见 §4）。

### 1.2 运行时探测（关键正确性规则）

> ⚠️ **不要把 `'betterSidebar'` 写进硬 `inject` 数组。**
> Cordis 的 `inject` 是**硬依赖**：声明后服务不就绪插件永不激活——降级形态将永远无法加载。
> 官方指南的 `inject = ['betterSidebar']` 骨架只适用于"没有 better-sidebar 就没有意义"的插件；
> cmd-pad 有降级形态，必须走探测。

探测写法（cordis v4 的 `ctx.get(name)` 是标准的可选服务探测 API，服务缺失返回 `undefined`，
better-sidebar 自身对 `jobs` / `agents` / `conversation` 等可选服务全部用此模式）：

```js
const bs = ctx.get('betterSidebar')   // undefined → 走降级形态
if (bs) ctx.effect(() => bs.registerTab({ /* ... */ }))
```

生态先例：dsh-sentinel 同款软依赖模式（本地重述最小服务契约，探测失败静默跳过），已实机验证。

### 1.3 服务边界

- `ctx.betterSidebar` **只在 client 半存在**。cmd-pad 的 host 半（`/cmd-pad/api` 路由）与它无关，
  不要试图在 host 半访问该服务；host 半若需要 better-sidebar 的数据，走它的 HTTP 路由（`/sidebar/api/*`）。
- cmd-pad 零构建纯 DOM：组件桥接所需的 `react` 在模块加载器白名单内，factory 内 `require('react')` 即可；
  **禁止** 运行时 value-import / require `dsh-better-sidebar` 的任何模块——一切交互走 `ctx.betterSidebar` 方法调用。

---

## 2. Tab 注册契约（主形态）

### 2.1 cmd-pad 的注册描述符（定稿）

```js
ctx.effect(() => bs.registerTab({
  id: 'cmd-pad:pad',          // 包前缀防冲突；也是 SidebarTab.type 的值
  title: '命令',               // 纯文本；需要 i18n 时可传 () => string
  icon: (size) => <CmdPadIcon size={size} />,  // 单色 SVG，规范见风格文档 §3
  order: 45,                  // 见 §2.2 排序位
  single: true,               // ≡ dedupeKey: () => 'cmd-pad:pad'，重复打开聚焦既有 Tab
  badge: (...) => ...,        // 能力门后启用，见 §4
  onActivate: (tab, scope) => { /* 拉取最新命令库 */ },
  component: (props) => ...,  // React 桥接 → 纯 DOM 面板
}))
```

三条铁律：

1. **必须 `ctx.effect(...)` 包裹**。`registerTab` 返回 disposer，由 Cordis fiber 在卸载（HMR / 禁用）时
   自动调用；不包 effect，注册残留，下次激活抛 `"already registered"`。
2. **id 带包前缀**（`cmd-pad:pad`），且不得与内置 id 重复（见 §2.2）。
3. **`component` 契约是 `(props: TabComponentProps) => ReactNode` 纯渲染函数**，宿主把它当普通函数调用
   （不是 JSX 组件挂载）——桥接组件内部自己处理 ref 挂载/卸载。

### 2.2 内置 Tab 清单与排序位（v0.15.1 实证，`src/client/builtins/tabs.tsx`）

| id | order | 去重 | 备注 |
|---|---|---|---|
| `editor` | 10 | 按 path | 文件窗口（explorer 已并入，不再是独立 tab） |
| `git` | 20 | single | |
| `subagent` | 30 | single | |
| `sidechat` | 35 | createTab + 按 threadId | 侧边对话 |
| `terminal` | 40 | createTab 铸造，配额 3 | 见 §3 |
| `browser` | 50 | createTab 铸造 | |
| `diff` | -1 | 按 id | hidden，不在 + 菜单 |

- **cmd-pad 取 order 45**：在 terminal(40) 之后、browser(50) 之前，与功能文档 §2.2 一致。
- 注册与内置 id 重复会抛 `"tab type \"X\" already registered"`。
- 注册的 tab 自动出现在设置页「侧边卡片」清单（可停用；停用后 `openTab` 是 no-op，已打开的 tab 保留）。
- 插件自有设置可用 `settings.pluginToggles`（key 插件局部，持久化在 `pluginSettings['cmd-pad:pad']`，
  无需宿主 schema 字段）——cmd-pad 的设置项（如"运行前总是确认"）应走这里，不要碰 `toggles`
  （其 key 必须是宿主 PrefsSchema 字段）。

### 2.3 TabComponentProps 要点

```ts
{ ctx, store, scope: { sessionId, cwd? }, tab, visible, ... }
```

- **`scope` 是项目识别的唯一权威来源**：主形态下「当前项目」= `scope.cwd`，切会话宿主自动用新 scope
  重渲染，cmd-pad **不需要**自己订阅 `ctx.sessions`。
- **`visible` 是性能门**：`false`（面板折叠/非激活 tab）时暂停一切轮询、订阅与刷新。
- 组件卸载 ≠ tab 关闭（切会话也卸载）——需要随 tab 关闭释放的资源放 `onClose`，不放组件析构。
- localStorage 里持久化的 cmd-pad tab 在插件未加载时渲染为 `<OrphanedTab/>` 占位卡，插件加载后自动恢复
  ——这是正常降级，不要为此做额外处理。

---

## 3. 终端直写通道（运行功能，实证协议）

> 功能文档 §4.2 的三级降级链所依赖的协议，已对 `src/index.ts`（`attachTerminal`）与
> `src/client/TerminalView.tsx` 逐行核实。**注意：这是 better-sidebar 未文档化承诺的内部协议，**
> **版本升级可能变更——每次升级 better-sidebar 后必须回归验证（功能文档 §8 待确认项 1）。**

### 3.1 协议事实（v0.15.1 实证）

- 端点：`WS /sidebar/ws/terminal`，UI 终端查询参数 `?sessionId=<id>&tab=<tabId>&cwd=<cwd>`
  （`cwd` 可省，缺省取会话权威 cwd）。
- **输入帧 = 原始文本**（与 xterm `onData` 协议一致）；发送 `命令文本 + '\r'` 即执行。
- 控制帧为 JSON：`{type:'resize',cols,rows}` / `{type:'close'}` / `{type:'park'}`。
  宿主判定逻辑：**能 `JSON.parse` 成对象**才当控制帧候选，其余一律原样写入 pty。
- 连接建立后宿主**先回放该 pty 的历史 transcript**，再推实时输出——短命写入连接会收到一份历史输出，
  忽略即可（面板不负责展示）。
- **同一 pty 支持多路 WS 并存**：每路连接独立订阅 `onData`，互不干扰；我方连接 bare drop（直接关闭，
  不发 close 帧）走 reconnect grace，pty 与用户侧视图均不受影响。
- **不要发 `{type:'close'}` 帧**——它会立即释放终端配额并关闭该终端（用户视角 = 终端被杀）。

### 3.2 陷阱（必须记住）

| 陷阱 | 后果 | 规避 |
|---|---|---|
| 命令文本恰好是合法 JSON 对象且带 `type: 'close'/'park'` 字段 | 被宿主解释为控制帧，命令丢失甚至终端被关 | 极端边缘；如发现，在文本前补一个空格或先写 `echo` 包裹——常规 shell 命令不会触发 |
| 终端 tab id 是 **`terminal:<uuid>`**（v0.13 起），不是旧文档的 `terminal:<n>` | 解析数字序号会拿到 undefined | 从 `bs.getSnapshot()` 遍历 `type === 'terminal'` 的 tab，**不解析 id 结构** |
| `agent:` 前缀的 tab 是 agent 拥有的终端（`?uuid=` 通道） | 用 `?tab=` 附加会失败 | 复用终端时**排除 `agent:` 前缀的 tab** |
| UI 终端配额 `TERMINAL_LIMIT = 3`，满额时 `createTab` 返回 null | `openTab({type:'terminal'})` 静默无效 | 降级链第二级（写对话输入框）兜底 |
| terminal 描述符有 `createTab`，`openTab` seed 的 title/path/id 被忽略 | 无法定向打开特定终端 | 复用靠遍历 snapshot 选目标，不靠 seed |
| `available` 不拦截 `openTab`；但设置页禁用 terminal 卡片会拦截（no-op + console.warn） | 用户禁用终端后运行静默失败 | 失败检测后走降级链 |

### 3.3 选定目标终端的推荐流程

```
snapshot = bs.getSnapshot()                       // { sessionId, state, prefs }
tabs = 遍历 state.splits 所有叶子的 tabs
候选 = tabs.filter(t => t.type === 'terminal' && !t.id.startsWith('agent:'))
有候选 → 取最后一个（最近打开的）t.id
无候选 → bs.openTab({ type: 'terminal' })，再从新 snapshot 取新终端 id
       （createTab 返回 null / 被设置禁用 → snapshot 无新终端 → 降级）
ws = new WebSocket(`/sidebar/ws/terminal?sessionId=...&tab=...&cwd=...`)
ws.onopen → send(cmd + '\r') → 发送完 ws.close()（bare drop，勿发 close 帧）
危险命令：send(cmd) 不带 '\r'（停在提示符，双人工确认，功能文档 §4.2）
```

### 3.4 危险命令语义（不变）

`danger: true` 确认弹窗后只发送命令文本、不发送 `\r`，由用户在终端内亲自回车。

---

## 4. 版本与能力探测

v0.12.0+ 服务暴露 `version` 与 `features`（单调只增）。**新能力一律先探测再启用**：

```js
if (bs.features.includes('badge')) {        // v0.12.0+：TabDescriptor.badge
  /* badge 必须是廉价纯函数：每次 tab 栏渲染都调用；抛错被吞（不显示） */
}
if (bs.features.includes('tabLifecycle')) { // v0.12.0+：onOpen/onActivate/onClose
  /* onActivate 里拉取最新命令库 */
}
if (bs.features.includes('pluginSettings')) { // v0.12.0+：settings.pluginToggles
}
// v0.13.0+ 新增：'urlTarget' | 'settingSelect'（cmd-pad 暂不需要）
```

当前快照 v0.15.1 的完整 features：`'badge' | 'tabLifecycle' | 'updateTab' | 'openFile' |
'targetedOpen' | 'stateSubscription' | 'tabMeta' | 'pluginSettings' | 'urlTarget' | 'settingSelect'`。

老版本无 `features` 字段（v0.12.0 前）：`bs.features?.includes(...)` 可选链兜底，缺省即降级。

---

## 5. 生命周期与降级规则汇总

1. 注册必须 `ctx.effect` 包裹（HMR-safe），否则残留抛 `"already registered"`。
2. `visible === false` 暂停一切后台活动。
3. 主形态下 cmd-pad **不自建任何浮层**：无浮动图标、无抽屉、无遮罩；外壳（面板框架、拖拽分栏、
   明暗换肤、设置页开关卡片）全部由 better-sidebar 承担。
4. 降级形态（探测不到 `betterSidebar`）：浮动图标 + 非模态右侧抽屉，无蒙层；关闭途径 =
   Esc / 顶栏 ✕ / 再点浮动图标。
   - **抽屉为占用式布局**（T03 前体验修复，调整记录 #7）：打开时给 `#root` 注入
     `margin-right: calc(var(--dsh-sidebar-width,0px) + 抽屉宽)`，主页面（含对话输入框）左移让位，
     抽屉不遮挡内容——与 better-sidebar 面板同款 layout-push；关闭/卸载移除、resize 重算；
     better-sidebar 完全不在场时同样生效（无动画但功能正确）。
   - **拖拽分栏**（调整记录 #8）：抽屉左缘 8px 把手拖动调宽（对齐 better-sidebar 面板 resize），
     clamp `[280, min(92vw, 视口-320)]`，拖动中 `#root` transition 禁用、宽度 localStorage
     持久化（`dsh-cmd-pad:drawerWidth`），resize 超上限自动 clamp。
5. better-sidebar 在场但探测失败的极端场景（T06 前过渡期 / 服务探测失败的降级过渡态）：
   - 浮动图标默认右下角，与右上角按钮簇天然不重叠（无右偏移需求）；
   - **抽屉顶栏 ✕ 左移避让**（T01 实测：按钮簇 z-index 45 > 抽屉 30，fixed top:3px right:10px，
     会盖住 ✕）。实现为**双锚点探测**（`dsh-cmd-pad/src/client.js` 的 `findClusterRect`）：
     ① `[data-dsh-toggle-cluster]`（v0.15.1+ 专用锚点；**v0.13.x 没有此属性**，T01 单锚点
     实现因此在 v0.13.1 上失效，见 TASK.md 调整记录 #6）；
     ② 缺省在 `[data-dsh-better-sidebar]` 宿主内几何探测——顶部（top≤40px）且右缘贴近视口
     右缘（innerWidth-120 内）的可见 `<button>`，取最右者、量其父容器（按钮簇）；
     按钮簇右缘真实落在视口内时，给抽屉顶栏 `padding-right` 置为 `视口宽 - 按钮簇左缘 + 8px`，
     把 ✕ 推到按钮簇左侧。调用时机：**挂载时 + 每次抽屉打开时重算**（better-sidebar 为 React
     挂载，与插件 apply 时序不定，打开时探测最可靠）。T06 主形态下 cmd-pad 不自建浮层，
     此避让逻辑不再需要。
6. 任一运行通道失败 → 写对话输入框（`ctx.get('conversation')` 探测，`setDraft`）→ 复制 + Toast。

---

## 6. 安装与调试

1. `dsh plugin --profile web add <cmd-pad 目录>`（或 profile `package.json` 加 `link:` 依赖 + `cordis.patch.yml` 挂载行 + `pnpm install`）。
2. client 半改动热加载，硬刷新（Ctrl+Shift+R）即可；host 半改动需重启 `dsh web`。
3. 验证主形态：设置页「侧边卡片」应出现「命令」卡片；侧边栏 `+` 菜单应有「命令」项（在终端与浏览器之间）。
4. 验证降级形态：停用/卸载 better-sidebar 后重载，浮动图标出现。
5. 调试参照物：better-sidebar 的内置注册代码（`src/client/builtins/tabs.tsx`）就是同 API 的参考实现；
   服务行为测试见 `tests/service.spec.ts`。

## 7. 上游约束

- `DSH-better-sidebar-main/` 是**上游开源仓库的本地参考快照，只读**——不要在其中写代码；
  需要 better-sidebar 新能力时向其上游仓库提 issue/PR。
- 禁止修改 DSH 官方源码（`~/.dsh/source/current`）；挂载只走 profile 机制。
- better-sidebar 升级后：回归终端直写通道（§3）+ 核对 `features` 清单（§4）+ 核对内置 order 表（§2.2）。
