/**
 * dsh-cmd-pad client half（T01 最小骨架 → T03 只读浏览 + 复制）
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
      '  overflow:hidden;',
      '  -webkit-app-region:no-drag;',
      '}',
      // ── T03：内容区布局（分组侧栏 + 命令列表）──
      '.cmd-pad-layout{',
      '  flex:1;',
      '  display:flex;',
      '  min-width:0;',
      '  min-height:0;',
      '  overflow:hidden;',
      '}',
      '.cmd-pad-groups{',
      '  flex:none;',
      '  width:132px;',
      '  overflow-y:auto;',
      '  overflow-x:hidden;',
      '  border-right:1px solid var(--dsw-alias-border-l1,var(--cp-border-l1,#2e3036));',
      '  padding:6px 4px;',
      '  -webkit-app-region:no-drag;',
      '}',
      '.cmd-pad-content{',
      '  flex:1;',
      '  min-width:0;',
      '  overflow-y:auto;',
      '  padding:8px 10px;',
      '  -webkit-app-region:no-drag;',
      '}',
      // ── T03：搜索栏 ──
      '.cmd-pad-search{',
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
      // ── T03：分组侧栏 ──
      '.cmd-pad-group-row{',
      '  display:flex;',
      '  align-items:center;',
      '  gap:4px;',
      '  padding:4px 8px;',
      '  border-radius:6px;',
      '  cursor:pointer;',
      '  color:var(--dsw-alias-label-secondary,var(--cp-label-secondary,#a0a3ab));',
      '  font-size:12px;',
      '  line-height:1.4;',
      '  user-select:none;',
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
      '  flex:1;',
      '  min-width:0;',
      '  overflow:hidden;',
      '  text-overflow:ellipsis;',
      '  white-space:nowrap;',
      '  font-weight:500;',
      '}',
      '.cmd-pad-group-count{',
      '  flex:none;',
      '  font-size:10px;',
      '  color:var(--dsw-alias-label-tertiary,var(--cp-label-tertiary,#6f7278));',
      '}',
      // 「上次使用」slot：虚线提示框（视觉规范 §2 配方）
      '.cmd-pad-last-slot{',
      '  margin:0 4px 6px;',
      '  padding:4px 8px;',
      '  border:1px dashed var(--dsw-alias-border-l2,var(--cp-border-l2,#3a3d44));',
      '  border-radius:6px;',
      '  cursor:pointer;',
      '  color:var(--dsw-alias-label-tertiary,var(--cp-label-tertiary,#6f7278));',
      '  font-size:12px;',
      '  line-height:1.4;',
      '  overflow:hidden;',
      '  text-overflow:ellipsis;',
      '  white-space:nowrap;',
      '  user-select:none;',
      '  -webkit-app-region:no-drag;',
      '}',
      '.cmd-pad-last-slot:hover{',
      '  background:var(--dsw-alias-interactive-bg-hover,var(--cp-interactive-bg-hover,#2b2d33));',
      '  color:var(--dsw-alias-label-primary,var(--cp-label-primary,#e6e6e6));',
      '}',
      '.cmd-pad-more-toggle{',
      '  display:flex;',
      '  align-items:center;',
      '  gap:4px;',
      '  width:100%;',
      '  padding:4px 8px;',
      '  border:none;',
      '  background:transparent;',
      '  border-radius:6px;',
      '  cursor:pointer;',
      '  color:var(--dsw-alias-label-tertiary,var(--cp-label-tertiary,#6f7278));',
      '  font-size:12px;',
      '  line-height:1.4;',
      '  text-align:left;',
      '  user-select:none;',
      '  -webkit-app-region:no-drag;',
      '}',
      '.cmd-pad-more-toggle:hover{',
      '  background:var(--dsw-alias-interactive-bg-hover,var(--cp-interactive-bg-hover,#2b2d33));',
      '  color:var(--dsw-alias-label-primary,var(--cp-label-primary,#e6e6e6));',
      '}',
      '.cmd-pad-more-section{',
      '  font-size:11px;',
      '  color:var(--dsw-alias-label-tertiary,var(--cp-label-tertiary,#6f7278));',
      '  padding:6px 8px 2px;',
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
      var pinnedCustom = pinned.filter(function (g) { return agg.custom.indexOf(g) !== -1 })
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

    /** 视图有效性（分组消失 / 项目消失 → 视图失效）。 */
    function isValidView(viewId, model) {
      if (viewId === 'all') return true
      if (viewId === 'current-project') return !!model.cwd
      if (viewId === 'ungrouped') return model.hasUngrouped
      if (viewId.slice(0, 6) === 'group:') return !!model.groupSet[viewId.slice(6)]
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
     * 抽屉外壳（T01）：head（标题 + ✕）+ 搜索栏 + 布局（分组侧栏 / 内容区）。
     * 返回 { drawer, searchInput, groupsEl, contentEl }。
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

      var close = document.createElement('button')
      close.type = 'button'
      close.className = 'cmd-pad-drawer-close'
      close.title = '关闭（Esc）'
      close.setAttribute('aria-label', '关闭')
      close.textContent = '\u2715'
      close.addEventListener('click', onClose)

      head.appendChild(title)
      head.appendChild(close)

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

      // 布局（T03）：分组侧栏 + 内容区
      var layout = document.createElement('div')
      layout.className = 'cmd-pad-layout'

      var groupsEl = document.createElement('div')
      groupsEl.className = 'cmd-pad-groups'

      var contentEl = document.createElement('div')
      contentEl.className = 'cmd-pad-content'

      layout.appendChild(groupsEl)
      layout.appendChild(contentEl)

      var body = document.createElement('div')
      body.className = 'cmd-pad-drawer-body'
      body.appendChild(search)
      body.appendChild(layout)

      drawer.appendChild(head)
      drawer.appendChild(body)
      return { drawer: drawer, searchInput: searchInput, searchCount: searchCount, groupsEl: groupsEl, contentEl: contentEl }
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

    function lastSlot(model, activeView) {
      var lu = model.lastUsed
      if (lu === null) return null
      var row = el('div', 'cmd-pad-last-slot')
      row.setAttribute('data-view-id', lu.id)
      if (activeView === lu.id) row.setAttribute('data-active', 'true')
      row.textContent = lu.label
      return row
    }

    function moreToggle(count, expanded) {
      var btn = el('button', 'cmd-pad-more-toggle')
      btn.type = 'button'
      btn.setAttribute('data-more-toggle', '')
      btn.textContent = expanded ? '\u25be 更多' : '\u25b8 更多（' + count + '）'
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
        wrap.appendChild(el('div', 'cmd-pad-more-section', '分组'))
        for (var j = 0; j < model.unpinnedCustom.length; j++) {
          var g = model.unpinnedCustom[j]
          wrap.appendChild(groupRow(null, g, model.countByGroup[g], 'group:' + g, activeView === 'group:' + g))
        }
      }
      return wrap
    }

    // ── 命令卡片 / 分节 / 空态（T03 渲染）──

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
     * Toast（z-index 90）：单条复用，新消息替换旧的；2s 自动隐藏。
     */
    function createToast(root) {
      var toast = el('div', 'cmd-pad-toast')
      root.appendChild(toast)
      var timer = null
      return function showToast(message, kind) {
        toast.textContent = message
        if (kind === 'error') toast.setAttribute('data-kind', 'error')
        else toast.removeAttribute('data-kind')
        toast.setAttribute('data-show', 'true')
        if (timer !== null) clearTimeout(timer)
        timer = setTimeout(function () {
          toast.removeAttribute('data-show')
          timer = null
        }, 2000)
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

    /** 复制成功后刷新「上次使用」（功能文档 §3.4）：PUT /api/state，失败静默。 */
    function persistLastUsed(viewId) {
      try {
        window.fetch('/cmd-pad/api/state', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ lastUsedViewId: viewId, viewLastUsedAt: { [viewId]: Date.now() } }),
        }).catch(function () {})
      } catch (error) { /* 静默：状态刷新失败不影响复制 */ }
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
    // cordis 插件主体（client 半）
    // T03：降级形态完整内容区；T06 起先探测 betterSidebar 走 registerTab（主形态）。
    // ════════════════════════════════════════════════════════════════════
    function apply(ctx) {
      ctx.effect(() => {
        ensureStyle()

        var root = createRoot()
        var shell = createDrawer(closeDrawer)
        var drawer = shell.drawer
        var searchInput = shell.searchInput
        var searchCount = shell.searchCount
        var groupsEl = shell.groupsEl
        var contentEl = shell.contentEl
        drawer.style.width = loadDrawerWidth() + 'px'
        attachResize(drawer)

        // ── T03 状态 ──
        var data = null               // { library, state, cwd, mtime }
        var activeView = 'all'        // all | current-project | ungrouped | group:<name>
        var searchQuery = ''          // 非空 = 搜索态
        var moreExpanded = false
        var toast = createToast(root)

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
            if (!any) contentEl.appendChild(emptyEl('还没有命令，可手改 commands.yml 添加'))
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

        function renderGroups() {
          clearEl(groupsEl)
          if (data === null) return
          var model = currentModel()
          var lu = lastSlot(model, activeView)
          if (lu !== null) groupsEl.appendChild(lu)
          groupsEl.appendChild(groupRow(null, '全部', null, 'all', activeView === 'all'))
          if (model.cwd) {
            var cwdDisplay = model.displayNames[model.cwd] || pathBase(model.cwd)
            groupsEl.appendChild(groupRow('项目：', cwdDisplay, null, 'current-project', activeView === 'current-project'))
          }
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

        function renderAll() {
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
              cwd: (payload !== null && typeof payload === 'object' && typeof payload.cwd === 'string' && payload.cwd !== '') ? payload.cwd : null,
              mtime: payload !== null ? payload.mtime : null,
            }
            loadState('ready')
            var model = currentModel()
            if (!isValidView(activeView, model)) {
              activeView = model.lastUsed !== null ? model.lastUsed.id : 'all'
            }
            renderAll()
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

        function onCopyCommand(cmdId) {
          if (cmdId === null) return
          var cmd = findCommand(cmdId)
          if (cmd === null || typeof cmd.cmd !== 'string') return
          var viewId = activeView
          // 「全部」/「未分组」视图语境下复制：指向命令的第一个所属分组（功能文档 §3.4
          // 的 slot 指向 group:<名字> 才有跳转价值；'all' 不作为 lastUsed 存储）
          if (viewId === 'all' || viewId === 'ungrouped') {
            var firstGroup = (cmd.groups !== null && Array.isArray(cmd.groups) && cmd.groups.length > 0) ? cmd.groups[0] : null
            if (firstGroup !== null) viewId = 'group:' + firstGroup
          }
          copyText(cmd.cmd, function (ok) {
            if (!ok) {
              toast('复制失败', 'error')
              return
            }
            toast('已复制')
            // 刷新「上次使用」slot（功能文档 §3.4）：本地即时 + 远端持久化
            data.state.lastUsedViewId = viewId
            if (data.state.viewLastUsedAt === null || typeof data.state.viewLastUsedAt !== 'object') data.state.viewLastUsedAt = {}
            data.state.viewLastUsedAt[viewId] = Date.now()
            persistLastUsed(viewId)
            renderAll()
          })
        }

        // ── 事件委托（一次绑定，随重渲染复用）──
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

        contentEl.addEventListener('click', function (event) {
          var target = event.target || contentEl
          var retry = closestUp(target, function (n) { return n.getAttribute !== undefined && n.getAttribute('data-retry') !== null })
          if (retry !== null) {
            refreshData()
            return
          }
          var copyEl = closestUp(target, function (n) { return n.getAttribute !== undefined && n.getAttribute('data-copy-cmd') !== null })
          if (copyEl !== null) {
            var card = closestUp(copyEl, function (n) { return n.getAttribute !== undefined && n.getAttribute('data-cmd-id') !== null })
            onCopyCommand(card !== null ? card.getAttribute('data-cmd-id') : null)
          }
        })

        searchInput.addEventListener('input', function () {
          searchQuery = searchInput.value || ''
          renderContentView()
          updateSearchCount()
        })

        // 清空按钮
        var clearBtn = drawer.querySelector('.cmd-pad-search-clear')
        if (clearBtn !== null) {
          clearBtn.addEventListener('click', function () {
            if (searchQuery !== '') clearSearch()
            else focusSearch()
          })
        }

        function openDrawer() {
          drawer.setAttribute('data-open', 'true')
          applyClusterOffset(drawer)
          pushLayoutForDrawer(drawer, true)
          window.addEventListener('resize', onResize)
          refreshData() // 每次打开拉取最新（设计文档 §5.3 多标签页/手改 yml 保鲜）
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
        var onKeydown = function onKeydown(event) {
          if (drawer.getAttribute('data-open') !== 'true') return
          if (event.key === 'Escape') {
            // Esc 链（功能文档 §4.4）：搜索非空 → 清空搜索；否则收起抽屉
            if (searchQuery !== '') {
              clearSearch()
              if (typeof event.preventDefault === 'function') event.preventDefault()
              return
            }
            closeDrawer()
            return
          }
          if (event.key === '/') {
            var target = event.target
            var tag = target !== null && target !== undefined ? target.tagName : undefined
            if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !(target !== null && target.isContentEditable)) {
              if (typeof event.preventDefault === 'function') event.preventDefault()
              focusSearch()
            }
          }
        }
        document.addEventListener('keydown', onKeydown)

        root.appendChild(fab)
        root.appendChild(drawer)
        document.body.appendChild(root)
        applyClusterOffset(drawer)

        return function dispose() {
          document.removeEventListener('keydown', onKeydown)
          window.removeEventListener('resize', onResize)
          pushLayoutForDrawer(drawer, false)
          if (root.parentNode !== null) root.parentNode.removeChild(root)
          removeStyle()
        }
      }, 'dsh-cmd-pad: 降级形态浮动图标 + 抽屉')
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
    }
    return module.exports
  },
})
