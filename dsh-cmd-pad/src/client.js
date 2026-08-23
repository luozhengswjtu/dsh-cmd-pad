/**
 * dsh-cmd-pad client half（T01 最小骨架 → T03 只读浏览 + 复制 → T04 写操作）
 *
 * 手写 wire format（零构建，AGENTS.md 硬规则 6）：
 *   window.__ModuleLoader__.load({ id: 'dsh-cmd-pad', factory })
 *   - id 必须等于包名（宿主按 /plugins/dsh-cmd-pad/client.js 供应本文件）；
 *   - factory 是 CJS 闭包：执行仅注册工厂，所有副作用收在闭包内；
 *   - 导出 apply(ctx)（cordis 插件形态），ctx.get() 可选探测可用。
 *
 * T01 范围：仅降级形态 —— 浮动图标 + 空抽屉（非模态、无蒙层、z-index 30、
 * data-dsh-cmd-pad 锚点；better-sidebar 角落按钮簇在场时顶栏 ✕ 左移避让）。
 * T03 范围：抽屉内容区 —— 分组侧栏（上次/全部/项目/常驻/▸更多，功能文档 §3.3
 * 去图标版）、命令卡片（§4.1）、全局搜索（F5：命中高亮/计数/Esc 清空）、
 * 一键复制 + Toast；项目识别走会话 cwd（host 半 resolveSessionCwd，client 侧
 * 探测 sessions 服务取当前会话 id）；复制成功时按功能文档 §3.4 刷新「上次使用」
 * slot（PUT /api/state，机器状态，非命令库写操作）。
 * 运行功能（T05 曾实现为 conversation setDraft 写对话输入框）已按用户决策
 * **整体移除**（TASK.md 调整记录 #21）：卡片只留「复制」；等完善方案（T07
 * 终端直写三级降级链）落地再补全（届时主形态）。
 * 主形态（better-sidebar Tab 注册）在 T06 实现，届时按 ctx.get('betterSidebar')
 * 探测分流（AGENTS.md 硬规则 1：绝不把 'betterSidebar' 写进硬 inject）。
 *
 * 零硬编码颜色：全量 --dsw-alias-* 令牌 + --cp-* 兜底链（视觉规范 §1/§2/§3）。
 * 仅 2 处单色 SVG（浮动图标 / 搜索放大镜），currentColor 16viewBox 1.5px stroke。
 * 渲染一律 createElement + textContent（不拼用户内容进 innerHTML，防 XSS）。
 */
