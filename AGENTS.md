# cmd-pad 开发守则（AGENTS）

> 本仓库开发 **dsh-cmd-pad**（DSH 命令面板插件）。动手前必读，逐条遵守。
> 详细规范见 `docs/`；产品设计见 `dsh-cmd-pad-功能文档与交互设计.md`。

## 任务管理

- `TASK.md` — 落地路线图与任务状态账本。**任何开发会话开工前先读它**：确认前置任务状态与「调整记录」；
  做完任务就地更新状态与完成证据并提交；发现与前置假设不符时先写「调整记录」再调整后续任务（规则见文件头）。
- **会话分工**：实现代码的会话（执行会话）按本守则与 `docs/` 规范动手写代码；只做协调的会话不碰代码，
  仅维护文档与账本。两类会话共用同一本 TASK.md 交接。

## 仓库结构

- `dsh-cmd-pad-功能文档与交互设计.md` — 产品与交互设计（v0.3 定稿）
- `docs/better-sidebar-接入规范.md` — 依赖 better-sidebar 的接入规范（API、终端 WS 协议、能力门）
- `docs/视觉风格统一规范.md` — 视觉令牌/图标/组件配方规范
- `DSH-better-sidebar-main/` — 上游 better-sidebar **只读参考快照**（v0.15.1），禁止在其中写代码

## 硬规则（违反 = bug）

1. **软依赖 better-sidebar**：`peerDependencies` + `optional: true`；运行时 `ctx.get('betterSidebar')` 探测。
   **绝不把 `'betterSidebar'` 写进硬 `inject`**——否则降级形态永不加载。
2. **注册必须 `ctx.effect(() => bs.registerTab(...))` 包裹**；id 固定 `cmd-pad:pad`，order 45，`single: true`。
3. **新能力先探测**：`bs.features?.includes('badge' | 'tabLifecycle' | 'pluginSettings' | ...)`。
4. **主形态不自建浮层**（无浮动图标/抽屉/蒙层）；降级形态抽屉非模态、无蒙层。
5. **终端直写**走 `/sidebar/ws/terminal?sessionId&tab&cwd`：输入帧原始文本；**只发文本，永不发
   `{type:'close'}` 帧**；复用终端时排除 `agent:` 前缀 tab；任何环节失败按降级链走
   （终端 → 对话输入框 → 复制 + Toast）。此协议是 better-sidebar 内部实现，其升级后必须回归验证。
6. **零构建纯 DOM**：client 半为手写 `__ModuleLoader__.load({ id: 'dsh-cmd-pad', factory })` wire format；
   react 可 `require('react')`（白名单）；**禁止** value-import/require `dsh-better-sidebar` 的任何模块。
7. **视觉**：零硬编码颜色，全量 `--dsw-alias-*` 令牌 + 兜底链；无 emoji、无彩色图标（全插件仅 Tab 图标
   与搜索放大镜 2 处单色 SVG：16 viewBox / 1.5px stroke / currentColor / round caps）；按钮纯文字；
   类名加 `cmd-pad-` 前缀；不引用 better-sidebar 的 CSS Modules 哈希类名；z-index：抽屉 30、弹层 90。
8. **数据**：命令库 = 人可手改的 `commands.yml`（分组名即主键）；机器状态 = `state.json`；写入原子化
   （临时文件 + rename，yml 写前 `.bak`）；存储目录 `%USERPROFILE%\.dsh\profiles\web\cmd-pad\`。
9. **禁止修改 DSH 官方源码**与 `DSH-better-sidebar-main/` 快照；挂载只走 profile 机制
   （`dsh plugin --profile web add`）。
10. 改动涉及 better-sidebar 交互面时，同步更新 `docs/better-sidebar-接入规范.md`；
    改动视觉规则时，同步更新 `docs/视觉风格统一规范.md` 并过其 §6 验收清单。

## 当前项目识别

「当前项目」= 当前会话 cwd。主形态读 Tab props 的 `scope.cwd`（唯一权威来源，不要自己订阅
`ctx.sessions`）；降级形态与 host 半读会话 header.cwd。项目分组名 = 工作区绝对路径。

## 验证基线

- 目标环境：DSH Web UI ≥ 0.1.0-rc.8，Windows；安装后重启 `dsh web` + 硬刷新浏览器。
- 主形态验证：设置页「侧边卡片」出现「命令」卡片；`+` 菜单出现「命令」（终端与浏览器之间）。
- 降级形态验证：无 better-sidebar 时浮动图标 + 抽屉可用。
