/**
 * dsh-cmd-pad client half（T01 最小骨架）
 *
 * 手写 wire format（零构建，AGENTS.md 硬规则 6）：
 *   window.__ModuleLoader__.load({ id: 'dsh-cmd-pad', factory })
 *   - id 必须等于包名（宿主按 /plugins/dsh-cmd-pad/client.js 供应本文件）；
 *   - factory 是 CJS 闭包：执行仅注册工厂，所有副作用收在闭包内；
 *   - 导出 apply(ctx)（cordis 插件形态），ctx.get() 可选探测可用。
 *
 * T01 范围：仅降级形态 —— 浮动图标 + 空抽屉（非模态、无蒙层、z-index 30、
 * data-dsh-cmd-pad 锚点；better-sidebar 角落按钮簇在场时顶栏 ✕ 左移避让）。
 * 主形态（better-sidebar Tab 注册）在 T06 实现，
 * 届时本文件按 ctx.get('betterSidebar') 探测分流（AGENTS.md 硬规则 1：
 * 绝不把 'betterSidebar' 写进硬 inject）。
 */
window.__ModuleLoader__.load({
  id: 'dsh-cmd-pad',
  factory: (require) => {
    'use strict'
    var module = { exports: {} }
    var exports = module.exports

    // ──────────────────────────────────────────────────────────────────
    // 样式：零硬编码颜色，全量 --dsw-alias-* 令牌 + --cp-* 兜底链
    // （docs/视觉风格统一规范.md §1/§4；类名一律 cmd-pad- 前缀）
    // ──────────────────────────────────────────────────────────────────
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
      '  /* 中性黑色投影（同 better-sidebar 的 #00000059）：仅承担浮起感，不承载主题色语义 */',
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
      '  overflow-y:auto;',
      '  display:flex;',
      '  align-items:center;',
      '  justify-content:center;',
      '  color:var(--dsw-alias-label-tertiary,var(--cp-label-tertiary,#6f7278));',
      '  font-size:12px;',
      '  -webkit-app-region:no-drag;',
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

    // ──────────────────────────────────────────────────────────────────
    // 浮动图标 + 空抽屉（降级形态，非模态 / 无蒙层）
    // ──────────────────────────────────────────────────────────────────
    var FAB_SVG = [
      '<svg viewBox="0 0 16 16" width="16" height="16" fill="none"',
      '     stroke="currentColor" stroke-width="1.5"',
      '     stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
      '  <rect x="1.25" y="1.25" width="13.5" height="13.5" rx="2.5"/>',
      '  <path d="M4.5 5.5 7 8l-2.5 2.5"/>',
      '  <path d="M8.5 10.5h3"/>',
      '</svg>',
    ].join('')

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

      var body = document.createElement('div')
      body.className = 'cmd-pad-drawer-body'
      // T01 空抽屉；T03 起渲染分组侧栏 / 命令卡片等真实内容
      body.textContent = '命令面板（T03 起填充内容）'

      drawer.appendChild(head)
      drawer.appendChild(body)
      return drawer
    }

    /**
     * better-sidebar 角落按钮簇避让（接入规范 §5.5 / 视觉规范 §4.2）。
     *
     * 背景（实测，见 TASK.md 调整记录 #6）：按钮簇 z-index 45 > 抽屉 30，
     * 常驻右上角（top:3px right:10px），会盖住抽屉顶栏 ✕。T01 仅探测
     * `[data-dsh-toggle-cluster]`——该锚点是 v0.15.1 快照实证的，实际安装的
     * v0.13.1 没有此属性，避让从未生效（重叠复现）。
     *
     * 修复：双锚点探测 + 打开时重算。
     *   1) `[data-dsh-toggle-cluster]`（v0.15.1+ 专用锚点，升级后仍优先）；
     *   2) `[data-dsh-better-sidebar]` 宿主（v0.13.x）：宿主内几何探测——
     *      顶部（top ≤ 40px）且右缘贴近视口右缘（innerWidth-120 内）的可见
     *      `<button>`，取最右者；按钮簇 fixed top:3px right:10px，而面板内
     *      tabBar 按钮右缘被其自身 `padding-right:72px` 让位更靠左，故「最右」
     *      近似按钮簇；极端误判只会让避让过宽（不重叠），可接受。
     *   3) 调用时机：挂载时一次 + **每次抽屉打开时重算**（better-sidebar 是
     *      React 挂载，与插件 apply 时序不定，打开时探测最可靠）。
     * 仅在按钮簇右缘真实落在视口内时避让。
     * 注意：这是「better-sidebar 在场但 cmd-pad 走降级」的过渡态处理；
     * T06 主形态下 cmd-pad 不自建浮层，本函数不再需要。
     */
    function findClusterRect() {
      if (typeof document === 'undefined' || typeof window === 'undefined') return null
      // 锚点 1：v0.15.1+ 专用 data 锚点
      var direct = document.querySelector('[data-dsh-toggle-cluster]')
      if (direct !== null && typeof direct.getBoundingClientRect === 'function') {
        var r0 = direct.getBoundingClientRect()
        if (r0.width > 0 && r0.right <= window.innerWidth && r0.right >= 0) return r0
      }
      // 锚点 2：v0.13.x 宿主内几何探测
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
      // 优先量按钮簇容器（按钮的父元素）——比单按钮更精确
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
        // ✕ 右缘推到按钮簇左缘左侧 8px：padding-right = 视口宽 - 按钮簇左缘 + 8
        head.style.paddingRight = (window.innerWidth - rect.left + 8) + 'px'
      }
    }

    /**
     * cordis 插件主体（client 半）。
     * T01：始终渲染降级形态；T06 起先探测 betterSidebar，
     * 探测到则改走 registerTab（主形态），并跳过本浮动 UI。
     */
    function apply(ctx) {
      ctx.effect(() => {
        ensureStyle()

        var root = createRoot()
        var fab = createFab(function onToggle() {
          var open = drawer.getAttribute('data-open') === 'true'
          drawer.setAttribute('data-open', open ? 'false' : 'true')
          // 打开时重算避让（better-sidebar 挂载时序不定，此时必然已挂载）
          if (!open) applyClusterOffset(drawer)
        })
        var drawer = createDrawer(function onClose() {
          drawer.setAttribute('data-open', 'false')
        })
        var onKeydown = function onKeydown(event) {
          if (event.key !== 'Escape') return
          if (drawer.getAttribute('data-open') !== 'true') return
          drawer.setAttribute('data-open', 'false')
        }
        document.addEventListener('keydown', onKeydown)

        root.appendChild(fab)
        root.appendChild(drawer)
        document.body.appendChild(root)
        // better-sidebar 角落按钮簇在场时，抽屉顶栏 ✕ 左移避让（见 applyClusterOffset）
        applyClusterOffset(drawer)

        return function dispose() {
          document.removeEventListener('keydown', onKeydown)
          if (root.parentNode !== null) root.parentNode.removeChild(root)
          removeStyle()
        }
      }, 'dsh-cmd-pad: 降级形态浮动图标 + 抽屉')
    }

    exports.apply = apply
    return module.exports
  },
})