window.__ModuleLoader__.load({
  id: 'dsh-cmd-pad',
  factory: (require) => {
    'use strict'
    var module = { exports: {} }
    var exports = module.exports

    // ════════════════════════════════════════════════════════════════════
    // 样式：零硬编码颜色，全量 --dsw-alias-* 令牌 + --cp-* 兜底链
    // （docs/视觉风格统一规范.md §1/§2/§4；类名一律 cmd-pad- 前缀）
    // ════════════════════════════════════════════════════════════════════
    var STYLE_TAG_ID = 'dsh-cmd-pad-style'

    var CSS = [
      '[data-dsh-cmd-pad]{',
      '  -webkit-app-region:no-drag;',
      '}',
      '.cmd-pad-fab{',
      '  position:fixed;',
      '  right:16px;',
      '  bottom:16px;',
      '  z-index:30;',
      '  width:40px;',
      '  height:40px;',
      '  border-radius:50%;',
      '  display:flex;',
      '  align-items:center;',
      '  justify-content:center;',
      '  cursor:pointer;',
      '  color:var(--dsw-alias-label-primary,var(--cp-label-primary,#e6e6e6));',
      '  background:var(--dsw-alias-bg-layer-1,var(--cp-bg-layer-1,#232428));',
      '  border:1px solid var(--dsw-alias-border-l2,var(--cp-border-l2,#3a3d44));',
      // 中性黑色投影（同 better-sidebar 的 #00000059 一类）：仅承担浮起感，不承载主题色语义
      '  box-shadow:0 2px 8px rgba(0,0,0,.25);',
      '  -webkit-app-region:no-drag;',
      '  user-select:none;',
      '}',
      '.cmd-pad-fab:hover{',
      '  background:var(--dsw-alias-interactive-bg-hover,var(--cp-interactive-bg-hover,#2b2d33));',
      '}',
      '.cmd-pad-fab:active{',
      '  background:var(--dsw-alias-interactive-bg-active,var(--cp-interactive-bg-active,#34373e));',
      '}',
      '.cmd-pad-drawer{',
      '  position:fixed;',
      '  top:0;',
      '  right:0;',
      '  bottom:0;',
      '  width:min(360px,92vw);',
      '  z-index:30;',
      '  display:flex;',
      '  flex-direction:column;',
      '  background:var(--dsw-alias-bg-layer-1,var(--cp-bg-layer-1,#232428));',
      '  border-left:1px solid var(--dsw-alias-border-l2,var(--cp-border-l2,#3a3d44));',
      '  transform:translateX(102%);',
      '  transition:transform .18s ease;',
      '  -webkit-app-region:no-drag;',
      '}',
      '.cmd-pad-drawer[data-open="true"]{',
      '  transform:translateX(0);',
      '}',
      '.cmd-pad-drawer-head{',
      '  display:flex;',
      '  align-items:center;',
      '  justify-content:space-between;',
      '  height:40px;',
      '  padding:0 8px 0 14px;',
      '  border-bottom:1px solid var(--dsw-alias-border-l1,var(--cp-border-l1,#2e3036));',
      '  color:var(--dsw-alias-label-primary,var(--cp-label-primary,#e6e6e6));',
      '  font-size:13px;',
      '  -webkit-app-region:no-drag;',
      '}',
      '.cmd-pad-drawer-title{',
      '  font-weight:600;',
      '}',
      '.cmd-pad-drawer-close{',
      '  width:28px;',
      '  height:28px;',
      '  display:flex;',
      '  align-items:center;',
      '  justify-content:center;',
      '  border:none;',
      '  background:transparent;',
      '  color:var(--dsw-alias-label-secondary,var(--cp-label-secondary,#a0a3ab));',
      '  font-size:15px;',
      '  line-height:1;',
      '  cursor:pointer;',
      '  border-radius:6px;',
      '  -webkit-app-region:no-drag;',
      '}',
      '.cmd-pad-drawer-close:hover{',
      '  background:var(--dsw-alias-interactive-bg-hover,var(--cp-interactive-bg-hover,#2b2d33));',
      '  color:var(--dsw-alias-label-primary,var(--cp-label-primary,#e6e6e6));',
      '}',
      '.cmd-pad-drawer-body{',
      '  flex:1;',
      '  min-height:0;',
      '  display:flex;',
      '  flex-direction:column;', // 搜索栏在上、内容区在下（缺省 row 会导致搜索栏与内容区横排并挤占）
      '  overflow:hidden;',
      '  -webkit-app-region:no-drag;',
      '}',
      // ── T06 主形态：better-sidebar Tab 宿主容器（撑满面板，内容区同抽屉）──
      '.cmd-pad-tab-host{',
      '  height:100%;',
      '  min-height:0;',
      '  display:flex;',
      '  flex-direction:column;',
      '  box-sizing:border-box;',
      '  -webkit-app-region:no-drag;',
      '}',
      // ── T03 布局（用户定稿：搜索 → 分组横条 → 命令区，上下结构）──
      '.cmd-pad-groups{',
      '  flex:none;',
      '  display:flex;',
      '  flex-wrap:wrap;', // 分组项横向排列，放不下换行
      '  align-items:center;',
      '  gap:4px 6px;',
      '  padding:6px 10px;',
      '  border-bottom:1px solid var(--dsw-alias-border-l1,var(--cp-border-l1,#2e3036));',
      '  max-height:96px;', // 最多约 3 行，超出滚动
      '  overflow-y:auto;',
      '  overflow-x:hidden;',
      '  -webkit-app-region:no-drag;',
      '}',
      '.cmd-pad-content{',
      '  flex:1;',
      '  min-width:0;',
      '  min-height:0;',
      '  overflow-y:auto;',
      '  padding:8px 10px;',
      '  -webkit-app-region:no-drag;',
      '}',
      // ── 「上次使用」视图工具栏（调整记录 #28）：范围切换（项目|全部）+ ⓘ 帮助 ──
      '.cmd-pad-recent-toolbar{',
      '  flex:none;',
      '  display:flex;',
      '  align-items:center;',
      '  gap:6px;',
      '  margin-bottom:8px;',
      '  -webkit-app-region:no-drag;',
      '}',
      '.cmd-pad-scope-toggle{',
      '  display:inline-flex;',
      '  align-items:center;',
      '  border:1px solid var(--dsw-alias-border-l1,var(--cp-border-l1,#2e3036));',
      '  border-radius:6px;',
      '  overflow:hidden;',
      '  -webkit-app-region:no-drag;',
      '}',
      '.cmd-pad-scope-opt{',
      '  border:none;',
      '  background:transparent;',
      '  color:var(--dsw-alias-label-secondary,var(--cp-label-secondary,#a0a3ab));',
      '  font-size:12px;',
      '  line-height:1.4;',
      '  padding:3px 10px;',
      '  cursor:pointer;',
      '  user-select:none;',
      '  -webkit-app-region:no-drag;',
      '}',
      '.cmd-pad-scope-opt:hover{',
      '  background:var(--dsw-alias-interactive-bg-hover,var(--cp-interactive-bg-hover,#2b2d33));',
      '  color:var(--dsw-alias-label-primary,var(--cp-label-primary,#e6e6e6));',
      '}',
      '.cmd-pad-scope-opt-active{',
      '  background:var(--dsw-alias-interactive-bg-active,var(--cp-interactive-bg-active,#34373e));',
      '  color:var(--dsw-alias-label-primary,var(--cp-label-primary,#e6e6e6));',
      '}',
      '.cmd-pad-help{',
      '  display:inline-flex;',
      '  align-items:center;',
      '  justify-content:center;',
      '  width:20px;',
      '  height:20px;',
      '  border:none;',
      '  background:transparent;',
      '  color:var(--dsw-alias-label-tertiary,var(--cp-label-tertiary,#6f7278));',
      '  cursor:help;',
      '  border-radius:4px;',
      '  -webkit-app-region:no-drag;',
      '}',
      '.cmd-pad-help:hover{',
      '  color:var(--dsw-alias-label-primary,var(--cp-label-primary,#e6e6e6));',
      '}',
      '.cmd-pad-help svg{',
      '  flex:none;',
      '}',
      // ── T03：搜索栏 ──
      '.cmd-pad-search{',
      '  flex:none;', // column 布局下不拉伸：搜索栏固定在上方一行
      '  display:flex;',
      '  align-items:center;',
      '  gap:6px;',
      '  padding:6px 10px;',
      '  border-bottom:1px solid var(--dsw-alias-border-l1,var(--cp-border-l1,#2e3036));',
      '  -webkit-app-region:no-drag;',
      '}',
      '.cmd-pad-search svg{',
      '  flex:none;',
      '  color:var(--dsw-alias-label-tertiary,var(--cp-label-tertiary,#6f7278));',
      '}',
      '.cmd-pad-search-input{',
      '  flex:1;',
      '  min-width:0;',
      '  border:none;',
      '  outline:none;',
      '  background:var(--dsw-alias-bg-base,var(--cp-bg-base,#1c1d21));',
      '  color:var(--dsw-alias-label-primary,var(--cp-label-primary,#e6e6e6));',
      '  font-size:12px;',
      '  padding:5px 8px;',
      '  border-radius:6px;',
      // 中性黑浅投影：让搜索框在行内略微浮起、更显眼（调整记录 #30，用户反馈「不够显眼，加一层小小的阴影，不要重」）
      '  box-shadow:0 1px 3px rgba(0,0,0,.15);',
      '  -webkit-app-region:no-drag;',
      '}',
      '.cmd-pad-search-input::placeholder{',
      '  color:var(--dsw-alias-label-tertiary,var(--cp-label-tertiary,#6f7278));',
      '}',
      '.cmd-pad-search-count{',
      '  flex:none;',
      '  font-size:11px;',
      '  color:var(--dsw-alias-label-tertiary,var(--cp-label-tertiary,#6f7278));',
      '  white-space:nowrap;',
      '}',
      '.cmd-pad-search-clear{',
      '  flex:none;',
      '  width:20px;',
      '  height:20px;',
      '  display:flex;',
      '  align-items:center;',
      '  justify-content:center;',
      '  border:none;',
      '  background:transparent;',
      '  color:var(--dsw-alias-label-tertiary,var(--cp-label-tertiary,#6f7278));',
      '  font-size:12px;',
      '  line-height:1;',
      '  cursor:pointer;',
      '  border-radius:4px;',
      '  -webkit-app-region:no-drag;',
      '}',
      '.cmd-pad-search-clear:hover{',
      '  background:var(--dsw-alias-interactive-bg-hover,var(--cp-interactive-bg-hover,#2b2d33));',
      '  color:var(--dsw-alias-label-primary,var(--cp-label-primary,#e6e6e6));',
      '}',
      // ── T03：分组横条项（chip 样式，横向排列）──
      '.cmd-pad-group-row{',
      '  display:inline-flex;',
      '  align-items:center;',
      '  gap:4px;',
      '  max-width:160px;',
      '  padding:3px 8px;',
      '  border-radius:6px;',
      '  cursor:pointer;',
      '  color:var(--dsw-alias-label-secondary,var(--cp-label-secondary,#a0a3ab));',
      '  font-size:12px;',
      '  line-height:1.4;',
      '  user-select:none;',
      '  white-space:nowrap;',
      '  -webkit-app-region:no-drag;',
      '}',
      '.cmd-pad-group-row:hover{',
      '  background:var(--dsw-alias-interactive-bg-hover,var(--cp-interactive-bg-hover,#2b2d33));',
      '  color:var(--dsw-alias-label-primary,var(--cp-label-primary,#e6e6e6));',
      '}',
      '.cmd-pad-group-row[data-active="true"]{',
      '  background:var(--dsw-alias-interactive-bg-active,var(--cp-interactive-bg-active,#34373e));',
      '  color:var(--dsw-alias-label-primary,var(--cp-label-primary,#e6e6e6));',
      '}',
      '.cmd-pad-group-prefix{',
      '  flex:none;',
      '  font-size:11px;',
      '  color:var(--dsw-alias-label-tertiary,var(--cp-label-tertiary,#6f7278));',
      '}',
      '.cmd-pad-group-name{',
      '  flex:none;',
      '  max-width:120px;',
      '  overflow:hidden;',
      '  text-overflow:ellipsis;',
      '  font-weight:500;',
      '}',
      '.cmd-pad-group-count{',
      '  flex:none;',
      '  font-size:10px;',
      '  color:var(--dsw-alias-label-tertiary,var(--cp-label-tertiary,#6f7278));',
      '}',
      '.cmd-pad-more-toggle{',
      '  display:inline-flex;',
      '  align-items:center;',
      '  justify-content:center;',
      '  min-width:24px;',
      '  height:20px;',
      '  padding:0 5px;',
      '  border:1px solid var(--dsw-alias-border-l1,var(--cp-border-l1,#2e3036));',
      '  background:transparent;',
      '  border-radius:6px;',
      '  cursor:pointer;',
      '  color:var(--dsw-alias-label-tertiary,var(--cp-label-tertiary,#6f7278));',
      '  font-size:15px;',
      '  line-height:1;',
      '  white-space:nowrap;',
      '  user-select:none;',
      '  -webkit-app-region:no-drag;',
      '}',
      '.cmd-pad-more-toggle:hover{',
      '  background:var(--dsw-alias-interactive-bg-hover,var(--cp-interactive-bg-hover,#2b2d33));',
      '  color:var(--dsw-alias-label-primary,var(--cp-label-primary,#e6e6e6));',
      '}',
      '.cmd-pad-more-section{',
      '  display:inline-flex;',
      '  align-items:center;',
      '  font-size:11px;',
      '  color:var(--dsw-alias-label-tertiary,var(--cp-label-tertiary,#6f7278));',
      '  padding:0 2px;',
      '}',
      // ── T03：命令卡片 ──
      '.cmd-pad-section{',
      '  margin-bottom:10px;',
      '}',
      '.cmd-pad-section-title{',
      '  display:flex;',
      '  align-items:center;',
      '  gap:6px;',
      '  padding:2px 2px 4px;',
      '  font-size:12px;',
      '  font-weight:600;',
      '  color:var(--dsw-alias-label-primary,var(--cp-label-primary,#e6e6e6));',
      '}',
      '.cmd-pad-section-count{',
      '  font-size:10px;',
      '  font-weight:400;',
      '  color:var(--dsw-alias-label-tertiary,var(--cp-label-tertiary,#6f7278));',
      '}',
      '.cmd-pad-card{',
      '  background:var(--dsw-alias-bg-base,var(--cp-bg-base,#1c1d21));',
      '  border:1px solid var(--dsw-alias-border-l1,var(--cp-border-l1,#2e3036));',
      '  border-radius:8px;',
      '  padding:8px;',
      '  margin-bottom:8px;',
      // 与搜索框同款中性黑浅投影（调整记录 #30：命令内容框同样加一层小阴影，浮起感、不重）
      '  box-shadow:0 1px 3px rgba(0,0,0,.15);',
      '}',
      '.cmd-pad-card:hover{',
      '  border-color:var(--dsw-alias-border-l2,var(--cp-border-l2,#3a3d44));',
      '}',
      '.cmd-pad-card-title-row{',
      '  display:flex;',
      '  align-items:center;',
      '  gap:6px;',
      '}',
      '.cmd-pad-card-title{',
      '  flex:1;',
      '  min-width:0;',
      '  font-size:12px;',
      '  font-weight:600;',
      '  color:var(--dsw-alias-label-primary,var(--cp-label-primary,#e6e6e6));',
      '  overflow:hidden;',
      '  text-overflow:ellipsis;',
      '  white-space:nowrap;',
      '}',
      // 危险徽标：纯文字 pill（视觉规范 §2 配方：state-error-primary 文字 + 10% 同色底）
      '.cmd-pad-card-danger{',
      '  flex:none;',
      '  font-size:10px;',
      '  line-height:1.4;',
      '  padding:1px 6px;',
      '  border-radius:99px;',
      '  color:var(--dsw-alias-state-error-primary,var(--cp-state-error-primary,#f87171));',
      '  background:color-mix(in srgb, var(--dsw-alias-state-error-primary,var(--cp-state-error-primary,#f87171)) 10%, transparent);',
      '}',
      '.cmd-pad-card-cmd{',
      '  margin-top:6px;',
      '  font-family:var(--ds-font-family-code, monospace);',
      '  font-size:11px;',
      '  line-height:1.5;',
      '  color:var(--dsw-alias-label-primary,var(--cp-label-primary,#e6e6e6));',
      '  background:var(--dsw-alias-bg-layer-1,var(--cp-bg-layer-1,#232428));',
      '  border:1px solid var(--dsw-alias-border-l1,var(--cp-border-l1,#2e3036));',
      '  border-radius:6px;',
      '  padding:6px 8px;',
      '  cursor:pointer;',
      '  white-space:pre-wrap;',
      '  word-break:break-all;',
      '  display:-webkit-box;',
      '  -webkit-line-clamp:2;',
      '  -webkit-box-orient:vertical;',
      '  overflow:hidden;',
      '}',
      '.cmd-pad-card-cmd:hover{',
      '  border-color:var(--dsw-alias-border-l2,var(--cp-border-l2,#3a3d44));',
      '}',
      '.cmd-pad-card-note{',
      '  margin-top:4px;',
      '  font-size:11px;',
      '  color:var(--dsw-alias-label-secondary,var(--cp-label-secondary,#a0a3ab));',
      '  line-height:1.5;',
      '}',
      '.cmd-pad-card-actions{',
      '  margin-top:6px;',
      '  display:flex;',
      '  gap:6px;',
      '  justify-content:flex-end;',
      '}',
      // 次级按钮（复制/重试）：视觉规范 §2 配方
      '.cmd-pad-btn{',
      '  border:1px solid var(--dsw-alias-border-l1,var(--cp-border-l1,#2e3036));',
      '  background:var(--dsw-alias-bg-layer-1,var(--cp-bg-layer-1,#232428));',
      '  color:var(--dsw-alias-label-primary,var(--cp-label-primary,#e6e6e6));',
      '  font-size:11px;',
      '  line-height:1.4;',
      '  padding:3px 10px;',
      '  border-radius:6px;',
      '  cursor:pointer;',
      '  -webkit-app-region:no-drag;',
      '}',
      '.cmd-pad-btn:hover{',
      '  border-color:var(--dsw-alias-border-l2,var(--cp-border-l2,#3a3d44));',
      '  background:var(--dsw-alias-interactive-bg-hover,var(--cp-interactive-bg-hover,#2b2d33));',
      '}',
      '.cmd-pad-empty{',
      '  padding:24px 12px;',
      '  text-align:center;',
      '  font-size:12px;',
      '  color:var(--dsw-alias-label-tertiary,var(--cp-label-tertiary,#6f7278));',
      '  line-height:1.7;',
      '}',
      '.cmd-pad-retry-row{',
      '  text-align:center;',
      '  padding:4px 0 12px;',
      '}',
      // 搜索命中高亮：强调背景（accent）+ 常规字重提升，不引入新语义色
      '.cmd-pad-hit{',
      '  background:var(--dsw-alias-interactive-bg-hover-accent,var(--cp-interactive-bg-hover-accent,#3a4660));',
      '  color:var(--dsw-alias-label-primary,var(--cp-label-primary,#e6e6e6));',
      '  border-radius:2px;',
      '  font-weight:600;',
      '}',
      // Toast：cmd-pad 弹层 z-index 90（低于 DSH 浮层栈，视觉规范 §4.3）
      '.cmd-pad-toast{',
      '  position:fixed;',
      '  right:16px;',
      '  bottom:64px;',
      '  z-index:90;',
      '  max-width:300px;',
      '  padding:8px 12px;',
      '  border-radius:8px;',
      '  font-size:12px;',
      '  color:var(--dsw-alias-label-primary,var(--cp-label-primary,#e6e6e6));',
      '  background:var(--dsw-alias-bg-layer-2,var(--cp-bg-layer-2,#2a2c33));',
      '  border:1px solid var(--dsw-alias-border-l2,var(--cp-border-l2,#3a3d44));',
      // 中性黑色投影：仅承担浮起感，不承载主题色语义
      '  box-shadow:0 2px 8px rgba(0,0,0,.25);',
      '  opacity:0;',
      '  transform:translateY(4px);',
      '  transition:opacity .15s ease,transform .15s ease;',
      '  pointer-events:none;',
      '  -webkit-app-region:no-drag;',
      '}',
      '.cmd-pad-toast[data-show="true"]{',
      '  opacity:1;',
      '  transform:translateY(0);',
      '}',
      '.cmd-pad-toast[data-kind="error"]{',
      '  color:var(--dsw-alias-state-error-primary,var(--cp-state-error-primary,#f87171));',
      '}',
      // ── T04：顶栏「+ 添加」按钮（纯文字）──
      '.cmd-pad-add{',
      '  border:none;',
      '  background:transparent;',
      '  color:var(--dsw-alias-label-secondary,var(--cp-label-secondary,#a0a3ab));',
      '  font-size:12px;',
      '  line-height:1;',
      '  padding:6px 8px;',
      '  margin-right:2px;',
      '  border-radius:6px;',
      '  cursor:pointer;',
      '  -webkit-app-region:no-drag;',
      '}',
      '.cmd-pad-add:hover{',
      '  background:var(--dsw-alias-interactive-bg-hover,var(--cp-interactive-bg-hover,#2b2d33));',
      '  color:var(--dsw-alias-label-primary,var(--cp-label-primary,#e6e6e6));',
      '}',
      // 主形态搜索行右端的「+ 添加」与搜索控件（清空 ✕ 等）拉开间距
      // （调整记录 #29：仅 6px flex gap 太近 → 10px；#30 用户要求再远一些 → 16px，总间距 22px）
      '.cmd-pad-search .cmd-pad-add{',
      '  margin-left:16px;',
      '}',
      // ── T04：弹窗（遮罩 + 模态；弹层配方视觉规范 §2）──
      '.cmd-pad-overlay{',
      '  position:fixed;',
      '  inset:0;',
      '  z-index:80;',
      '  background:var(--dsw-alias-bg-mask-1,var(--cp-bg-mask-1,rgba(0,0,0,.4)));',
      '  display:flex;',
      '  align-items:center;',
      '  justify-content:center;',
      '  -webkit-app-region:no-drag;',
      '}',
      '.cmd-pad-modal{',
      '  width:min(430px,88vw);',
      '  max-height:84vh;',
      '  overflow-y:auto;',
      '  box-sizing:border-box;',
      '  background:var(--dsw-alias-bg-layer-2,var(--cp-bg-layer-2,#2a2c33));',
      '  border:1px solid var(--dsw-alias-border-l2,var(--cp-border-l2,#3a3d44));',
      '  border-radius:10px;',
      // 中性黑色投影：仅承担浮起感
      '  box-shadow:0 4px 16px rgba(0,0,0,.25);',
      '  padding:14px;',
      '  z-index:90;',
      '}',
      '.cmd-pad-modal-title{',
      '  font-size:13px;',
      '  font-weight:600;',
      '  color:var(--dsw-alias-label-primary,var(--cp-label-primary,#e6e6e6));',
      '  margin-bottom:10px;',
      '}',
      '.cmd-pad-modal-message{',
      '  font-size:12px;',
      '  line-height:1.7;',
      '  color:var(--dsw-alias-label-secondary,var(--cp-label-secondary,#a0a3ab));',
      '  margin-bottom:10px;',
      '  white-space:pre-wrap;',
      '  word-break:break-all;',
      '}',
      // T07：危险命令确认弹窗的命令原文块（双人工确认，功能文档 §4.3）
      '.cmd-pad-modal-pre{',
      '  font-family:var(--dsw-alias-font-mono,Consolas,Menlo,monospace);',
      '  font-size:12px;',
      '  line-height:1.6;',
      '  white-space:pre-wrap;',
      '  word-break:break-all;',
      '  background:var(--dsw-alias-bg-base,var(--cp-bg-base,#1c1d21));',
      '  border:1px solid var(--dsw-alias-border-l1,var(--cp-border-l1,#2e3036));',
      '  border-radius:6px;',
      '  padding:8px 10px;',
      '  color:var(--dsw-alias-label-primary,var(--cp-label-primary,#e6e6e6));',
      '  margin-bottom:10px;',
      '  max-height:200px;',
      '  overflow-y:auto;',
      '}',
      '.cmd-pad-form-row{',
      '  margin-bottom:8px;',
      '}',
      '.cmd-pad-form-label{',
      '  display:block;',
      '  font-size:11px;',
      '  color:var(--dsw-alias-label-secondary,var(--cp-label-secondary,#a0a3ab));',
      '  margin-bottom:4px;',
      '}',
      '.cmd-pad-form-input{',
      '  width:100%;',
      '  box-sizing:border-box;',
      '  border:1px solid var(--dsw-alias-border-l1,var(--cp-border-l1,#2e3036));',
      '  background:var(--dsw-alias-bg-base,var(--cp-bg-base,#1c1d21));',
      '  color:var(--dsw-alias-label-primary,var(--cp-label-primary,#e6e6e6));',
      '  font-size:12px;',
      '  padding:6px 8px;',
      '  border-radius:6px;',
      '  outline:none;',
      '}',
      '.cmd-pad-form-input:focus{',
      '  border-color:var(--dsw-alias-border-l2,var(--cp-border-l2,#3a3d44));',
      '}',
      '.cmd-pad-form-textarea{',
      '  min-height:64px;',
      '  resize:vertical;',
      '  font-family:var(--ds-font-family-code, monospace);',
      '  line-height:1.5;',
      '}',
      '.cmd-pad-form-hint{',
      '  font-size:11px;',
      '  color:var(--dsw-alias-state-error-primary,var(--cp-state-error-primary,#f87171));',
      '  margin-top:3px;',
      '  line-height:1.5;',
      '}',
      '.cmd-pad-checkbox-row{',
      '  display:flex;',
      '  align-items:center;',
      '  gap:6px;',
      '  font-size:12px;',
      '  color:var(--dsw-alias-label-primary,var(--cp-label-primary,#e6e6e6));',
      '  padding:3px 0;',
      '  cursor:pointer;',
      '  user-select:none;',
      '}',
      '.cmd-pad-group-check-section{',
      '  font-size:11px;',
      '  color:var(--dsw-alias-label-tertiary,var(--cp-label-tertiary,#6f7278));',
      '  margin:6px 0 2px;',
      '}',
      '.cmd-pad-group-check{',
      '  display:flex;',
      '  align-items:center;',
      '  gap:6px;',
      '  padding:3px 6px;',
      '  border-radius:4px;',
      '  cursor:pointer;',
      '  font-size:12px;',
      '  color:var(--dsw-alias-label-secondary,var(--cp-label-secondary,#a0a3ab));',
      '  user-select:none;',
      '}',
      '.cmd-pad-group-check:hover{',
      '  background:var(--dsw-alias-interactive-bg-hover,var(--cp-interactive-bg-hover,#2b2d33));',
      '  color:var(--dsw-alias-label-primary,var(--cp-label-primary,#e6e6e6));',
      '}',
      '.cmd-pad-group-check[data-checked="true"]{',
      '  color:var(--dsw-alias-label-primary,var(--cp-label-primary,#e6e6e6));',
      '  font-weight:500;',
      '}',
      '.cmd-pad-more-groups{',
      '  margin-top:4px;',
      '  font-size:11px;',
      '  color:var(--dsw-alias-label-tertiary,var(--cp-label-tertiary,#6f7278));',
      '  border:none;',
      '  background:transparent;',
      '  cursor:pointer;',
      '  padding:2px 6px;',
      '  border-radius:4px;',
      '}',
      '.cmd-pad-more-groups:hover{',
      '  background:var(--dsw-alias-interactive-bg-hover,var(--cp-interactive-bg-hover,#2b2d33));',
      '  color:var(--dsw-alias-label-primary,var(--cp-label-primary,#e6e6e6));',
      '}',
      '.cmd-pad-form-actions{',
      '  display:flex;',
      '  justify-content:flex-end;',
      '  gap:8px;',
      '  margin-top:12px;',
      '}',
      // 主按钮（保存）：视觉规范 §2 配方
      '.cmd-pad-btn-primary{',
      '  border:1px solid transparent;',
      '  background:var(--dsw-alias-button-primary-fill,var(--cp-button-primary-fill,#4a6cf7));',
      '  color:var(--dsw-alias-label-primary-inverted,var(--cp-label-primary-inverted,#ffffff));',
      '  font-size:12px;',
      '  line-height:1.4;',
      '  padding:5px 14px;',
      '  border-radius:6px;',
      '  cursor:pointer;',
      '  -webkit-app-region:no-drag;',
      '}',
      '.cmd-pad-btn-primary:hover{',
      '  background:var(--dsw-alias-button-primary-hover,var(--cp-button-primary-hover,#5a7af8));',
      '}',
      '.cmd-pad-btn-danger{',
      '  border:1px solid var(--dsw-alias-state-error-primary,var(--cp-state-error-primary,#f87171));',
      '  background:transparent;',
      '  color:var(--dsw-alias-state-error-primary,var(--cp-state-error-primary,#f87171));',
      '}',
      '.cmd-pad-btn-danger:hover{',
      '  background:color-mix(in srgb, var(--dsw-alias-state-error-primary,var(--cp-state-error-primary,#f87171)) 10%, transparent);',
      '}',
      // ── T04：右键菜单（弹层配方）──
      '.cmd-pad-menu{',
      '  position:fixed;',
      '  z-index:90;',
      '  min-width:140px;',
      '  background:var(--dsw-alias-bg-layer-2,var(--cp-bg-layer-2,#2a2c33));',
      '  border:1px solid var(--dsw-alias-border-l2,var(--cp-border-l2,#3a3d44));',
      '  border-radius:8px;',
      // 中性黑色投影
      '  box-shadow:0 2px 12px rgba(0,0,0,.25);',
      '  padding:4px;',
      '  -webkit-app-region:no-drag;',
      '}',
      '.cmd-pad-menu-item{',
      '  display:block;',
      '  width:100%;',
      '  text-align:left;',
      '  padding:6px 10px;',
      '  font-size:12px;',
      '  line-height:1.4;',
      '  color:var(--dsw-alias-label-primary,var(--cp-label-primary,#e6e6e6));',
      '  background:transparent;',
      '  border:none;',
      '  border-radius:4px;',
      '  cursor:pointer;',
      '  -webkit-app-region:no-drag;',
      '}',
      '.cmd-pad-menu-item:hover{',
      '  background:var(--dsw-alias-interactive-bg-hover,var(--cp-interactive-bg-hover,#2b2d33));',
      '}',
      '.cmd-pad-menu-item[data-danger="true"]{',
      '  color:var(--dsw-alias-state-error-primary,var(--cp-state-error-primary,#f87171));',
      '}',
      '.cmd-pad-menu-sep{',
      '  height:1px;',
      '  background:var(--dsw-alias-border-l1,var(--cp-border-l1,#2e3036));',
      '  margin:4px 6px;',
      '}',
      // ── T04：Toast 操作按钮（撤销）──
      '.cmd-pad-toast-action{',
      '  background:transparent;',
      '  border:none;',
      '  color:var(--dsw-alias-brand-primary,var(--cp-brand-primary,#5a7af8));',
      '  font-size:12px;',
      '  font-weight:600;',
      '  cursor:pointer;',
      '  padding:0 0 0 10px;',
      '  -webkit-app-region:no-drag;',
      '}',
      '.cmd-pad-toast-action:hover{',
      '  text-decoration:underline;',
      '}',
      // 拖拽分栏把手（左缘，col-resize；拖动中禁用过渡，避免 margin/宽度跟不上指针）
      '.cmd-pad-drawer-resize{',
      '  position:absolute;',
      '  top:0;',
      '  bottom:0;',
      '  left:-4px;',
      '  width:8px;',
      '  cursor:col-resize;',
      '  touch-action:none;',
      '  z-index:2;',
      '  -webkit-app-region:no-drag;',
      '}',
      '.cmd-pad-drawer-resize:hover,',
      '.cmd-pad-drawer[data-dragging] .cmd-pad-drawer-resize{',
      '  background:var(--dsw-alias-interactive-bg-hover,var(--cp-interactive-bg-hover,#2b2d33));',
      '}',
      '.cmd-pad-drawer[data-dragging]{',
      '  transition:none;',
      '  user-select:none;',
      '}',
    ].join('\n')

    function ensureStyle() {
      if (typeof document === 'undefined') return
      if (document.getElementById(STYLE_TAG_ID) !== null) return
      var style = document.createElement('style')
      style.id = STYLE_TAG_ID
      style.setAttribute('data-plugin', 'dsh-cmd-pad')
      style.setAttribute('data-plugin-css', 'dsh-cmd-pad')
      style.textContent = CSS
      document.head.appendChild(style)
    }

    function removeStyle() {
      if (typeof document === 'undefined') return
      var style = document.getElementById(STYLE_TAG_ID)
      if (style !== null) style.remove()
    }

    // ════════════════════════════════════════════════════════════════════
    // 纯逻辑（T03：分组聚合 / 消歧 / 排序 / 视图 / 搜索）——挂 exports.testable
    // 供 node 验收 harness 直接调用（不随 wire format 影响宿主，宿主只调 apply）
    // ════════════════════════════════════════════════════════════════════

    /** 项目分组判定：工作区绝对路径（Windows 盘符 / UNC / POSIX 根）。 */
    function isProjectGroup(name) {
      return /^[A-Za-z]:[\\/]/.test(name) || /^\\\\/.test(name) || name.indexOf('/') === 0
    }

    /** 路径末段（Windows/POSIX 分隔符通吃）。 */
    function pathBase(p) {
      var norm = String(p).replace(/\\/g, '/').replace(/\/+$/, '')
      var idx = norm.lastIndexOf('/')
      return idx === -1 ? norm : norm.slice(idx + 1)
    }

    /** 路径父级段列表（自父到子，如 D:\work\car_media → ['D:', 'work']）。 */
    function pathParents(p) {
      var norm = String(p).replace(/\\/g, '/').replace(/\/+$/, '')
      var parts = norm.split('/').filter(function (s) { return s !== '' })
      if (parts.length <= 1) return []
      var out = []
      for (var i = 0; i < parts.length - 1; i++) out.push(parts[i])
      return out
    }

    /**
     * 项目分组显示名消歧（功能文档 §3.2）：末段唯一 → 直接用末段；
     * 末段重名 → 逐级向上带父级，直到候选名在全部项目集合内唯一。
     * 例：D:\work\Temp_Code 与 E:\docs\Temp_Code → work / Temp_Code、docs / Temp_Code。
     */
    function disambiguateProjectNames(paths) {
      var candidates = {}
      for (var i = 0; i < paths.length; i++) {
        var p = paths[i]
        var base = pathBase(p)
        var list = [base]
        var parents = pathParents(p)
        for (var j = parents.length - 1; j >= 0; j--) {
          list.push(parents.slice(j).join(' / ') + ' / ' + base)
        }
        candidates[p] = list
      }
      var result = {}
      for (var k = 0; k < paths.length; k++) {
        var path = paths[k]
        var candList = candidates[path]
        var chosen = candList[candList.length - 1]
        for (var m = 0; m < candList.length; m++) {
          var cand = candList[m]
          var conflict = false
          for (var n = 0; n < paths.length; n++) {
            if (paths[n] !== path && candidates[paths[n]].indexOf(cand) !== -1) { conflict = true; break }
          }
          if (!conflict) { chosen = cand; break }
        }
        result[path] = chosen
      }
      return result
    }

    /** 分组聚合：自定义分组名（出现顺序）+ 项目路径（出现顺序）+ 未分组标记。 */
    function aggregateGroups(commands) {
      var custom = []
      var projects = []
      var hasUngrouped = false
      var seen = {}
      for (var i = 0; i < commands.length; i++) {
        var groups = commands[i].groups || []
        if (groups.length === 0) hasUngrouped = true
        for (var j = 0; j < groups.length; j++) {
          var g = groups[j]
          if (seen[g]) continue
          seen[g] = true
          if (isProjectGroup(g)) projects.push(g)
          else custom.push(g)
        }
      }
      return { custom: custom, projects: projects, hasUngrouped: hasUngrouped }
    }

    /** 分组统计：{ 分组名: 命令数 } + 分组集合。 */
    function groupStats(commands) {
      var count = {}
      var set = {}
      for (var i = 0; i < commands.length; i++) {
        var groups = commands[i].groups || []
        for (var j = 0; j < groups.length; j++) {
          var g = groups[j]
          set[g] = true
          count[g] = (count[g] || 0) + 1
        }
      }
      return { count: count, set: set }
    }

    /** 计算「上次使用」slot（功能文档 §3.4）：指向失效视图时隐藏。 */
    function computeLastUsed(state, model) {
      var id = state.lastUsedViewId
      if (typeof id !== 'string' || id === '') return null
      if (id === 'current-project') {
        return model.cwd ? { id: id, label: '上次：' + pathBase(model.cwd) } : null
      }
      if (id === 'ungrouped') {
        return model.hasUngrouped ? { id: id, label: '上次：未分组' } : null
      }
      if (id.slice(0, 6) === 'group:') {
        var name = id.slice(6)
        if (model.groupSet[name]) {
          var display = model.displayNames[name] || name
          return { id: id, label: '上次：' + display }
        }
      }
      return null
    }

    /**
     * 构建分组模型（T03 侧栏 + 全部视图分节共用）：
     *  - 常驻自定义分组（pinnedGroups ∩ 聚合，按 pinned 顺序）在前；
     *  - 不常驻自定义分组按名字排序；
     *  - 其他项目（非当前 cwd）按 viewLastUsedAt 倒序（设计文档 §3.3）。
     */
    function buildGroupModel(library, state, cwd) {
      var commands = (library && Array.isArray(library.commands)) ? library.commands : []
      var pinned = Array.isArray(state.pinnedGroups) ? state.pinnedGroups.filter(function (g) { return typeof g === 'string' }) : []
      var viewLastUsedAt = (state.viewLastUsedAt !== null && typeof state.viewLastUsedAt === 'object' && !Array.isArray(state.viewLastUsedAt)) ? state.viewLastUsedAt : {}
      var agg = aggregateGroups(commands)
      var stats = groupStats(commands)
      var displayNames = disambiguateProjectNames(agg.projects)
      // 常驻分组：pinnedGroups 中所有非项目分组（§3.3「常驻分组无命令时也显示」——
      // 不在聚合里的常驻分组同样展示，count=0，内容区空态引导）
      var pinnedCustom = pinned.filter(function (g) { return !isProjectGroup(g) })
      var unpinnedCustom = agg.custom.filter(function (g) { return pinned.indexOf(g) === -1 }).sort()
      var otherProjects = agg.projects.filter(function (p) { return p !== cwd }).sort(function (a, b) {
        var ta = typeof viewLastUsedAt['group:' + a] === 'number' ? viewLastUsedAt['group:' + a] : 0
        var tb = typeof viewLastUsedAt['group:' + b] === 'number' ? viewLastUsedAt['group:' + b] : 0
        return tb - ta
      })
      var model = {
        cwd: cwd,
        displayNames: displayNames,
        groupSet: stats.set,
        countByGroup: stats.count,
        pinnedCustom: pinnedCustom,
        unpinnedCustom: unpinnedCustom,
        otherProjects: otherProjects,
        hasUngrouped: agg.hasUngrouped,
        moreCount: otherProjects.length + unpinnedCustom.length,
      }
      model.lastUsed = computeLastUsed(state, model)
      return model
    }

    /** 视图有效性（分组消失 / 项目消失 → 视图失效；无命令常驻分组仍有效，§3.3）。 */
    function isValidView(viewId, model) {
      if (viewId === 'all') return true
      if (viewId === 'recent') return true // 「上次使用」为常驻动态视图（调整记录 #28）
      if (viewId === 'current-project') return !!model.cwd
      if (viewId === 'ungrouped') return model.hasUngrouped
      if (viewId.slice(0, 6) === 'group:') {
        var name = viewId.slice(6)
        return !!model.groupSet[name] || model.pinnedCustom.indexOf(name) !== -1
      }
      return false
    }

    /** 视图 → 命令列表。 */
    function commandsForView(commands, viewId, cwd) {
      if (viewId === 'all') return commands
      if (viewId === 'current-project') {
        return commands.filter(function (c) { return (c.groups || []).indexOf(cwd) !== -1 })
      }
      if (viewId === 'ungrouped') {
        return commands.filter(function (c) { return !c.groups || c.groups.length === 0 })
      }
      if (viewId.slice(0, 6) === 'group:') {
        var name = viewId.slice(6)
        return commands.filter(function (c) { return (c.groups || []).indexOf(name) !== -1 })
      }
      return []
    }

    /** 搜索匹配（F5）：title / cmd / note / tags / groups 任一命中即命中。 */
    function searchMatches(cmd, query) {
      var q = String(query).toLowerCase()
      var title = String(cmd.title || '').toLowerCase().indexOf(q) !== -1
      var body = String(cmd.cmd || '').toLowerCase().indexOf(q) !== -1
      var note = String(cmd.note || '').toLowerCase().indexOf(q) !== -1
      var tags = (cmd.tags || []).some(function (t) { return String(t).toLowerCase().indexOf(q) !== -1 })
      var groups = (cmd.groups || []).some(function (g) { return String(g).toLowerCase().indexOf(q) !== -1 })
      return { hit: title || body || note || tags || groups, title: title, body: body, note: note }
    }

    /** 全部视图分节顺序：当前项目 → 其他项目 → 常驻自定义 → 不常驻自定义。 */
    function allSections(model) {
      var sections = []
      if (model.cwd && model.groupSet[model.cwd]) {
        sections.push({ name: model.cwd, display: model.displayNames[model.cwd] || pathBase(model.cwd) })
      }
      for (var i = 0; i < model.otherProjects.length; i++) {
        var p = model.otherProjects[i]
        sections.push({ name: p, display: model.displayNames[p] })
      }
      for (var j = 0; j < model.pinnedCustom.length; j++) {
        var pc = model.pinnedCustom[j]
        sections.push({ name: pc, display: pc })
      }
      for (var k = 0; k < model.unpinnedCustom.length; k++) {
        var uc = model.unpinnedCustom[k]
        sections.push({ name: uc, display: uc })
      }
      return sections
    }

    /** client 侧会话探测：ctx.get('sessions') → list snapshot 的 current（设计文档 §3.2）。 */
    function getCurrentSessionId(ctx) {
      try {
        var sessions = typeof ctx.get === 'function' ? ctx.get('sessions') : undefined
        if (sessions === null || sessions === undefined) return ''
        var list = sessions.list
        var snap = null
        if (list !== null && typeof list === 'object' && typeof list.getSnapshot === 'function') snap = list.getSnapshot()
        else if (typeof list === 'function') snap = list()
        if (snap === null || typeof snap !== 'object') return ''
        var id = snap.current
        return typeof id === 'string' ? id : ''
      } catch (error) {
        return ''
      }
    }

    // ════════════════════════════════════════════════════════════════════
    // T04 写操作纯逻辑（添加默认勾选 / 危险提示 / 删除计划 / 重命名 / 常驻）
    // ════════════════════════════════════════════════════════════════════

    /** 命令 id 生成：标题 slug + 随机短后缀（仅保证唯一，非展示用途）。 */
    function generateCommandId(title) {
      var base = String(title || 'cmd')
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 24) || 'cmd'
      return base + '-' + Math.random().toString(36).slice(2, 6)
    }

    /** 危险关键词（设计文档 §4.3：rm/del/format/wipe/reboot 等，前端提示不强制）。 */
    var DANGER_PATTERNS = [
      { kw: 'rm', re: /(^|[^\w-])rm([\s;|&]|$)/ },
      { kw: 'del', re: /(^|[^\w-])del([\s;|&]|$)/ },
      { kw: 'format', re: /(^|[^\w-])format([\s;|&]|$)/ },
      { kw: 'wipe', re: /(^|[^\w-])wipe([\s;|&]|$)/ },
      { kw: 'reboot', re: /(^|[^\w-])reboot([\s;|&]|$)/ },
      { kw: 'shutdown', re: /(^|[^\w-])shutdown([\s;|&]|$)/ },
      { kw: 'drop table', re: /drop\s+table/ },
      { kw: 'truncate', re: /(^|[^\w-])truncate([\s;|&]|$)/ },
      { kw: 'rd /s', re: /(^|[^\w-])rd\s*\/s/ },
      { kw: 'rmdir /s', re: /(^|[^\w-])rmdir\s*\/s/ },
    ]

    /** 检测命令文本中的危险关键词（词边界匹配，避免 format 内含 rm 之类误报）。 */
    function dangerKeywordHits(cmdText) {
      var text = String(cmdText || '').toLowerCase()
      var hits = []
      for (var i = 0; i < DANGER_PATTERNS.length; i++) {
        if (DANGER_PATTERNS[i].re.test(text)) hits.push(DANGER_PATTERNS[i].kw)
      }
      return hits
    }

    /**
     * 「上次使用」视图（用户定稿 2026-08-2x，调整记录 #28）：
     * 动态最近使用命令视图（替换原「常用」分组概念），**保留 100 条、显示 20 条**，
     * 复制/运行即记录；范围可切换 项目/全部（仅当前项目 vs 所有项目）。
     */
    var RECENT_CAP = 100
    var RECENT_SHOW = 20

    /** 去重置顶 + 保留上限（同命令重复使用移到最前，旧记录顺延）。 */
    function pushRecent(recent, cmdId) {
      var arr = Array.isArray(recent) ? recent.slice() : []
      var next = [{ id: cmdId, at: Date.now() }]
      for (var i = 0; i < arr.length; i++) {
        if (arr[i] !== null && typeof arr[i] === 'object' && arr[i].id === cmdId) continue
        next.push(arr[i])
      }
      if (next.length > RECENT_CAP) next.length = RECENT_CAP
      return next
    }

    /** 解析「上次使用」视图命令：按记录倒序解析到命令库（已删除的命令跳过），
     *  scope='project' 时仅保留属于当前项目（groups 含 cwd）的命令；最多返回 limit 条。 */
    function recentCommandsView(commands, recent, scope, cwd, limit) {
      var list = Array.isArray(commands) ? commands : []
      var byId = {}
      for (var i = 0; i < list.length; i++) byId[list[i].id] = list[i]
      var recs = Array.isArray(recent) ? recent : []
      var out = []
      var cap = (typeof limit === 'number' && limit > 0) ? limit : RECENT_SHOW
      for (var j = 0; j < recs.length && out.length < cap; j++) {
        var rec = recs[j]
        if (rec === null || typeof rec !== 'object' || typeof rec.id !== 'string') continue
        var cmd = byId[rec.id]
        if (cmd === undefined) continue
        if (scope === 'project' && (cmd.groups || []).indexOf(cwd) === -1) continue
        out.push(cmd)
      }
      return out
    }

    /**
     * 添加表单默认勾选分组（设计文档 §3.5）：
     *  - group:<x> 视图 → [x]（含不常驻分组——「提升展示并默认勾选」）；
     *  - current-project 视图 → [cwd]；
     *  - ungrouped 视图 → []（保持未分组）；
     *  - all / 搜索态 → 上次使用的分组 → 当前项目（取第一个存在的；原「常用」
     *    兜底按用户定稿移除，调整记录 #28——「常用」概念已由「上次使用」视图取代）。
     */
    function defaultCheckedGroups(viewId, model, state, cwd) {
      if (viewId.slice(0, 6) === 'group:') {
        var g = viewId.slice(6)
        return model.groupSet[g] ? [g] : []
      }
      if (viewId === 'current-project') return cwd ? [cwd] : []
      if (viewId === 'ungrouped') return []
      // all / 搜索态
      var lastUsed = state.lastUsedViewId
      if (typeof lastUsed === 'string' && lastUsed.slice(0, 6) === 'group:') {
        var lu = lastUsed.slice(6)
        if (model.groupSet[lu]) return [lu]
      }
      if (cwd && model.groupSet[cwd]) return [cwd]
      return []
    }

    /**
     * 命令删除计划（设计文档 §3.5 语境语义）：
     *  - 在 group:<x> 视图且命令还属于其他分组 → unlink（仅解除 x 关联，静默）；
     *  - 否则 → remove（彻底删除，需确认弹窗）。
     */
    function deletionPlan(cmd, viewId) {
      if (viewId.slice(0, 6) === 'group:') {
        var g = viewId.slice(6)
        var groups = cmd.groups || []
        if (groups.indexOf(g) !== -1 && groups.length > 1) {
          return { mode: 'unlink', group: g }
        }
      }
      return { mode: 'remove' }
    }

    /**
     * 分组删除影响（设计文档 §3.5）：N 条命令解除关联，其中 M 条仅此分组的将彻底删除。
     */
    function groupDeletionPlan(groupName, library) {
      var commands = (library && Array.isArray(library.commands)) ? library.commands : []
      var affected = []
      var deletedOnly = []
      for (var i = 0; i < commands.length; i++) {
        var groups = commands[i].groups || []
        if (groups.indexOf(groupName) === -1) continue
        affected.push(commands[i])
        if (groups.length === 1) deletedOnly.push(commands[i])
      }
      return { affected: affected, deletedOnly: deletedOnly }
    }

    /**
     * 分组重命名（仅自定义分组，级联更新）：newName 与现有分组名冲突（非自身）→
     * 返回 { ok:false, reason }；否则返回级联后的新 library 与受影响命令数。
     */
    function renameGroup(library, oldName, newName, existingGroups) {
      if (typeof newName !== 'string' || newName.trim() === '' || /[\r\n]/.test(newName)) {
        return { ok: false, reason: '分组名不能为空或包含换行' }
      }
      newName = newName.trim()
      if (newName === oldName) return { ok: false, reason: '新旧分组名相同' }
      if (existingGroups && existingGroups[newName]) {
        return { ok: false, reason: '分组名「' + newName + '」已存在' }
      }
      var commands = (library && Array.isArray(library.commands)) ? library.commands : []
      var changed = 0
      var next = commands.map(function (c) {
        var groups = c.groups || []
        if (groups.indexOf(oldName) === -1) return c
        changed++
        return Object.assign({}, c, { groups: groups.map(function (g) { return g === oldName ? newName : g }) })
      })
      return { ok: true, library: Object.assign({}, library, { commands: next }), changed: changed }
    }

    /** 常驻切换：返回更新后的 pinnedGroups（加入/移除，保持顺序）。 */
    function togglePinned(pinnedGroups, groupName) {
      var pinned = Array.isArray(pinnedGroups) ? pinnedGroups.slice() : []
      var idx = pinned.indexOf(groupName)
      if (idx === -1) pinned.push(groupName)
      else pinned.splice(idx, 1)
      return pinned
    }

    // ════════════════════════════════════════════════════════════════════
    // DOM 小工具 / SVG
    // ════════════════════════════════════════════════════════════════════

    function el(tag, cls, text) {
      var node = document.createElement(tag)
      if (cls) node.className = cls
      if (text !== undefined && text !== null) node.textContent = text
      return node
    }

    function clearEl(node) {
      while (node.children.length > 0) node.removeChild(node.children[0])
    }

    function appendNodes(node, nodes) {
      for (var i = 0; i < nodes.length; i++) node.appendChild(nodes[i])
    }

    /** 沿 parentNode 向上找首个满足谓词的元素（不依赖 el.closest，stub 友好）。 */
    function closestUp(el, predicate) {
      var cur = el
      while (cur !== null) {
        if (predicate(cur)) return cur
        cur = cur.parentNode
      }
      return null
    }

    var FAB_SVG = [
      '<svg viewBox="0 0 16 16" width="16" height="16" fill="none"',
      '     stroke="currentColor" stroke-width="1.5"',
      '     stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
      '  <rect x="1.25" y="1.25" width="13.5" height="13.5" rx="2.5"/>',
      '  <path d="M4.5 5.5 7 8l-2.5 2.5"/>',
      '  <path d="M8.5 10.5h3"/>',
      '</svg>',
    ].join('')

    // 搜索放大镜（视觉规范 §3.2：16 viewBox / 1.5px stroke / currentColor / round）
    var SEARCH_SVG = [
      '<svg viewBox="0 0 16 16" width="12" height="12" fill="none"',
      '     stroke="currentColor" stroke-width="1.5"',
      '     stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
      '  <circle cx="7" cy="7" r="4.5"/>',
      '  <path d="m10.5 10.5 3 3"/>',
      '</svg>',
    ].join('')

    // 「上次使用」视图范围帮助图标 ⓘ（用户定稿 2026-08-2x：小圆形 + 空心问号；
    // 视觉规范 §3.2 同款规格：16 viewBox / 1.5px stroke / currentColor / round caps）
    var HELP_SVG = [
      '<svg viewBox="0 0 16 16" width="14" height="14" fill="none"',
      '     stroke="currentColor" stroke-width="1.5"',
      '     stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
      '  <circle cx="8" cy="8" r="6.25"/>',
      '  <path d="M6.1 6.25a1.95 1.95 0 1 1 3.55 1.05c-.75.85-1.6 1.1-1.6 2.3"/>',
      '  <path d="M8 12.5h.01"/>',
      '</svg>',
    ].join('')

    /** 搜索命中高亮：query 命中的子串包 <span class="cmd-pad-hit">。 */
    function highlightText(text, query) {
      text = String(text || '')
      if (!query) return [document.createTextNode(text)]
      var lower = text.toLowerCase()
      var q = String(query).toLowerCase()
      var nodes = []
      var pos = 0
      for (;;) {
        var idx = lower.indexOf(q, pos)
        if (idx === -1) break
        if (idx > pos) nodes.push(document.createTextNode(text.slice(pos, idx)))
        var mark = document.createElement('span')
        mark.className = 'cmd-pad-hit'
        mark.textContent = text.slice(idx, idx + query.length)
        nodes.push(mark)
        pos = idx + query.length
      }
      if (pos < text.length) nodes.push(document.createTextNode(text.slice(pos)))
      if (nodes.length === 0) nodes.push(document.createTextNode(text))
      return nodes
    }

    // ════════════════════════════════════════════════════════════════════
    // 浮动图标 + 抽屉外壳（T01 不变；T03 填充 body 内容区）
    // ════════════════════════════════════════════════════════════════════

    function createRoot() {
      var root = document.createElement('div')
      root.setAttribute('data-dsh-cmd-pad', '')
      return root
    }

    function createFab(onToggle) {
      var fab = document.createElement('button')
      fab.type = 'button'
      fab.className = 'cmd-pad-fab'
      fab.title = '命令面板'
      fab.setAttribute('aria-label', '命令面板')
      fab.innerHTML = FAB_SVG
      fab.addEventListener('click', onToggle)
      return fab
    }

    /**
     * 面板内容骨架（T03 布局，用户定稿：搜索 → 分组横条 → 命令区，上下结构）。
     * 降级抽屉与主形态 Tab 共用同一份骨架（T06：内容区两形态 100% 复用）。
     * 返回 { body, searchInput, searchCount, groupsEl, contentEl, clearBtn }。
     */
    function createPanelBody(bodyClass) {
      // 搜索栏（T03）：放大镜 + input + 计数 + 清空
      var search = document.createElement('div')
      search.className = 'cmd-pad-search'

      var searchIcon = document.createElement('span')
      searchIcon.innerHTML = SEARCH_SVG
      search.appendChild(searchIcon)

      var searchInput = document.createElement('input')
      searchInput.type = 'text'
      searchInput.className = 'cmd-pad-search-input'
      searchInput.placeholder = '搜索命令（/）'
      searchInput.setAttribute('aria-label', '搜索命令')
      search.appendChild(searchInput)

      var searchCount = document.createElement('span')
      searchCount.className = 'cmd-pad-search-count'
      search.appendChild(searchCount)

      var searchClear = document.createElement('button')
      searchClear.type = 'button'
      searchClear.className = 'cmd-pad-search-clear'
      searchClear.title = '清空搜索（Esc）'
      searchClear.setAttribute('aria-label', '清空搜索')
      searchClear.textContent = '\u2715'
      search.appendChild(searchClear)

      // 布局（用户定稿：搜索 → 分组横条 → 命令区，上下结构）
      var groupsEl = document.createElement('div')
      groupsEl.className = 'cmd-pad-groups'

      var contentEl = document.createElement('div')
      contentEl.className = 'cmd-pad-content'

      var body = document.createElement('div')
      body.className = bodyClass || 'cmd-pad-drawer-body'
      body.appendChild(search)
      body.appendChild(groupsEl)
      body.appendChild(contentEl)

      return { body: body, searchInput: searchInput, searchCount: searchCount, groupsEl: groupsEl, contentEl: contentEl, clearBtn: searchClear }
    }

    /**
     * 抽屉外壳（T01）：head（标题 + + 添加 + ✕）+ 面板内容骨架。
     * 返回 { drawer, addBtn, searchInput, searchCount, groupsEl, contentEl }。
     */
    function createDrawer(onClose) {
      var drawer = document.createElement('div')
      drawer.className = 'cmd-pad-drawer'
      drawer.setAttribute('data-open', 'false')

      var head = document.createElement('div')
      head.className = 'cmd-pad-drawer-head'

      var title = document.createElement('span')
      title.className = 'cmd-pad-drawer-title'
      title.textContent = '命令'

      var addBtn = document.createElement('button')
      addBtn.type = 'button'
      addBtn.className = 'cmd-pad-add'
      addBtn.textContent = '+ 添加'
      addBtn.title = '添加命令'
      addBtn.setAttribute('aria-label', '添加命令')

      var spacer = document.createElement('span')
      spacer.style.flex = '1'

      var close = document.createElement('button')
      close.type = 'button'
      close.className = 'cmd-pad-drawer-close'
      close.title = '关闭（Esc）'
      close.setAttribute('aria-label', '关闭')
      close.textContent = '\u2715'
      close.addEventListener('click', onClose)

      head.appendChild(title)
      head.appendChild(spacer)
      head.appendChild(addBtn)
      head.appendChild(close)

      var body = createPanelBody('cmd-pad-drawer-body')

      drawer.appendChild(head)
      drawer.appendChild(body.body)
      return { drawer: drawer, addBtn: addBtn, searchInput: body.searchInput, searchCount: body.searchCount, groupsEl: body.groupsEl, contentEl: body.contentEl, clearBtn: body.clearBtn, body: body.body }
    }

    // ── 分组行 / 上次 slot / 更多（T03 渲染）──

    function groupRow(prefixText, nameText, count, viewId, active) {
      var row = el('div', 'cmd-pad-group-row')
      row.setAttribute('data-view-id', viewId)
      if (active) row.setAttribute('data-active', 'true')
      if (prefixText) {
        var p = el('span', 'cmd-pad-group-prefix', prefixText)
        row.appendChild(p)
      }
      var n = el('span', 'cmd-pad-group-name', nameText)
      n.title = nameText
      row.appendChild(n)
      if (count !== null && count !== undefined) {
        var c = el('span', 'cmd-pad-group-count', String(count))
        row.appendChild(c)
      }
      return row
    }

    function moreToggle(count, expanded) {
      var btn = el('button', 'cmd-pad-more-toggle')
      btn.type = 'button'
      btn.setAttribute('data-more-toggle', '')
      btn.setAttribute('aria-expanded', expanded ? 'true' : 'false')
      btn.title = expanded ? '收起更多分组' : '展开更多分组（' + count + '）'
      // 调整记录 #26：仅箭头图标（无「更多」文字与计数，计数入 title）；横向内联展开 →
      // 方向按行业常规（VS Code 面板 »/« 式）：折叠 ▸（指向右侧隐藏内容）/ 展开 ◂（指向收起方向）
      btn.textContent = expanded ? '\u25c2' : '\u25b8'
      return btn
    }

    function moreBody(model, activeView) {
      var wrap = el('div', 'cmd-pad-more-body')
      if (model.otherProjects.length > 0) {
        wrap.appendChild(el('div', 'cmd-pad-more-section', '其他项目'))
        for (var i = 0; i < model.otherProjects.length; i++) {
          var p = model.otherProjects[i]
          wrap.appendChild(groupRow(null, model.displayNames[p], model.countByGroup[p], 'group:' + p, activeView === 'group:' + p))
        }
      }
      if (model.unpinnedCustom.length > 0) {
        // 调整记录 #26：去掉「分组」小节标题（展开区内均为分组，标题冗余；「其他项目」小节保留以区分项目分组）
        for (var j = 0; j < model.unpinnedCustom.length; j++) {
          var g = model.unpinnedCustom[j]
          wrap.appendChild(groupRow(null, g, model.countByGroup[g], 'group:' + g, activeView === 'group:' + g))
        }
      }
      return wrap
    }

    // ── 命令卡片 / 分节 / 空态（T03 渲染）──

    // T07 模块级运行入口标志：主形态 panel 置 true（降级形态永远 false）。
    // 模块级而非 panel 级：同页面只会存在一种形态（主形态多会话 panel 均为 true），
    // cardEl 是模块级渲染函数，无法闭包访问 panel 局部变量。
    var runEnabledFlag = false

    function cardEl(cmd, query) {
      var card = el('div', 'cmd-pad-card')
      card.setAttribute('data-cmd-id', cmd.id)
      var titleRow = el('div', 'cmd-pad-card-title-row')
      var title = el('span', 'cmd-pad-card-title')
      appendNodes(title, highlightText(cmd.title, query))
      titleRow.appendChild(title)
      if (cmd.danger === true) titleRow.appendChild(el('span', 'cmd-pad-card-danger', '危险'))
      card.appendChild(titleRow)
      var cmdBlock = el('div', 'cmd-pad-card-cmd')
      cmdBlock.setAttribute('data-copy-cmd', '')
      cmdBlock.title = '点击复制'
      appendNodes(cmdBlock, highlightText(cmd.cmd, query))
      card.appendChild(cmdBlock)
      if (cmd.note) {
        var note = el('div', 'cmd-pad-card-note')
        appendNodes(note, highlightText(cmd.note, query))
        card.appendChild(note)
      }
      var actions = el('div', 'cmd-pad-card-actions')
      // T07：运行按钮仅主形态（有 better-sidebar 终端直写通道）渲染；降级形态只复制（用户决策）
      if (runEnabledFlag) {
        var runBtn = el('button', 'cmd-pad-btn cmd-pad-btn-run', '运行')
        runBtn.type = 'button'
        runBtn.setAttribute('data-run-cmd', '')
        runBtn.title = '在新终端中运行'
        actions.appendChild(runBtn)
      }
      var copyBtn = el('button', 'cmd-pad-btn', '复制')
      copyBtn.type = 'button'
      copyBtn.setAttribute('data-copy-cmd', '')
      actions.appendChild(copyBtn)
      card.appendChild(actions)
      return card
    }

    function sectionEl(display, count, commands, query) {
      var sec = el('div', 'cmd-pad-section')
      var titleRow = el('div', 'cmd-pad-section-title')
      titleRow.appendChild(el('span', null, display))
      titleRow.appendChild(el('span', 'cmd-pad-section-count', String(count)))
      sec.appendChild(titleRow)
      for (var i = 0; i < commands.length; i++) sec.appendChild(cardEl(commands[i], query))
      return sec
    }

    function emptyEl(text) {
      return el('div', 'cmd-pad-empty', text)
    }

    // ════════════════════════════════════════════════════════════════════
    // T04 写操作 DOM：分组多选 / 表单弹窗 / 确认弹窗 / 重命名弹窗 / 右键菜单
    // ════════════════════════════════════════════════════════════════════

    /**
     * 分组多选列表（设计文档 §3.5）：自定义分组（常驻在前）→ 项目分组分区；
     * 分组 > 8 个时，未勾选且不常驻的收进「显示全部分组 ▸」折叠区。
     * checkedSet 为可变对象（收集勾选状态）。
     */
    function groupCheckListEl(groupOptions, checkedSet, onChange) {
      var wrap = el('div', 'cmd-pad-group-checks')
      var custom = groupOptions.filter(function (o) { return !isProjectGroup(o.name) })
      var projects = groupOptions.filter(function (o) { return isProjectGroup(o.name) })
      var orderedCustom = custom.filter(function (o) { return o.pinned }).concat(custom.filter(function (o) { return !o.pinned }))
      var all = orderedCustom.concat(projects)

      var moreExpanded = false
      function render() {
        clearEl(wrap)
        var visible = all
        var folded = []
        if (all.length > 8) {
          visible = all.filter(function (o) { return checkedSet[o.name] || o.pinned || isProjectGroup(o.name) })
          folded = all.filter(function (o) { return !checkedSet[o.name] && !o.pinned && !isProjectGroup(o.name) })
        }
        var shownCustom = 0
        var shownProject = 0
        for (var i = 0; i < visible.length; i++) {
          var o = visible[i]
          if (isProjectGroup(o.name)) {
            if (shownProject === 0) wrap.appendChild(el('div', 'cmd-pad-group-check-section', '项目分组'))
            shownProject++
          } else if (shownCustom === 0 && !o.pinned) {
            wrap.appendChild(el('div', 'cmd-pad-group-check-section', '自定义分组'))
          } else if (shownCustom === 0) {
            wrap.appendChild(el('div', 'cmd-pad-group-check-section', '自定义分组'))
          }
          if (!isProjectGroup(o.name)) shownCustom++
          wrap.appendChild(checkRow(o))
        }
        if (folded.length > 0) {
          if (moreExpanded) {
            wrap.appendChild(el('div', 'cmd-pad-group-check-section', '显示全部分组'))
            for (var j = 0; j < folded.length; j++) wrap.appendChild(checkRow(folded[j]))
          } else {
            var more = el('button', 'cmd-pad-more-groups', '显示全部分组 ▸（' + folded.length + '）')
            more.type = 'button'
            more.addEventListener('click', function () { moreExpanded = true; render() })
            wrap.appendChild(more)
          }
        }
      }
      function checkRow(o) {
        var row = el('div', 'cmd-pad-group-check')
        if (checkedSet[o.name]) row.setAttribute('data-checked', 'true')
        row.setAttribute('data-group', o.name)
        var box = el('span', null, checkedSet[o.name] ? '\u2611' : '\u2610')
        row.appendChild(box)
        row.appendChild(el('span', null, o.display))
        row.addEventListener('click', function () {
          if (checkedSet[o.name]) {
            delete checkedSet[o.name]
            row.removeAttribute('data-checked')
            box.textContent = '\u2610'
          } else {
            checkedSet[o.name] = true
            row.setAttribute('data-checked', 'true')
            box.textContent = '\u2611'
          }
          if (typeof onChange === 'function') onChange()
        })
        return row
      }
      render()
      return wrap
    }

    /**
     * 添加/编辑命令表单弹窗。opts: { mode, cmd?, groupOptions, checkedSet, onCancel, onSubmit(payload) }。
     * payload = { title, cmd, note, danger, groups }。
     */
    function buildFormModal(opts) {
      var isEdit = opts.mode === 'edit'
      var modal = el('div', 'cmd-pad-modal')
      modal.appendChild(el('div', 'cmd-pad-modal-title', isEdit ? '编辑命令' : '添加命令'))

      var titleRow = el('div', 'cmd-pad-form-row')
      titleRow.appendChild(el('label', 'cmd-pad-form-label', '标题'))
      var titleInput = el('input', 'cmd-pad-form-input')
      titleInput.type = 'text'
      if (opts.cmd) titleInput.value = opts.cmd.title || ''
      titleRow.appendChild(titleInput)

      var cmdRow = el('div', 'cmd-pad-form-row')
      cmdRow.appendChild(el('label', 'cmd-pad-form-label', '命令'))
      var cmdInput = el('textarea', 'cmd-pad-form-input cmd-pad-form-textarea')
      if (opts.cmd) cmdInput.value = opts.cmd.cmd || ''
      cmdRow.appendChild(cmdInput)
      var dangerHint = el('div', 'cmd-pad-form-hint')
      cmdRow.appendChild(dangerHint)

      var dangerRow = el('div', 'cmd-pad-form-row')
      var dangerLabel = el('label', 'cmd-pad-checkbox-row')
      var dangerCheck = document.createElement('input')
      dangerCheck.type = 'checkbox'
      if (opts.cmd && opts.cmd.danger === true) dangerCheck.checked = true
      dangerLabel.appendChild(dangerCheck)
      dangerLabel.appendChild(el('span', null, '危险命令（卡片显示危险徽标；未来运行通道恢复时需二次确认）'))
      dangerRow.appendChild(dangerLabel)

      var noteRow = el('div', 'cmd-pad-form-row')
      noteRow.appendChild(el('label', 'cmd-pad-form-label', '备注'))
      var noteInput = el('input', 'cmd-pad-form-input')
      if (opts.cmd) noteInput.value = opts.cmd.note || ''
      noteRow.appendChild(noteInput)

      var groupRow = el('div', 'cmd-pad-form-row')
      groupRow.appendChild(el('label', 'cmd-pad-form-label', '分组'))
      var checksWrap = groupCheckListEl(opts.groupOptions, opts.checkedSet)
      groupRow.appendChild(checksWrap)
      var newGroupInput = el('input', 'cmd-pad-form-input')
      newGroupInput.placeholder = '新建分组名（保存时自动创建）'
      newGroupInput.style.marginTop = '6px'
      groupRow.appendChild(newGroupInput)

      // 危险关键词提示（设计文档 §4.3：前端提示 + 自动勾选，用户可取消）
      cmdInput.addEventListener('input', function () {
        var hits = dangerKeywordHits(cmdInput.value)
        if (hits.length > 0) {
          dangerHint.textContent = '检测到危险关键词：' + hits.join('、') + ' —— 已勾选「危险命令」，可取消'
          dangerCheck.checked = true
        } else {
          dangerHint.textContent = ''
        }
      })

      var actions = el('div', 'cmd-pad-form-actions')
      var cancelBtn = el('button', 'cmd-pad-btn', '取消')
      cancelBtn.type = 'button'
      var saveBtn = el('button', 'cmd-pad-btn-primary', '保存')
      saveBtn.type = 'button'
      cancelBtn.addEventListener('click', function () { if (typeof opts.onCancel === 'function') opts.onCancel() })
      saveBtn.addEventListener('click', function () {
        var title = titleInput.value.trim()
        var cmdText = cmdInput.value
        var notify = typeof opts.toast === 'function' ? opts.toast : function () {}
        if (title === '') { notify('标题不能为空', 'error'); titleInput.focus(); return }
        if (cmdText === '') { notify('命令不能为空', 'error'); cmdInput.focus(); return }
        var groups = []
        for (var name in opts.checkedSet) {
          if (Object.prototype.hasOwnProperty.call(opts.checkedSet, name) && opts.checkedSet[name]) groups.push(name)
        }
        var newGroup = newGroupInput.value.trim()
        var notify2 = typeof opts.toast === 'function' ? opts.toast : function () {}
        if (newGroup !== '' && /[\r\n]/.test(newGroup)) { notify2('分组名不能包含换行', 'error'); return }
        if (newGroup !== '' && groups.indexOf(newGroup) === -1) groups.push(newGroup)
        opts.onSubmit({ title: title, cmd: cmdText, note: noteInput.value.trim(), danger: dangerCheck.checked, groups: groups })
      })
      actions.appendChild(cancelBtn)
      actions.appendChild(saveBtn)
      modal.appendChild(titleRow)
      modal.appendChild(cmdRow)
      modal.appendChild(dangerRow)
      modal.appendChild(noteRow)
      modal.appendChild(groupRow)
      modal.appendChild(actions)
      return modal
    }

    /** 确认弹窗。opts: { title, message, danger?, okLabel?, onCancel, onConfirm }。 */
    function buildConfirmModal(opts) {
      var modal = el('div', 'cmd-pad-modal')
      modal.appendChild(el('div', 'cmd-pad-modal-title', opts.title))
      modal.appendChild(el('div', 'cmd-pad-modal-message', opts.message))
      var actions = el('div', 'cmd-pad-form-actions')
      var cancelBtn = el('button', 'cmd-pad-btn', '取消')
      cancelBtn.type = 'button'
      var okBtn = el('button', 'cmd-pad-btn' + (opts.danger ? ' cmd-pad-btn-danger' : ' cmd-pad-btn-primary'), opts.okLabel || '确定')
      okBtn.type = 'button'
      cancelBtn.addEventListener('click', function () { if (typeof opts.onCancel === 'function') opts.onCancel() })
      okBtn.addEventListener('click', function () { if (typeof opts.onConfirm === 'function') opts.onConfirm() })
      actions.appendChild(cancelBtn)
      actions.appendChild(okBtn)
      modal.appendChild(actions)
      return modal
    }

    /** T07：危险命令运行确认弹窗（双人工确认，功能文档 §4.3）——命令原文 + 确认/取消。 */
    function buildRunConfirmModal(cmd, onCancel, onConfirm) {
      var modal = el('div', 'cmd-pad-modal')
      modal.appendChild(el('div', 'cmd-pad-modal-title', '运行危险命令'))
      modal.appendChild(el('div', 'cmd-pad-modal-message',
        '以下命令已标记为危险。将在新终端中打开并停在提示符（不会自动执行），请确认命令内容，并在终端中亲自回车执行：'))
      var pre = el('div', 'cmd-pad-modal-pre')
      pre.textContent = cmd.cmd
      modal.appendChild(pre)
      var actions = el('div', 'cmd-pad-form-actions')
      var cancelBtn = el('button', 'cmd-pad-btn', '取消')
      cancelBtn.type = 'button'
      var okBtn = el('button', 'cmd-pad-btn cmd-pad-btn-danger', '确认，打开终端')
      okBtn.type = 'button'
      cancelBtn.addEventListener('click', function () { if (typeof onCancel === 'function') onCancel() })
      okBtn.addEventListener('click', function () { if (typeof onConfirm === 'function') onConfirm() })
      actions.appendChild(cancelBtn)
      actions.appendChild(okBtn)
      modal.appendChild(actions)
      return modal
    }
    function buildRenameModal(currentName, onCancel, onConfirm) {
      var modal = el('div', 'cmd-pad-modal')
      modal.appendChild(el('div', 'cmd-pad-modal-title', '重命名分组'))
      modal.appendChild(el('div', 'cmd-pad-modal-message', '将「' + currentName + '」重命名为：'))
      var input = el('input', 'cmd-pad-form-input')
      input.type = 'text'
      input.value = currentName
      modal.appendChild(input)
      var actions = el('div', 'cmd-pad-form-actions')
      var cancelBtn = el('button', 'cmd-pad-btn', '取消')
      cancelBtn.type = 'button'
      var okBtn = el('button', 'cmd-pad-btn-primary', '确定')
      okBtn.type = 'button'
      cancelBtn.addEventListener('click', function () { if (typeof onCancel === 'function') onCancel() })
      okBtn.addEventListener('click', function () { if (typeof onConfirm === 'function') onConfirm(input.value) })
      actions.appendChild(cancelBtn)
      actions.appendChild(okBtn)
      modal.appendChild(actions)
      return modal
    }

    // ── 右键菜单（模块级单例：同时只存在一个）──
    var contextMenuEl = null

    function closeContextMenu() {
      if (contextMenuEl !== null && contextMenuEl.parentNode !== null) contextMenuEl.parentNode.removeChild(contextMenuEl)
      contextMenuEl = null
    }

    /** items: [{ label, danger?, onClick } | { sep: true }]。点击项后自动关闭。 */
    function openContextMenu(x, y, items) {
      closeContextMenu()
      var menu = el('div', 'cmd-pad-menu')
      for (var i = 0; i < items.length; i++) {
        var it = items[i]
        if (it.sep) {
          menu.appendChild(el('div', 'cmd-pad-menu-sep'))
          continue
        }
        var btn = el('button', 'cmd-pad-menu-item', it.label)
        btn.type = 'button'
        if (it.danger) btn.setAttribute('data-danger', 'true')
        btn.addEventListener('click', (function (fn) {
          return function () { closeContextMenu(); fn() }
        })(it.onClick))
        menu.appendChild(btn)
      }
      document.body.appendChild(menu)
      // 视口内 clamp（offsetWidth 在 stub 中缺失时用保守估算）
      var w = menu.offsetWidth || 160
      var h = menu.offsetHeight || items.length * 28
      menu.style.left = Math.max(8, Math.min(x, window.innerWidth - w - 8)) + 'px'
      menu.style.top = Math.max(8, Math.min(y, window.innerHeight - h - 8)) + 'px'
      contextMenuEl = menu
      // 点击菜单外任意处关闭（延迟一拍，避免本次 contextmenu 的合成事件误关）
      setTimeout(function () {
        document.addEventListener('click', closeContextMenu, { once: true })
      }, 0)
    }

    // ════════════════════════════════════════════════════════════════════
    // 复制 / Toast / 数据（T03）
    // ════════════════════════════════════════════════════════════════════

    /** 复制到剪贴板：navigator.clipboard 优先，失败回退 execCommand。 */
    function copyText(text, onDone) {
      var nav = typeof window !== 'undefined' ? window.navigator : undefined
      if (nav !== undefined && nav.clipboard !== undefined && typeof nav.clipboard.writeText === 'function') {
        var settled = false
        var settle = function (ok) {
          if (settled) return
          settled = true
          onDone(ok)
        }
        var p
        try { p = nav.clipboard.writeText(text) } catch (error) { p = Promise.reject(error) }
        Promise.resolve(p).then(function () { settle(true) }, function () { fallbackCopy(text, settle) })
        return
      }
      fallbackCopy(text, onDone)
    }

    function fallbackCopy(text, onDone) {
      var ok = false
      try {
        var ta = document.createElement('textarea')
        ta.value = text
        ta.setAttribute('readonly', '')
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        ok = document.execCommand('copy')
        document.body.removeChild(ta)
      } catch (error) {
        ok = false
      }
      onDone(ok)
    }

    /**
     * Toast：默认右下角；传入 anchor 时定位到该元素**左侧**（垂直居中，视口内 clamp，
     * 左侧放不下时改放右侧）。单条复用，4s 自动隐藏；支持操作按钮（如「撤销」）。
     */
    function createToast(root) {
      var toast = el('div', 'cmd-pad-toast')
      var msg = el('span')
      var actionBtn = el('button', 'cmd-pad-toast-action')
      toast.appendChild(msg)
      toast.appendChild(actionBtn)
      root.appendChild(toast)
      var timer = null
      var currentAction = null
      actionBtn.addEventListener('click', function () {
        if (currentAction === null) return
        var fn = currentAction
        currentAction = null
        if (timer !== null) { clearTimeout(timer); timer = null }
        toast.removeAttribute('data-show')
        fn()
      })
      function positionByAnchor(anchor) {
        var st = toast.style
        if (anchor === null || anchor === undefined || typeof anchor.getBoundingClientRect !== 'function') {
          // 默认：右下角（浮动图标上方）
          st.removeProperty('left')
          st.removeProperty('top')
          st.right = '16px'
          st.bottom = '64px'
          return
        }
        var r = anchor.getBoundingClientRect()
        var w = toast.offsetWidth || 160
        var h = toast.offsetHeight || 30
        var left = r.left - w - 8
        if (left < 8) left = r.right + 8 // 左侧放不下 → 放右侧
        var top = r.top + (r.height / 2) - (h / 2)
        if (top < 8) top = 8
        if (top + h > window.innerHeight - 8) top = window.innerHeight - h - 8
        st.left = left + 'px'
        st.top = top + 'px'
        st.right = 'auto'
        st.bottom = 'auto'
      }
      return function showToast(message, kind, actionLabel, onAction, anchor) {
        msg.textContent = message
        if (typeof actionLabel === 'string' && typeof onAction === 'function') {
          actionBtn.textContent = actionLabel
          actionBtn.style.display = ''
          currentAction = onAction
        } else {
          actionBtn.textContent = ''
          actionBtn.style.display = 'none'
          currentAction = null
        }
        if (kind === 'error') toast.setAttribute('data-kind', 'error')
        else toast.removeAttribute('data-kind')
        positionByAnchor(anchor)
        toast.setAttribute('data-show', 'true')
        if (timer !== null) clearTimeout(timer)
        // 普通提示 1s（用户定稿 #19）；带操作按钮（撤销）的 Toast 保持 5s 与撤销窗口一致
        timer = setTimeout(function () {
          toast.removeAttribute('data-show')
          timer = null
        }, typeof actionLabel === 'string' && typeof onAction === 'function' ? 5000 : 1000)
      }
    }

    /** GET /cmd-pad/api/library?sessionId=<id>（host 返回 { library, state, cwd, mtime }）。 */
    function loadLibrary(ctx) {
      var sessionId = getCurrentSessionId(ctx)
      var url = '/cmd-pad/api/library'
      if (sessionId !== '') url += '?sessionId=' + encodeURIComponent(sessionId)
      return window.fetch(url).then(function (res) {
        if (!res.ok) throw new Error('library fetch failed: ' + res.status)
        return res.json()
      })
    }

    // ════════════════════════════════════════════════════════════════════
    // T07 终端直写运行通道（主形态；接入规范 §3 协议，v0.13.1 实机实证）
    //
    // 用户决策（TASK.md 调整记录 #21 后确认，2026-08-23）：
    //   - 运行 = **新拉起专用终端 Tab**（bs.openTab 新开，不复用用户活跃终端）→
    //     短命 WS 附加 /sidebar/ws/terminal 发送命令 → bare drop；
    //   - 终端直写失败（配额满 / 设置页禁用 / 新开被拒 / WS 失败）→ 复制 + Toast
    //     明示「已复制，到终端粘贴执行」（不再写对话输入框——该方案已被用户否决）；
    //   - 危险命令（danger: true）：确认弹窗后只发文本不带 \r，停在提示符由用户
    //     在终端里亲自回车（双人工确认，功能文档 §4.3）；
    //   - 降级形态（无 better-sidebar）：不渲染运行入口，只提供复制。
    // ════════════════════════════════════════════════════════════════════

    /** 从 snapshot 遍历全部终端 tab（splits + bottomSplits 所有叶子的 tabs），排除 agent: 前缀。 */
    function terminalTabsOf(snapshot) {
      if (snapshot === null || typeof snapshot !== 'object') return []
      var state = snapshot.state
      if (state === null || typeof state !== 'object') return []
      var tabs = []
      collectLeafTabs(state.splits, tabs)
      collectLeafTabs(state.bottomSplits, tabs)
      return tabs.filter(function (t) {
        return t !== null && typeof t === 'object' && t.type === 'terminal' && !String(t.id).startsWith('agent:')
      })
    }

    function collectLeafTabs(node, out) {
      if (node === null || node === undefined) return
      if (Array.isArray(node)) {
        for (var i = 0; i < node.length; i++) collectLeafTabs(node[i], out)
        return
      }
      if (typeof node !== 'object') return
      if (Array.isArray(node.tabs)) {
        for (var j = 0; j < node.tabs.length; j++) out.push(node.tabs[j])
        return
      }
      if (node.children !== null && node.children !== undefined && Array.isArray(node.children)) {
        for (var k = 0; k < node.children.length; k++) collectLeafTabs(node.children[k], out)
        return
      }
      if (node.left !== null && node.left !== undefined) collectLeafTabs(node.left, out)
      if (node.right !== null && node.right !== undefined) collectLeafTabs(node.right, out)
    }

    /** 底部树任意既有 tab（排除 agent:）：用于把运行终端强制落到底部栏（调整记录 #28）。
     *  better-sidebar 公开 API 不支持指定面板落点（openTab 落在 activePane），
     *  做法 = 先 activateTab 底部树任一 tab（activateTab 会把 activePane 切到该 pane），
     *  再 openTab 即落在底部树。 */
    function firstBottomTab(snapshot) {
      if (snapshot === null || typeof snapshot !== 'object') return null
      var state = snapshot.state
      if (state === null || typeof state !== 'object') return null
      var tabs = []
      collectLeafTabs(state.bottomSplits, tabs)
      for (var i = 0; i < tabs.length; i++) {
        var t = tabs[i]
        if (t === null || typeof t !== 'object') continue
        if (String(t.id).startsWith('agent:')) continue
        return t
      }
      return null
    }

    /** 新开终端识别：after 中 id 不在 before 里的终端 tab（openTab 刚 mint 的那个）。 */
    function pickNewTerminalTab(before, after) {
      if (!Array.isArray(after)) return null
      var seen = {}
      if (Array.isArray(before)) {
        for (var i = 0; i < before.length; i++) {
          if (before[i] !== null && typeof before[i] === 'object') seen[before[i].id] = true
        }
      }
      for (var j = 0; j < after.length; j++) {
        var t = after[j]
        if (t === null || typeof t !== 'object') continue
        if (t.type !== 'terminal' || String(t.id).startsWith('agent:')) continue
        if (!seen[t.id]) return t
      }
      return null
    }

    /** 终端直写 WS URL（相对路径，浏览器同源解析；接入规范 §3.1）。 */
    function terminalWsUrl(sessionId, tabId, cwd) {
      var u = '/sidebar/ws/terminal?sessionId=' + encodeURIComponent(sessionId) + '&tab=' + encodeURIComponent(tabId)
      if (typeof cwd === 'string' && cwd !== '') u += '&cwd=' + encodeURIComponent(cwd)
      return u
    }

    /** 发送文本：危险命令不带 \r（停在提示符，双人工确认）；普通命令带 \r 直接执行。 */
    function terminalSendText(cmd) {
      var text = String(cmd.cmd)
      if (cmd.danger !== true) text += '\r'
      return text
    }

    /**
     * 创建终端直写运行器（主形态专用）。
     * @param bs      better-sidebar 服务实例（getSnapshot/openTab/activateTab/closeTab）
     * @param scopeFn () => ({ sessionId, cwd }) 当前 Tab scope
     * @param toast   (msg, kind) 提示
     * @param copyText (text, onDone) 复制（降级链末端）
     * @param onSuccess (cmd) 可选：运行成功回调（「上次使用」视图记录等）
     */
    function createTerminalRunner(bs, scopeFn, toast, copyTextFn, onSuccess) {
      // 总超时须覆盖「open → 等 shell 就绪 → 发送」全程（实机教训：PowerShell 冷启动
      // 可达 7s+，若总超时小于就绪等待，会先触发 fallback 而误杀本应成功的运行）
      var WS_TIMEOUT_MS = 30000
      // shell 就绪等待上限（等提示符 `>`；超时仍尽力发送）
      var READY_TIMEOUT_MS = 25000

      function fallback(cmd) {
        copyTextFn(String(cmd.cmd), function (ok) {
          toast(ok ? '已复制，到终端粘贴执行' : '复制失败', ok ? null : 'error')
        })
      }

      function success(cmd) {
        // 运行成功 → onSuccess（「上次使用」记录；失败不记录，避免把降级当使用）
        if (typeof onSuccess === 'function') {
          try { onSuccess(cmd) } catch (error) { /* 忽略 */ }
        }
        toast(cmd.danger === true ? '已写入终端，请在终端内确认后回车' : '已发送到终端')
      }

      /**
       * 运行一条命令：
       * 1. （调整记录 #28）底部面板打开且有既有 tab 时，先激活底部树任一 tab，把
       *    activePane 切到底部树——保证新终端**无论 cmd-pad 停靠在哪都落在底部栏**；
       * 2. openTab 新开专用终端 → 从新 snapshot 差集识别新终端 tab id；
       * 3. WS 附加 → 发送（危险不带 \r）→ 保持连接不 drop（实机教训，防 grace 杀 pty）；
       * 4. 任一步失败 → 复制 + Toast。
       */
      function run(cmd) {
        var scope = (typeof scopeFn === 'function') ? scopeFn() : {}
        var sessionId = (scope !== null && typeof scope === 'object' && typeof scope.sessionId === 'string') ? scope.sessionId : ''
        var cwd = (scope !== null && typeof scope === 'object' && typeof scope.cwd === 'string') ? scope.cwd : ''
        if (sessionId === '') { fallback(cmd); return }

        // 1. 新开专用终端（用户决策：不复用活跃终端，避免干扰用户侧视图）
        var before = []
        var after = []
        try {
          var snapBefore = bs.getSnapshot()
          // 用户决策（调整记录 #28）：运行终端一律落在底部栏。底部面板打开
          // （bottomOpen=true）且底部树有既有 tab 时，先激活它切 activePane 到底部树；
          // 底部面板关闭 / 无底部 tab 时降级为当前行为（落在 activePane，尽力而为）。
          var st = (snapBefore !== null && typeof snapBefore === 'object') ? snapBefore.state : null
          if (st !== null && typeof st === 'object' && st.bottomOpen === true) {
            var bt = firstBottomTab(snapBefore)
            if (bt !== null) {
              try { bs.activateTab(bt.id, { sessionId: sessionId }) } catch (error) { /* 忽略 */ }
              snapBefore = bs.getSnapshot()
            }
          }
          before = terminalTabsOf(snapBefore)
          var scopeArg = { sessionId: sessionId }
          if (cwd !== '') scopeArg.cwd = cwd
          bs.openTab({ type: 'terminal' }, scopeArg)
          after = terminalTabsOf(bs.getSnapshot())
        } catch (error) { /* 服务异常 → 降级 */ }
        var target = pickNewTerminalTab(before, after)
        if (target === null) {
          // 终端配额满 / 设置页禁用 / createTab 被拒 → openTab 静默无效
          fallback(cmd)
          return
        }
        // 激活新终端（确保用户可见；能力缺失时忽略）
        try { if (typeof bs.activateTab === 'function') bs.activateTab(target.id, { sessionId: sessionId }) } catch (error) { /* 忽略 */ }

        // WS 失败时回滚刚创建的 UI tab（pty 配额满等场景：openTab 可能成功创建 tab
        // 但附加被宿主拒绝，若不回滚每次失败都会泄漏一个终端 tab）
        function rollbackTab() {
          try { if (typeof bs.closeTab === 'function') bs.closeTab(target.id, { sessionId: sessionId }) } catch (error) { /* 忽略 */ }
        }

        // 2. 短命 WS 附加（接入规范 §3.3）
        var WS = (typeof window !== 'undefined' && window.WebSocket) ? window.WebSocket
          : (typeof WebSocket !== 'undefined' ? WebSocket : undefined)
        var ws
        try {
          if (!WS) throw new Error('WebSocket unavailable')
          ws = new WS(terminalWsUrl(sessionId, target.id, cwd))
        } catch (error) { rollbackTab(); fallback(cmd); return }
        var settled = false
        var timer = setTimeout(function () {
          if (!settled) {
            settled = true
            try { if (ws.readyState === 0 || ws.readyState === 1) ws.close() } catch (error) { /* 忽略 */ }
            rollbackTab()
            fallback(cmd)
          }
        }, WS_TIMEOUT_MS)
        ws.addEventListener('open', function () {
          if (settled) return
          // 等 shell 就绪再发送：PowerShell 冷启动慢（profile 加载可达数秒），
          // 未就绪时写入会被吞（实机教训，test/t07-ws-probe.mjs）。
          // 就绪信号 = 输出流出现提示符特征 `>`（一旦 shell 就绪该信号只增不减）；
          // READY_TIMEOUT_MS 超时兜底（无提示符也尽力发送）。
          var received = ''
          var sent = false
          var readyTimer = setTimeout(function () {
            if (!sent) doSend()
          }, READY_TIMEOUT_MS)
          function doSend() {
            if (sent || settled) return
            sent = true
            clearTimeout(readyTimer)
            try {
              ws.send(terminalSendText(cmd))
            } catch (error) {
              settled = true
              clearTimeout(timer)
              try { ws.close() } catch (e) { /* 忽略 */ }
              rollbackTab()
              fallback(cmd)
              return
            }
            settled = true
            clearTimeout(timer)
            // ⚠️ 发送后**保持连接**，不做 bare drop（实机教训，2026-08-23）：
            // 新开专用终端没有 UI 视图长连（tab 未激活时 TerminalView 不连接），
            // bare drop 会在 reconnect grace（默认 30s）到期后杀掉 pty——
            // 长命令 / 交互命令会中途中断（t07-ws-probe 实证：UI 终端被 probe
            // 附加 drop 后 pty 重建，只剩 banner）。
            // 保持连接让 pty 永活，命令完整执行；连接随宿主生命周期自然结束
            // （用户关闭终端 tab → 宿主 close 帧杀 pty → 本连接 close 事件触发）。
            success(cmd)
          }
          ws.addEventListener('message', function (ev) {
            if (sent || settled) return
            received += (typeof ev.data === 'string') ? ev.data : ''
            if (received.indexOf('>') !== -1) doSend()
          })
        })
        ws.addEventListener('error', function () {
          if (!settled) {
            settled = true
            clearTimeout(timer)
            rollbackTab()
            fallback(cmd)
          }
        })
        ws.addEventListener('close', function () {
          if (!settled) {
            settled = true
            clearTimeout(timer)
            rollbackTab()
            fallback(cmd)
          }
        })
      }

      return { run: run, terminalTabsOf: terminalTabsOf, pickNewTerminalTab: pickNewTerminalTab, terminalWsUrl: terminalWsUrl, terminalSendText: terminalSendText, firstBottomTab: firstBottomTab }
    }

    // ════════════════════════════════════════════════════════════════════
    // better-sidebar 角落按钮簇避让 / 占用式推挤 / 拖拽分栏（T01/T02 保留）
    // ════════════════════════════════════════════════════════════════════

    /**
     * better-sidebar 角落按钮簇避让（接入规范 §5.5 / 视觉规范 §4.2）。
     * 背景与双锚点策略见 TASK.md 调整记录 #6：v0.13.x 无 [data-dsh-toggle-cluster]
     * 锚点，需在 [data-dsh-better-sidebar] 宿主内几何探测；每次抽屉打开时重算。
     */
    function findClusterRect() {
      if (typeof document === 'undefined' || typeof window === 'undefined') return null
      var direct = document.querySelector('[data-dsh-toggle-cluster]')
      if (direct !== null && typeof direct.getBoundingClientRect === 'function') {
        var r0 = direct.getBoundingClientRect()
        if (r0.width > 0 && r0.right <= window.innerWidth && r0.right >= 0) return r0
      }
      var host = document.querySelector('[data-dsh-better-sidebar]')
      if (host === null || typeof host.querySelectorAll !== 'function') return null
      var buttons = host.querySelectorAll('button')
      var cluster = null
      for (var i = 0; i < buttons.length; i++) {
        var r = buttons[i].getBoundingClientRect()
        if (r.width <= 0 || r.height <= 0) continue
        if (r.top < 0 || r.top > 40) continue
        if (r.right < window.innerWidth - 120 || r.right > window.innerWidth) continue
        if (cluster === null || r.right > cluster.right) cluster = { left: r.left, right: r.right, el: buttons[i] }
      }
      if (cluster === null) return null
      var parent = cluster.el.parentElement
      if (parent !== null) {
        var pr = parent.getBoundingClientRect()
        if (pr.width > 0 && pr.right <= window.innerWidth && pr.right >= 0) return pr
      }
      return cluster
    }

    function applyClusterOffset(drawer) {
      if (typeof document === 'undefined' || typeof window === 'undefined') return
      var rect = findClusterRect()
      if (rect === null) return
      var head = drawer.querySelector('.cmd-pad-drawer-head')
      if (head !== null) {
        head.style.paddingRight = (window.innerWidth - rect.left + 8) + 'px'
      }
    }

    /** 占用式布局推挤（better-sidebar 同款 layout-push，见接入规范 §5）。 */
    function pushLayoutForDrawer(drawer, open) {
      if (typeof document === 'undefined' || typeof window === 'undefined') return
      var appRoot = document.getElementById('root')
      if (appRoot === null) return
      if (open) {
        var width = drawer.getBoundingClientRect().width
        if (!(width > 0)) return
        appRoot.style.marginRight = 'calc(var(--dsh-sidebar-width, 0px) + ' + width + 'px)'
      } else {
        appRoot.style.removeProperty('margin-right')
      }
    }

    var WIDTH_STORAGE_KEY = 'dsh-cmd-pad:drawerWidth'
    var DRAWER_MIN_WIDTH = 280

    function drawerMaxWidth() {
      if (typeof window === 'undefined') return 360
      return Math.max(DRAWER_MIN_WIDTH, Math.min(window.innerWidth * 0.92, window.innerWidth - 320))
    }

    function loadDrawerWidth() {
      try {
        if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
          var raw = window.localStorage.getItem(WIDTH_STORAGE_KEY)
          if (raw !== null) {
            var w = Number(raw)
            if (typeof w === 'number' && isFinite(w) && w >= DRAWER_MIN_WIDTH && w <= window.innerWidth) return w
          }
        }
      } catch (error) { /* 隐私模式等：忽略，走默认 */ }
      return Math.min(360, typeof window !== 'undefined' ? window.innerWidth * 0.92 : 360)
    }

    function persistDrawerWidth(width) {
      try {
        if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
          window.localStorage.setItem(WIDTH_STORAGE_KEY, String(Math.round(width)))
        }
      } catch (error) { /* 隐私模式等：忽略 */ }
    }

    function setDrawerWidth(drawer, width) {
      drawer.style.width = width + 'px'
      if (drawer.getAttribute('data-open') === 'true') pushLayoutForDrawer(drawer, true)
    }

    function attachResize(drawer) {
      if (typeof document === 'undefined' || typeof window === 'undefined') return
      var handle = document.createElement('div')
      handle.className = 'cmd-pad-drawer-resize'
      handle.setAttribute('aria-hidden', 'true')
      drawer.appendChild(handle)

      var dragging = null
      var onMove = null
      var onUp = null

      function begin(event) {
        if (typeof event.preventDefault === 'function') event.preventDefault()
        dragging = {
          startX: event.clientX,
          startWidth: drawer.getBoundingClientRect().width,
        }
        drawer.setAttribute('data-dragging', '')
        var appRoot = document.getElementById('root')
        if (appRoot !== null) appRoot.style.transition = 'none'
        onMove = function onMove(e) { move(e.clientX) }
        onUp = function onUp() { end() }
        document.addEventListener('pointermove', onMove)
        document.addEventListener('pointerup', onUp)
      }

      function move(clientX) {
        if (dragging === null) return
        var next = dragging.startWidth + (dragging.startX - clientX)
        if (next < DRAWER_MIN_WIDTH) next = DRAWER_MIN_WIDTH
        var max = drawerMaxWidth()
        if (next > max) next = max
        setDrawerWidth(drawer, next)
      }

      function end() {
        document.removeEventListener('pointermove', onMove)
        document.removeEventListener('pointerup', onUp)
        onMove = null
        onUp = null
        drawer.removeAttribute('data-dragging')
        var appRoot = document.getElementById('root')
        if (appRoot !== null) appRoot.style.removeProperty('transition')
        if (dragging !== null) persistDrawerWidth(drawer.getBoundingClientRect().width)
        dragging = null
      }

      handle.addEventListener('pointerdown', begin)
    }

    // ════════════════════════════════════════════════════════════════════
    // T06 共享内容区工厂：主形态 Tab 与降级抽屉 100% 复用同一份内容区代码
    // （状态 / 渲染 / 写操作 / 事件绑定；外壳差异由调用方承担）
    // ════════════════════════════════════════════════════════════════════

    /**
     * 创建 cmd-pad 内容区面板。opts：
     *  - shell: { body, searchInput, searchCount, groupsEl, contentEl, clearBtn } | null
     *           骨架复用（降级形态用 createDrawer 已建好的；null = 自建，供主形态挂载）
     *  - sessionId: () => string     会话 id（降级探测 / 主形态 scope.sessionId）
     *  - cwd: string | null          主形态 scope.cwd 可直接给；降级传 null 由 host 解析
     *  - addBtn: Element | null      「+ 添加」按钮（降级用抽屉 head 的；null = 自建放搜索行右侧）
     *  - toastRoot: Element          Toast 挂载容器
     *  - readSetting(key, def)       插件设置读取（主形态 prefs.pluginSettings；降级返回默认）
     *  - onDataLoaded(count)         数据加载成功后回调（主形态 badge 缓存）
     *  - isPanelActive: () => bool   面板激活判定（Esc 链 / `/` 聚焦搜索；降级抽屉 open / 主形态 visible）
     *  - onEscapeTrailing: () => void Esc 链末级（降级收起抽屉；主形态 no-op）
     * 返回 { body, open, refresh, setVisible, dispose }。
     */
    function createCmdPadPanel(ctx, opts) {
      opts = opts || {}
      var body
      var searchInput
      var searchCount
      var groupsEl
      var contentEl
      var clearBtn
      if (opts.shell !== null && opts.shell !== undefined) {
        body = opts.shell.body
        searchInput = opts.shell.searchInput
        searchCount = opts.shell.searchCount
        groupsEl = opts.shell.groupsEl
        contentEl = opts.shell.contentEl
        clearBtn = opts.shell.clearBtn || null
      } else {
        var built = createPanelBody('cmd-pad-drawer-body')
        body = built.body
        searchInput = built.searchInput
        searchCount = built.searchCount
        groupsEl = built.groupsEl
        contentEl = built.contentEl
        clearBtn = built.clearBtn
      }

      // 「+ 添加」：降级用抽屉 head 传入的元素；主形态自建并放搜索行右端
      var addBtn = opts.addBtn
      if (addBtn === null || addBtn === undefined) {
        addBtn = document.createElement('button')
        addBtn.type = 'button'
        addBtn.className = 'cmd-pad-add'
        addBtn.textContent = '+ 添加'
        addBtn.title = '添加命令'
        addBtn.setAttribute('aria-label', '添加命令')
        body.querySelector('.cmd-pad-search').appendChild(addBtn)
      }

      // ── T03/T04 状态 ──
      var data = null               // { library, state, cwd, mtime }
      var activeView = 'all'        // all | recent | current-project | ungrouped | group:<name>
      var searchQuery = ''          // 非空 = 搜索态
      var moreExpanded = false
      var recentScope = 'all'       // 「上次使用」视图范围（调整记录 #28）：all | project（state 持久化）
      var toast = createToast(opts.toastRoot || body)
      var overlay = null            // 弹窗遮罩（表单/确认）
      var undoState = null          // { snapshot, timer } 删除撤销（5s）
      var pendingInitialView = false // 打开/激活时待定的初始视图（上次使用分组）
      var panelVisible = true       // T06 visible 性能门（主形态：宿主 visible；降级恒 true）
      var renderDirty = false       // 不可见期间挂起的重渲染

      // ── T07 运行通道（仅主形态）：better-sidebar + scope 访问器 → 终端直写运行器 ──
      var runner = null             // { run(cmd) }；null = 无运行入口（降级形态，只复制）
      if (opts.betterSidebar !== null && opts.betterSidebar !== undefined && typeof opts.scope === 'function') {
        // onSuccess：运行成功 → 记录「上次使用」视图（调整记录 #28）
        runner = createTerminalRunner(opts.betterSidebar, opts.scope, toast, copyText, recordUsage)
      }
      var runEnabled = runner !== null
      runEnabledFlag = runEnabled

      function findCommand(cmdId) {
        if (data === null || !Array.isArray(data.library.commands)) return null
        for (var i = 0; i < data.library.commands.length; i++) {
          if (data.library.commands[i].id === cmdId) return data.library.commands[i]
        }
        return null
      }

      function currentModel() {
        return buildGroupModel(data.library, data.state, data.cwd)
      }

      function renderContentState(state) {
        clearEl(contentEl)
        if (state === 'loading') {
          contentEl.appendChild(emptyEl('加载中…'))
        } else if (state === 'error') {
          contentEl.appendChild(emptyEl('加载失败，请检查 dsh web 服务'))
          var row = el('div', 'cmd-pad-retry-row')
          var retry = el('button', 'cmd-pad-btn', '重试')
          retry.type = 'button'
          retry.setAttribute('data-retry', '')
          row.appendChild(retry)
          contentEl.appendChild(row)
        }
      }

      function renderContentView() {
        clearEl(contentEl)
        var commands = data.library.commands
        if (searchQuery !== '') {
          // 搜索态：平铺命中命令，命中数显示在搜索栏
          var hits = []
          for (var i = 0; i < commands.length; i++) {
            if (searchMatches(commands[i], searchQuery).hit) hits.push(commands[i])
          }
          if (hits.length === 0) {
            contentEl.appendChild(emptyEl('没有匹配的命令'))
          } else {
            for (var j = 0; j < hits.length; j++) contentEl.appendChild(cardEl(hits[j], searchQuery))
          }
          return
        }
        if (activeView === 'all') {
          var model = currentModel()
          var sections = allSections(model)
          var any = false
          for (var s = 0; s < sections.length; s++) {
            var sec = sections[s]
            var secCmds = commands.filter(function (c) { return (c.groups || []).indexOf(sec.name) !== -1 })
            if (secCmds.length === 0) continue
            any = true
            contentEl.appendChild(sectionEl(sec.display, secCmds.length, secCmds, null))
          }
          if (model.hasUngrouped) {
            var un = commands.filter(function (c) { return !c.groups || c.groups.length === 0 })
            if (un.length > 0) {
              any = true
              contentEl.appendChild(sectionEl('未分组', un.length, un, null))
            }
          }
          if (!any) contentEl.appendChild(emptyEl('等待添加'))
          return
        }
        if (activeView === 'recent') {
          renderRecentView(commands)
          return
        }
        var cmds = commandsForView(commands, activeView, data.cwd)
        if (cmds.length === 0) {
          if (activeView === 'current-project') contentEl.appendChild(emptyEl('当前项目还没有命令'))
          else if (activeView === 'ungrouped') contentEl.appendChild(emptyEl('没有未分组的命令'))
          else contentEl.appendChild(emptyEl('该分组还没有命令'))
          return
        }
        for (var k = 0; k < cmds.length; k++) contentEl.appendChild(cardEl(cmds[k], null))
      }

      /**
       * 「上次使用」视图（调整记录 #28）：范围切换（项目/全部）+ ⓘ 帮助（悬停提示），
       * 命令 = 最近使用记录解析（保留 100 条、显示 20 条，已删除命令跳过）。
       */
      function renderRecentView(commands) {
        var recs = Array.isArray(data.state.recentCommands) ? data.state.recentCommands : []
        var cmds = recentCommandsView(commands, recs, recentScope, data.cwd, RECENT_SHOW)
        // 视图工具栏：范围切换（项目 | 全部）+ ⓘ 帮助（悬停提示该切换的作用，简短语言）
        var toolbar = el('div', 'cmd-pad-recent-toolbar')
        var seg = el('div', 'cmd-pad-scope-toggle')
        seg.setAttribute('role', 'group')
        seg.setAttribute('aria-label', '最近使用命令范围')
        var optProj = el('button', 'cmd-pad-scope-opt' + (recentScope === 'project' ? ' cmd-pad-scope-opt-active' : ''), '项目')
        optProj.type = 'button'
        optProj.title = '仅当前项目'
        optProj.setAttribute('aria-pressed', recentScope === 'project' ? 'true' : 'false')
        optProj.addEventListener('click', function () { setRecentScope('project') })
        seg.appendChild(optProj)
        var optAll = el('button', 'cmd-pad-scope-opt' + (recentScope === 'all' ? ' cmd-pad-scope-opt-active' : ''), '全部')
        optAll.type = 'button'
        optAll.title = '所有项目'
        optAll.setAttribute('aria-pressed', recentScope === 'all' ? 'true' : 'false')
        optAll.addEventListener('click', function () { setRecentScope('all') })
        seg.appendChild(optAll)
        toolbar.appendChild(seg)
        var help = el('button', 'cmd-pad-help')
        help.type = 'button'
        help.title = '切换范围：项目＝仅当前项目，全部＝所有项目'
        help.setAttribute('aria-label', '切换作用说明')
        help.innerHTML = HELP_SVG
        toolbar.appendChild(help)
        contentEl.appendChild(toolbar)
        if (cmds.length === 0) {
          if (recs.length === 0) contentEl.appendChild(emptyEl('还没有使用记录'))
          else contentEl.appendChild(emptyEl('当前项目还没有使用记录'))
          return
        }
        for (var i = 0; i < cmds.length; i++) contentEl.appendChild(cardEl(cmds[i], null))
      }

      /** 「上次使用」范围切换：本地即时 + state 持久化 + 重渲染。 */
      function setRecentScope(scope) {
        if (scope !== 'project' && scope !== 'all') return
        recentScope = scope
        data.state.recentScope = scope
        persistState({ recentScope: scope })
        renderAll()
      }

      function renderGroups() {
        clearEl(groupsEl)
        if (data === null) return
        var model = currentModel()
        // 用户定稿（调整记录 #17）：不显示「上次使用」slot 标签，打开抽屉直接定位该视图
        groupsEl.appendChild(groupRow(null, '全部', null, 'all', activeView === 'all'))
        if (model.cwd) {
          var cwdDisplay = model.displayNames[model.cwd] || pathBase(model.cwd)
          groupsEl.appendChild(groupRow('项目：', cwdDisplay, null, 'current-project', activeView === 'current-project'))
        }
        // 用户定稿（调整记录 #28）：「上次使用」动态视图（替换原「常用」分组概念）
        groupsEl.appendChild(groupRow(null, '上次使用', null, 'recent', activeView === 'recent'))
        if (model.hasUngrouped) {
          groupsEl.appendChild(groupRow(null, '未分组', null, 'ungrouped', activeView === 'ungrouped'))
        }
        for (var i = 0; i < model.pinnedCustom.length; i++) {
          var pc = model.pinnedCustom[i]
          groupsEl.appendChild(groupRow(null, pc, model.countByGroup[pc], 'group:' + pc, activeView === 'group:' + pc))
        }
        if (model.moreCount > 0) {
          groupsEl.appendChild(moreToggle(model.moreCount, moreExpanded))
          if (moreExpanded) groupsEl.appendChild(moreBody(model, activeView))
        }
      }

      /** T06 visible 性能门：不可见时挂起重渲染，恢复可见时补渲染。 */
      function renderAll() {
        if (!panelVisible) {
          renderDirty = true
          return
        }
        if (data === null) return
        var model = currentModel()
        if (!isValidView(activeView, model)) {
          activeView = model.lastUsed !== null ? model.lastUsed.id : 'all'
        }
        renderGroups()
        renderContentView()
        updateSearchCount()
      }

      function updateSearchCount() {
        if (searchQuery === '') {
          searchCount.textContent = ''
          return
        }
        if (data === null) return
        var n = 0
        var commands = data.library.commands
        for (var i = 0; i < commands.length; i++) {
          if (searchMatches(commands[i], searchQuery).hit) n++
        }
        searchCount.textContent = '命中 ' + n + ' 条'
      }

      function refreshData() {
        loadState('loading')
        renderContentState('loading')
        clearEl(groupsEl)
        var p
        try {
          p = loadLibrary(ctx)
        } catch (error) {
          p = Promise.reject(error)
        }
        p.then(function (payload) {
          data = {
            library: (payload !== null && typeof payload === 'object' && payload.library) ? payload.library : { commands: [] },
            state: (payload !== null && typeof payload === 'object' && payload.state) ? payload.state : {},
            cwd: (payload !== null && typeof payload === 'object' && typeof payload.cwd === 'string' && payload.cwd !== '') ? payload.cwd : (opts.cwd || null),
            mtime: payload !== null ? payload.mtime : null,
          }
          // 「上次使用」范围（state 持久化，缺省全部）
          recentScope = data.state.recentScope === 'project' ? 'project' : 'all'
          loadState('ready')
          var model = currentModel()
          if (pendingInitialView) {
            // 打开/激活：初始视图 = 上次使用的分组（§3.4 语义），失效回退「全部」
            pendingInitialView = false
            activeView = (model.lastUsed !== null && isValidView(model.lastUsed.id, model)) ? model.lastUsed.id : 'all'
          } else if (!isValidView(activeView, model)) {
            activeView = model.lastUsed !== null ? model.lastUsed.id : 'all'
          }
          renderAll()
          if (typeof opts.onDataLoaded === 'function') {
            var count = (data.library && Array.isArray(data.library.commands)) ? data.library.commands.length : 0
            opts.onDataLoaded(count)
          }
        }).catch(function () {
          loadState('error')
          renderContentState('error')
        })
      }

      function loadState(s) { /* 预留：如需加载态门控可扩展 */ }

      function selectView(viewId) {
        searchQuery = ''
        searchInput.value = ''
        activeView = viewId
        renderAll()
      }

      function toggleMore() {
        moreExpanded = !moreExpanded
        renderGroups()
      }

      function clearSearch() {
        searchQuery = ''
        searchInput.value = ''
        renderAll()
      }

      function focusSearch() {
        try {
          if (typeof searchInput.focus === 'function') searchInput.focus()
        } catch (error) { /* 忽略 */ }
      }

      /**
       * 复制语境下的 lastUsed 视图（功能文档 §3.4）：
       * 「全部」/「未分组」/「上次使用」视图 → 命令第一个所属分组（这些视图不作为 lastUsed 存储）。
       */
      function viewIdForLastUsed(cmd) {
        var viewId = activeView
        if (viewId === 'all' || viewId === 'ungrouped' || viewId === 'recent') {
          var firstGroup = (cmd.groups !== null && Array.isArray(cmd.groups) && cmd.groups.length > 0) ? cmd.groups[0] : null
          if (firstGroup !== null) viewId = 'group:' + firstGroup
        }
        return viewId
      }

      /** 刷新「上次使用」（§3.4 + 调整记录 #28）：lastUsedViewId + 最近使用命令记录。 */
      function applyLastUsed(cmd) {
        var viewId = viewIdForLastUsed(cmd)
        data.state.lastUsedViewId = viewId
        if (data.state.viewLastUsedAt === null || typeof data.state.viewLastUsedAt !== 'object') data.state.viewLastUsedAt = {}
        data.state.viewLastUsedAt[viewId] = Date.now()
        // 「上次使用」视图：复制即记录（去重置顶，保留 100 条）
        data.state.recentCommands = pushRecent(data.state.recentCommands, cmd.id)
        persistState({
          lastUsedViewId: viewId,
          viewLastUsedAt: data.state.viewLastUsedAt,
          recentCommands: data.state.recentCommands,
        })
        renderAll()
      }

      /** 运行成功也记录「上次使用」（runner onSuccess 回调；失败路径不记录）。 */
      function recordUsage(cmd) {
        if (data === null) return
        if (cmd === null || typeof cmd !== 'object' || typeof cmd.id !== 'string') return
        data.state.recentCommands = pushRecent(data.state.recentCommands, cmd.id)
        persistState({ recentCommands: data.state.recentCommands })
        renderAll()
      }

      function onCopyCommand(cmdId, anchorEl) {
        if (cmdId === null) return
        var cmd = findCommand(cmdId)
        if (cmd === null || typeof cmd.cmd !== 'string') return
        copyText(cmd.cmd, function (ok) {
          if (!ok) {
            toast('复制失败', 'error', null, null, anchorEl)
            return
          }
          toast('已复制', null, null, null, anchorEl)
          // 刷新「上次使用」slot（功能文档 §3.4）
          applyLastUsed(cmd)
        })
      }

      /**
       * T07 运行入口（仅主形态）：危险命令先确认弹窗（双人工确认），普通命令直接运行。
       * 运行语义 = 新开专用终端 + 终端直写（用户决策，TASK.md 调整记录 #21 后确认）。
       */
      function onRunCommand(cmdId, anchorEl) {
        if (runner === null) return
        var cmd = findCommand(cmdId)
        if (cmd === null || typeof cmd.cmd !== 'string') return
        if (cmd.danger === true) {
          showModal(buildRunConfirmModal(cmd, function onCancel() {
            hideModal()
          }, function onConfirm() {
            hideModal()
            runner.run(cmd)
          }))
          return
        }
        runner.run(cmd)
      }

      // ── T04：写操作（添加/编辑/删除/重命名/常驻 + 撤销）──

      function persistLibrary(library, onDone) {
        var p
        try {
          p = window.fetch('/cmd-pad/api/library', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ library: library }),
          }).then(function (res) {
            if (!res.ok) throw new Error('library put failed: ' + res.status)
            return res.json()
          })
        } catch (error) {
          p = Promise.reject(error)
        }
        p.then(function () { onDone(true) }, function () { onDone(false) })
      }

      function persistState(patch) {
        try {
          window.fetch('/cmd-pad/api/state', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(patch),
          }).catch(function () {})
        } catch (error) { /* 静默 */ }
      }

      function showModal(node) {
        if (overlay === null) {
          overlay = el('div', 'cmd-pad-overlay')
          document.body.appendChild(overlay)
        }
        clearEl(overlay)
        overlay.appendChild(node)
        overlay.style.display = 'flex'
      }

      function hideModal() {
        if (overlay !== null) {
          overlay.style.display = 'none'
          clearEl(overlay)
        }
      }

      function modalOpen() {
        return overlay !== null && overlay.style.display === 'flex'
      }

      function displayNameOf(groupName) {
        var model = currentModel()
        return model.displayNames[groupName] || groupName
      }

      /** 全部分组名（含无命令的常驻分组），用于重命名冲突检测。 */
      function allGroupNames() {
        var model = currentModel()
        var names = {}
        for (var k in model.groupSet) {
          if (Object.prototype.hasOwnProperty.call(model.groupSet, k)) names[k] = true
        }
        var pinned = Array.isArray(data.state.pinnedGroups) ? data.state.pinnedGroups : []
        for (var i = 0; i < pinned.length; i++) {
          if (!names[pinned[i]]) names[pinned[i]] = true
        }
        return names
      }

      /** 表单分组选项：自定义（常驻在前，含无命令常驻）→ 项目（当前项目 → 其他项目）。 */
      function groupOptions() {
        var model = currentModel()
        var pinned = Array.isArray(data.state.pinnedGroups) ? data.state.pinnedGroups : []
        var seen = {}
        var opts = []
        var customOrder = model.pinnedCustom.concat(model.unpinnedCustom)
        for (var i = 0; i < pinned.length; i++) {
          var pg = pinned[i]
          if (!isProjectGroup(pg) && customOrder.indexOf(pg) === -1) customOrder.push(pg)
        }
        for (var j = 0; j < customOrder.length; j++) {
          var cg = customOrder[j]
          if (seen[cg]) continue
          seen[cg] = true
          opts.push({ name: cg, display: cg, pinned: pinned.indexOf(cg) !== -1 })
        }
        var projs = []
        if (model.cwd) projs.push(model.cwd)
        for (var k = 0; k < model.otherProjects.length; k++) projs.push(model.otherProjects[k])
        for (var m = 0; m < projs.length; m++) {
          var pp = projs[m]
          if (seen[pp]) continue
          seen[pp] = true
          opts.push({ name: pp, display: model.displayNames[pp] || pathBase(pp), pinned: false })
        }
        return opts
      }

      function openAddForm() {
        var model = currentModel()
        var checkedSet = {}
        var defs = defaultCheckedGroups(activeView, model, data.state, data.cwd)
        for (var i = 0; i < defs.length; i++) checkedSet[defs[i]] = true
        showModal(buildFormModal({
          mode: 'add',
          groupOptions: groupOptions(),
          checkedSet: checkedSet,
          toast: toast,
          onCancel: hideModal,
          onSubmit: function (payload) { submitCommand(payload, null) },
        }))
      }

      function openEditForm(cmdId) {
        var cmd = findCommand(cmdId)
        if (cmd === null) return
        var checkedSet = {}
        var groups = cmd.groups || []
        for (var i = 0; i < groups.length; i++) checkedSet[groups[i]] = true
        showModal(buildFormModal({
          mode: 'edit',
          cmd: cmd,
          groupOptions: groupOptions(),
          checkedSet: checkedSet,
          toast: toast,
          onCancel: hideModal,
          onSubmit: function (payload) { submitCommand(payload, cmdId) },
        }))
      }

      function submitCommand(payload, editId) {
        var commands = data.library.commands
        var next
        if (editId !== null) {
          next = commands.map(function (c) { return c.id === editId ? Object.assign({}, c, payload) : c })
        } else {
          next = commands.concat([Object.assign({ id: generateCommandId(payload.title) }, payload)])
        }
        persistLibrary(Object.assign({}, data.library, { commands: next }), function (ok) {
          if (!ok) {
            toast('保存失败', 'error')
            return
          }
          data.library = Object.assign({}, data.library, { commands: next })
          hideModal()
          renderAll()
          toast(editId !== null ? '已保存' : '已添加')
        })
      }

      /** 删除/重命名等结构变更：保存快照 → PUT → 渲染 + 5s 可撤销。 */
      function mutateLibrary(transform, message) {
        var snapshot = JSON.parse(JSON.stringify(data.library))
        var next = transform(snapshot)
        persistLibrary(next, function (ok) {
          if (!ok) {
            toast('保存失败', 'error')
            return
          }
          data.library = next
          armUndo(snapshot, message)
          renderAll()
        })
      }

      /** 5 秒内可撤销（Toast 带「撤销」操作）。 */
      function armUndo(snapshot, message) {
        if (undoState !== null && undoState.timer !== null) clearTimeout(undoState.timer)
        var timer = setTimeout(function () {
          if (undoState !== null && undoState.timer === timer) undoState = null
        }, 5000)
        undoState = { snapshot: snapshot, timer: timer }
        toast(message + '（5 秒内可撤销）', null, '撤销', function () {
          if (undoState === null) return
          clearTimeout(undoState.timer)
          var snap = undoState.snapshot
          undoState = null
          persistLibrary(snap, function (ok) {
            if (!ok) {
              toast('撤销失败', 'error')
              return
            }
            data.library = snap
            renderAll()
            toast('已撤销')
          })
        })
      }

      /** 命令删除（设计文档 §3.5 语境语义：解关联 vs 彻底删除 + 确认）。 */
      function requestDeleteCommand(cmdId) {
        var cmd = findCommand(cmdId)
        if (cmd === null) return
        var plan = deletionPlan(cmd, activeView)
        if (plan.mode === 'unlink') {
          // 仅解除当前分组关联（静默）
          mutateLibrary(function (lib) {
            return Object.assign({}, lib, { commands: lib.commands.map(function (c) {
              if (c.id !== cmdId) return c
              return Object.assign({}, c, { groups: c.groups.filter(function (g) { return g !== plan.group }) })
            }) })
          }, '已从「' + displayNameOf(plan.group) + '」解关联')
          return
        }
        showModal(buildConfirmModal({
          title: '删除命令',
          message: '确定彻底删除「' + cmd.title + '」？\n删除后 5 秒内可撤销。',
          danger: false,
          okLabel: '删除',
          onCancel: hideModal,
          onConfirm: function () {
            hideModal()
            mutateLibrary(function (lib) {
              return Object.assign({}, lib, { commands: lib.commands.filter(function (c) { return c.id !== cmdId }) })
            }, '已删除')
          },
        }))
      }

      /** 分组删除（右键）：确认弹窗列出影响（N 解关联 / M 彻底删除）。 */
      function requestDeleteGroup(name) {
        var plan = groupDeletionPlan(name, data.library)
        var message = '删除分组「' + name + '」：\n' +
          plan.affected.length + ' 条命令解除关联，其中 ' + plan.deletedOnly.length + ' 条仅此分组的将彻底删除。\n删除后 5 秒内可撤销。'
        showModal(buildConfirmModal({
          title: '删除分组',
          message: message,
          danger: plan.deletedOnly.length > 0,
          okLabel: '删除',
          onCancel: hideModal,
          onConfirm: function () {
            hideModal()
            mutateLibrary(function (lib) {
              return Object.assign({}, lib, { commands: lib.commands.map(function (c) {
                var groups = c.groups || []
                if (groups.indexOf(name) === -1) return c
                var rest = groups.filter(function (g) { return g !== name })
                return rest.length === 0 ? null : Object.assign({}, c, { groups: rest })
              }).filter(Boolean) })
            }, '分组已删除')
          },
        }))
      }

      /** 分组重命名（仅自定义分组）：级联更新 + 冲突拒绝（弹窗保留可改）。 */
      function requestRenameGroup(name) {
        if (isProjectGroup(name)) return
        showModal(buildRenameModal(name, hideModal, function (newName) {
          var result = renameGroup(data.library, name, newName, allGroupNames())
          if (!result.ok) {
            toast(result.reason, 'error')
            return
          }
          hideModal()
          mutateLibrary(function () { return result.library }, '分组已重命名')
          var pinned = Array.isArray(data.state.pinnedGroups) ? data.state.pinnedGroups : []
          if (pinned.indexOf(name) !== -1) {
            var nextPinned = pinned.map(function (g) { return g === name ? newName : g })
            data.state.pinnedGroups = nextPinned
            persistState({ pinnedGroups: nextPinned })
          }
        }))
      }

      /** 常驻切换（右键分组项）：state.pinnedGroups 持久化 + 侧栏重排。 */
      function toggleGroupPinned(name) {
        var next = togglePinned(data.state.pinnedGroups, name)
        data.state.pinnedGroups = next
        persistState({ pinnedGroups: next })
        renderAll()
      }

      // ── 事件委托（一次绑定，随重渲染复用）──
      addBtn.addEventListener('click', function () {
        if (data === null) return
        openAddForm()
      })

      groupsEl.addEventListener('click', function (event) {
        var target = event.target || groupsEl
        var moreBtn = closestUp(target, function (n) { return n.getAttribute !== undefined && n.getAttribute('data-more-toggle') !== null })
        if (moreBtn !== null) {
          toggleMore()
          return
        }
        var row = closestUp(target, function (n) { return n.getAttribute !== undefined && n.getAttribute('data-view-id') !== null })
        if (row !== null) selectView(row.getAttribute('data-view-id'))
      })

      // 分组项右键（自定义分组：设为常驻/取消常驻、重命名、删除；项目分组无操作）
      groupsEl.addEventListener('contextmenu', function (event) {
        var target = event.target || groupsEl
        if (typeof event.preventDefault === 'function') event.preventDefault()
        var row = closestUp(target, function (n) { return n.getAttribute !== undefined && n.getAttribute('data-view-id') !== null })
        if (row === null) return
        var viewId = row.getAttribute('data-view-id')
        if (viewId.slice(0, 6) !== 'group:') return
        var name = viewId.slice(6)
        if (isProjectGroup(name)) return // §3.1 项目分组由系统管理，无右键操作
        var pinned = (Array.isArray(data.state.pinnedGroups) ? data.state.pinnedGroups : []).indexOf(name) !== -1
        openContextMenu(event.clientX || 0, event.clientY || 0, [
          { label: pinned ? '取消常驻' : '设为常驻', onClick: function () { toggleGroupPinned(name) } },
          { label: '重命名', onClick: function () { requestRenameGroup(name) } },
          { label: '删除', danger: true, onClick: function () { requestDeleteGroup(name) } },
        ])
      })

      contentEl.addEventListener('click', function (event) {
        var target = event.target || contentEl
        var retry = closestUp(target, function (n) { return n.getAttribute !== undefined && n.getAttribute('data-retry') !== null })
        if (retry !== null) {
          refreshData()
          return
        }
        // T07：运行按钮（仅主形态渲染；Toast 锚定到按钮左侧，同复制）
        var runEl = closestUp(target, function (n) { return n.getAttribute !== undefined && n.getAttribute('data-run-cmd') !== null })
        if (runEl !== null) {
          var runCard = closestUp(runEl, function (n) { return n.getAttribute !== undefined && n.getAttribute('data-cmd-id') !== null })
          onRunCommand(runCard !== null ? runCard.getAttribute('data-cmd-id') : null, runEl)
          return
        }
        var copyEl = closestUp(target, function (n) { return n.getAttribute !== undefined && n.getAttribute('data-copy-cmd') !== null })
        if (copyEl !== null) {
          var card = closestUp(copyEl, function (n) { return n.getAttribute !== undefined && n.getAttribute('data-cmd-id') !== null })
          // Toast 锚定到复制按钮/命令块左侧（用户定稿）
          onCopyCommand(card !== null ? card.getAttribute('data-cmd-id') : null, copyEl)
        }
      })

      // 卡片右键（运行[主形态] / 复制 / 编辑 / 删除；T07 恢复运行，设计文档 §4.1「运行恢复时加回首位」）
      contentEl.addEventListener('contextmenu', function (event) {
        var target = event.target || contentEl
        if (typeof event.preventDefault === 'function') event.preventDefault()
        var card = closestUp(target, function (n) { return n.getAttribute !== undefined && n.getAttribute('data-cmd-id') !== null })
        if (card === null) return
        var cmdId = card.getAttribute('data-cmd-id')
        var items = []
        if (runEnabled) items.push({ label: '运行', onClick: function () { onRunCommand(cmdId) } })
        items.push({ label: '复制', onClick: function () { onCopyCommand(cmdId) } })
        items.push({ label: '编辑', onClick: function () { openEditForm(cmdId) } })
        items.push({ label: '删除', danger: true, onClick: function () { requestDeleteCommand(cmdId) } })
        openContextMenu(event.clientX || 0, event.clientY || 0, items)
      })

      searchInput.addEventListener('input', function () {
        searchQuery = searchInput.value || ''
        renderContentView()
        updateSearchCount()
      })

      // 清空按钮
      if (clearBtn !== null) {
        clearBtn.addEventListener('click', function () {
          if (searchQuery !== '') clearSearch()
          else focusSearch()
        })
      }

      // 键盘（功能文档 §4.4）：Esc 链（弹层 → 菜单 → 清空搜索 → 形态末级）；/ 聚焦搜索
      function panelActive() {
        if (!panelVisible) return false
        return (typeof opts.isPanelActive === 'function') ? opts.isPanelActive() : true
      }
      var onKeydown = function onKeydown(event) {
        if (event.key === 'Escape') {
          if (modalOpen()) {
            hideModal()
            if (typeof event.preventDefault === 'function') event.preventDefault()
            return
          }
          if (contextMenuEl !== null) {
            closeContextMenu()
            if (typeof event.preventDefault === 'function') event.preventDefault()
            return
          }
          if (!panelActive()) return
          if (searchQuery !== '') {
            clearSearch()
            if (typeof event.preventDefault === 'function') event.preventDefault()
            return
          }
          if (typeof opts.onEscapeTrailing === 'function') opts.onEscapeTrailing()
          return
        }
        if (event.key === '/' && panelActive()) {
          var target = event.target
          var tag = target !== null && target !== undefined ? target.tagName : undefined
          if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !(target !== null && target.isContentEditable)) {
            if (typeof event.preventDefault === 'function') event.preventDefault()
            focusSearch()
          }
        }
      }
      document.addEventListener('keydown', onKeydown)

      /** 打开/激活面板：按设置决定初始视图并拉取最新命令库（§5.3 多标签页/手改 yml 保鲜）。 */
      function open() {
        var readSetting = (typeof opts.readSetting === 'function') ? opts.readSetting : function (k, d) { return d }
        pendingInitialView = readSetting('openToLastUsed', true) !== false
        refreshData()
      }

      /** 外部主动拉取最新命令库（onActivate / 重试）。 */
      function refresh() {
        refreshData()
      }

      /** T06 visible 性能门：主形态宿主传入；不可见时挂起渲染，恢复时补渲染。 */
      function setVisible(v) {
        panelVisible = !!v
        if (panelVisible && renderDirty) {
          renderDirty = false
          renderAll()
        }
      }

      return {
        body: body,
        open: open,
        refresh: refresh,
        setVisible: setVisible,
        dispose: function () {
          document.removeEventListener('keydown', onKeydown)
          if (undoState !== null && undoState.timer !== null) clearTimeout(undoState.timer)
          undoState = null
          closeContextMenu()
          hideModal()
        },
      }
    }

    // ════════════════════════════════════════════════════════════════════
    // cordis 插件主体（client 半）
    // T06：先探测 betterSidebar → 主形态 registerTab；否则降级浮动图标 + 抽屉
    // ════════════════════════════════════════════════════════════════════
    /** better-sidebar 服务探测（AGENTS.md 硬规则 1：ctx.get 可选探测，绝不硬 inject）。 */
    function probeBetterSidebar(ctx) {
      if (ctx === null || ctx === undefined) return undefined
      var bs = (typeof ctx.get === 'function') ? ctx.get('betterSidebar') : undefined
      if (bs === null || bs === undefined) bs = ctx.betterSidebar
      return bs
    }

    /** 主形态 Tab 图标（视觉规范 §3.2：16 viewBox / 1.5px stroke / currentColor / round）。
     *  命令列表造型（提示符 + 两行命令线）——与 better-sidebar 内置终端 `>_` 图标明显区分
     *  （用户反馈 2026-08-23，TASK.md 调整记录 #23）。 */
    function createCmdPadIcon(createElement, size) {
      var px = typeof size === 'number' && size > 0 ? size : 16
      return createElement('svg', {
        viewBox: '0 0 16 16',
        width: px,
        height: px,
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '1.5',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'aria-hidden': 'true',
      },
        createElement('rect', { x: '1.5', y: '1.5', width: '13', height: '13', rx: '2.5' }),
        createElement('path', { d: 'm4 5.75 1.5 1.5L4 8.75' }),
        createElement('path', { d: 'M7.75 7.25h3.75' }),
        createElement('path', { d: 'M4 12h4.5' })
      )
    }

    // 主形态模块级状态：Tab 面板注册表（onActivate 定位刷新）
    var mainTabPanels = {}

    /**
     * 主形态：注册 better-sidebar Tab（T06）。内容区 = createCmdPadPanel 100% 复用。
     * onActivate / pluginToggles 走 features 能力门（接入规范 §4）。
     * require('react') 不可用返回 false，调用方回退降级形态（TASK.md T06 依赖调整点）。
     */
    function registerMainTab(ctx, bs) {
      var React = null
      try { React = require('react') } catch (error) { return false }
      if (React === null || typeof React.createElement !== 'function' || typeof React.useEffect !== 'function' || typeof React.useRef !== 'function') return false
      var createElement = React.createElement
      var useEffect = React.useEffect
      var useRef = React.useRef

      var features = (bs !== null && typeof bs === 'object' && Array.isArray(bs.features)) ? bs.features : []
      var hasLifecycle = features.indexOf('tabLifecycle') !== -1
      var hasPluginSettings = features.indexOf('pluginSettings') !== -1

      /** React 桥接组件：ref 挂载纯 DOM 面板，scope 变化重挂，visible 性能门。 */
      function CmdPadTab(props) {
        var hostRef = useRef(null)
        var panelRef = useRef(null)
        var scope = props.scope || {}
        var sessionId = typeof scope.sessionId === 'string' ? scope.sessionId : ''
        var cwd = typeof scope.cwd === 'string' ? scope.cwd : ''
        var scopeKey = sessionId + '\u0000' + cwd
        useEffect(function () {
          var host = hostRef.current
          if (host === null) return undefined
          var panel = createCmdPadPanel(ctx, {
            sessionId: function () { return sessionId },
            cwd: cwd === '' ? null : cwd,
            addBtn: null,
            toastRoot: host,
            // T07：主形态运行通道（终端直写）——传 better-sidebar 服务 + scope 访问器
            betterSidebar: bs,
            scope: function () { return { sessionId: sessionId, cwd: cwd } },
            readSetting: hasPluginSettings ? function (key, def) {
              try {
                var snap = (props.store !== null && props.store !== undefined && typeof props.store.getSnapshot === 'function') ? props.store.getSnapshot() : undefined
                var blob = snap !== undefined && snap.prefs !== undefined && snap.prefs.pluginSettings ? snap.prefs.pluginSettings['cmd-pad:pad'] : undefined
                return (blob !== null && typeof blob === 'object' && blob[key] !== undefined) ? blob[key] : def
              } catch (error) { return def }
            } : function (key, def) { return def },
            onEscapeTrailing: function () {},
          })
          panelRef.current = panel
          mainTabPanels[scopeKey] = panel
          host.appendChild(panel.body)
          panel.open()
          return function () {
            if (mainTabPanels[scopeKey] === panel) delete mainTabPanels[scopeKey]
            panel.dispose()
            panelRef.current = null
          }
        }, [sessionId, cwd])
        useEffect(function () {
          if (panelRef.current !== null) panelRef.current.setVisible(!!props.visible)
        }, [!!props.visible])
        return createElement('div', { className: 'cmd-pad-tab-host', ref: hostRef })
      }

      var descriptor = {
        id: 'cmd-pad:pad',
        title: '命令',
        icon: function (size) { return createCmdPadIcon(createElement, size) },
        order: 45,
        single: true,
        component: CmdPadTab,
      }
      // badge 已按用户决策移除（TASK.md 调整记录 #23）：Tab 不显示命令总数角标
      if (hasLifecycle) {
        // onActivate：切回本 Tab 拉取最新命令库（多标签页/手改 yml 保鲜，§5.3）
        descriptor.onActivate = function (tab, scope) {
          var key = (scope && typeof scope.sessionId === 'string' ? scope.sessionId : '') + '\u0000' + (scope && typeof scope.cwd === 'string' ? scope.cwd : '')
          var panel = mainTabPanels[key]
          if (panel !== undefined) panel.refresh()
        }
      }
      if (hasPluginSettings) {
        // 插件设置（接入规范 §2.2 settings.pluginToggles）：持久化在 pluginSettings['cmd-pad:pad']
        descriptor.settings = {
          pluginToggles: [
            { key: 'openToLastUsed', title: '打开时定位上次使用的分组', desc: '关闭后打开/激活 Tab 显示「全部」', type: 'switch' },
          ],
        }
      }
      ctx.effect(function () {
        return bs.registerTab(descriptor)
      })
      return true
    }

    function apply(ctx) {
      ctx.effect(() => {
        ensureStyle()
        var bs = probeBetterSidebar(ctx)
        if (bs) {
          // 主形态（T06）：注册 Tab，不自建任何浮层（设计文档 §2.2 / 接入规范 §5.3）
          if (registerMainTab(ctx, bs)) {
            return function () { removeStyle() }
          }
          // require('react') 不可用 → 回退降级形态（TASK.md T06 依赖调整点）
        }

        // ── 降级形态：浮动图标 + 抽屉（T01/T03/T04）──
        var root = createRoot()
        var shell = createDrawer(closeDrawer)
        var drawer = shell.drawer
        drawer.style.width = loadDrawerWidth() + 'px'
        attachResize(drawer)

        var panel = createCmdPadPanel(ctx, {
          shell: shell,
          sessionId: function () { return getCurrentSessionId(ctx) },
          cwd: null,
          addBtn: shell.addBtn,
          toastRoot: root,
          onEscapeTrailing: closeDrawer,
          isPanelActive: function () { return drawer.getAttribute('data-open') === 'true' },
          onDataLoaded: function () {},
          readSetting: function (key, def) { return def },
        })

        function openDrawer() {
          drawer.setAttribute('data-open', 'true')
          applyClusterOffset(drawer)
          pushLayoutForDrawer(drawer, true)
          window.addEventListener('resize', onResize)
          panel.open() // 打开即定位上次使用分组 + 拉取最新命令库（§5.3 保鲜）
        }

        function closeDrawer() {
          drawer.setAttribute('data-open', 'false')
          pushLayoutForDrawer(drawer, false)
          window.removeEventListener('resize', onResize)
        }

        function onResize() {
          if (drawer.getAttribute('data-open') !== 'true') return
          var max = drawerMaxWidth()
          var current = drawer.getBoundingClientRect().width
          if (current > max) setDrawerWidth(drawer, max)
          else pushLayoutForDrawer(drawer, true)
        }

        var fab = createFab(function onToggle() {
          var open = drawer.getAttribute('data-open') === 'true'
          if (open) closeDrawer()
          else openDrawer()
        })

        root.appendChild(fab)
        root.appendChild(drawer)
        document.body.appendChild(root)
        applyClusterOffset(drawer)

        return function dispose() {
          window.removeEventListener('resize', onResize)
          panel.dispose()
          pushLayoutForDrawer(drawer, false)
          if (root.parentNode !== null) root.parentNode.removeChild(root)
          removeStyle()
        }
      }, 'dsh-cmd-pad: 主形态 Tab / 降级浮动图标 + 抽屉')
    }

    exports.apply = apply
    // 测试钩子：纯逻辑面供 node 验收 harness 直接验证（不随 files 发布影响宿主）
    exports.testable = {
      isProjectGroup: isProjectGroup,
      pathBase: pathBase,
      pathParents: pathParents,
      disambiguateProjectNames: disambiguateProjectNames,
      aggregateGroups: aggregateGroups,
      groupStats: groupStats,
      computeLastUsed: computeLastUsed,
      buildGroupModel: buildGroupModel,
      isValidView: isValidView,
      commandsForView: commandsForView,
      searchMatches: searchMatches,
      allSections: allSections,
      getCurrentSessionId: getCurrentSessionId,
      highlightText: highlightText,
      copyText: copyText,
      generateCommandId: generateCommandId,
      dangerKeywordHits: dangerKeywordHits,
      defaultCheckedGroups: defaultCheckedGroups,
      // 「上次使用」视图（调整记录 #28）
      pushRecent: pushRecent,
      recentCommandsView: recentCommandsView,
      deletionPlan: deletionPlan,
      groupDeletionPlan: groupDeletionPlan,
      renameGroup: renameGroup,
      togglePinned: togglePinned,
      probeBetterSidebar: probeBetterSidebar,
      // T07：终端直写运行通道纯逻辑
      terminalTabsOf: terminalTabsOf,
      pickNewTerminalTab: pickNewTerminalTab,
      terminalWsUrl: terminalWsUrl,
      terminalSendText: terminalSendText,
      firstBottomTab: firstBottomTab,
      createTerminalRunner: createTerminalRunner,
    }
    return module.exports
  },
})
