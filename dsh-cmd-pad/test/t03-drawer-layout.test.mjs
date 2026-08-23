/**
 * T03 前体验修复：降级抽屉「占用式」布局推挤（pushLayoutForDrawer）node 模拟验证。
 * 场景（对照 client.js pushLayoutForDrawer 注释与 TASK.md 调整记录 #7）：
 *   1. 打开抽屉 → #root margin-right = calc(var(--dsh-sidebar-width,0px) + 抽屉宽)
 *   2. FAB 再点关闭 → margin 清除（回退 better-sidebar 规则）
 *   3. 顶栏 ✕ 关闭 → margin 清除
 *   4. Esc 关闭 → margin 清除
 *   5. 无 #root 元素 → 不报错、不设置
 *   6. dispose（插件卸载）→ margin 恢复
 *   7. resize 时抽屉开着 → 按新宽度重算
 * 运行：node test/t03-drawer-layout.test.mjs
 */
import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'

const CLIENT_SRC = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')

let passed = 0
let failed = 0

function check(name, fn) {
  try {
    fn()
    passed++
    console.log(`  ok  ${name}`)
  } catch (error) {
    failed++
    console.log(`FAIL  ${name}\n      ${error.message}`)
  }
}

// ── 最小 DOM stub（够 client.js apply 流程 + 避让 + 布局推挤使用）──
function makeEl(tag) {
  return {
    tag,
    attrs: {},
    children: [],
    listeners: {},
    className: '',
    textContent: '',
    innerHTML: '',
    title: '',
    type: 'button',
    style: {
      removeProperty(k) {
        delete this[k]
        // 浏览器语义：style.removeProperty('margin-right') 同时移除驼峰键 marginRight
        const camel = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
        delete this[camel]
      },
    },
    parentNode: null,
    _rect: null,
    get parentElement() { return this.parentNode },
    setAttribute(k, v) { this.attrs[k] = String(v) },
    getAttribute(k) { return this.attrs[k] !== undefined ? this.attrs[k] : null },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c },
    removeChild(c) {
      const i = this.children.indexOf(c)
      if (i >= 0) this.children.splice(i, 1)
      c.parentNode = null
      return c
    },
    addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn) },
    removeEventListener(t, fn) {
      const list = this.listeners[t] || []
      const i = list.indexOf(fn)
      if (i >= 0) list.splice(i, 1)
    },
    querySelector(sel) { return find(this, sel) },
    querySelectorAll(sel) { const acc = []; collect(this, sel, acc); return acc },
    getBoundingClientRect() {
      return this._rect || { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }
    },
    setRect(l, t, w, h) {
      this._rect = { width: w, height: h, top: t, left: l, right: l + w, bottom: t + h }
    },
  }
}

function matches(el, sel) {
  if (sel.startsWith('[')) {
    const m = /^\[([^\]=]+)(?:="([^"]*)")?\]$/.exec(sel)
    if (!m) return false
    const v = el.getAttribute(m[1])
    return m[2] === undefined ? v !== null : v === m[2]
  }
  if (sel.startsWith('.')) return el.className.split(/\s+/).includes(sel.slice(1))
  return el.tag === sel
}

function find(el, sel) {
  if (matches(el, sel)) return el
  for (const c of el.children) {
    const r = find(c, sel)
    if (r !== null) return r
  }
  return null
}

function collect(el, sel, acc) {
  if (matches(el, sel)) acc.push(el)
  for (const c of el.children) collect(c, sel, acc)
  return acc
}

/** 构建独立场景：body 预置 #root（可选）→ 执行 client.js → apply(mockCtx)。 */
function bootScene({ withAppRoot = true, innerWidth = 1200 } = {}) {
  const head = makeEl('head')
  const body = makeEl('body')
  if (withAppRoot) {
    const appRoot = makeEl('div')
    appRoot.setAttribute('id', 'root')
    body.appendChild(appRoot)
  }
  const windowEvents = {}
  const documentStub = {
    head,
    body,
    getElementById(id) { return find(body, `[id="${id}"]`) },
    createElement: (tag) => makeEl(tag),
    addEventListener() {},
    removeEventListener() {},
    querySelector(sel) { return find(body, sel) },
  }
  const windowStub = {
    innerWidth,
    __ModuleLoader__: { load(opts) { windowStub.__loaded = opts } },
    addEventListener(t, fn) { (windowEvents[t] = windowEvents[t] || []).push(fn) },
    removeEventListener(t, fn) {
      const list = windowEvents[t] || []
      const i = list.indexOf(fn)
      if (i >= 0) list.splice(i, 1)
    },
  }
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', CLIENT_SRC)(windowStub, documentStub)
  const factory = windowStub.__loaded.factory
  const moduleExports = factory(() => { throw new Error('require should not be used') })
  let disposer = null
  const ctx = {
    effect(fn) {
      const d = fn()
      if (typeof d === 'function') disposer = d
      return d
    },
  }
  moduleExports.apply(ctx)
  const drawer = find(body, '.cmd-pad-drawer')
  drawer.setRect(0, 0, 360, 720) // 抽屉渲染宽 360
  return {
    body,
    drawer,
    appRoot: find(body, '[id="root"]'),
    fab: find(body, '.cmd-pad-fab'),
    windowEvents,
    window: windowStub,
    dispose: () => { if (typeof disposer === 'function') disposer() },
  }
}

function clickFab(s) {
  s.fab.listeners.click.forEach((fn) => fn())
}

function closeViaX(s) {
  const x = find(s.drawer, '.cmd-pad-drawer-close')
  x.listeners.click.forEach((fn) => fn())
}

function marginOf(s) {
  return s.appRoot !== null ? s.appRoot.style.marginRight : undefined
}

// ── 场景 1：打开 → margin 推挤 ──
check('打开抽屉 → #root margin-right = calc(与 better-sidebar 并存)', () => {
  const s = bootScene()
  clickFab(s)
  assert.strictEqual(marginOf(s), 'calc(var(--dsh-sidebar-width, 0px) + 360px)')
})

// ── 场景 2：FAB 再点关闭 → margin 清除 ──
check('FAB 关闭 → margin 清除（回退 better-sidebar 规则）', () => {
  const s = bootScene()
  clickFab(s)
  assert.ok(marginOf(s) !== undefined)
  clickFab(s)
  assert.strictEqual(marginOf(s), undefined)
})

// ── 场景 3：顶栏 ✕ 关闭 → margin 清除 ──
check('顶栏 ✕ 关闭 → margin 清除', () => {
  const s = bootScene()
  clickFab(s)
  closeViaX(s)
  assert.strictEqual(marginOf(s), undefined)
})

// ── 场景 4：无 #root → 不报错、不设置 ──
check('无 #root 元素 → 打开不报错、不设置 margin', () => {
  const s = bootScene({ withAppRoot: false })
  clickFab(s)
  assert.strictEqual(marginOf(s), undefined)
})

// ── 场景 5：dispose（插件卸载）→ margin 恢复 ──
check('dispose → margin 恢复（抽屉开着时卸载）', () => {
  const s = bootScene()
  clickFab(s)
  assert.ok(marginOf(s) !== undefined)
  s.dispose()
  assert.strictEqual(marginOf(s), undefined)
})

// ── 场景 6：resize 时抽屉开着 → 按新宽度重算 ──
check('resize 时抽屉开着 → 按新宽度重算', () => {
  const s = bootScene()
  clickFab(s)
  assert.strictEqual(marginOf(s), 'calc(var(--dsh-sidebar-width, 0px) + 360px)')
  // 模拟窗口变窄：抽屉 92vw 收缩到 300
  s.drawer.setRect(0, 0, 300, 720)
  s.windowEvents.resize.forEach((fn) => fn())
  assert.strictEqual(marginOf(s), 'calc(var(--dsh-sidebar-width, 0px) + 300px)')
  // 关闭后 resize 不再重算
  clickFab(s)
  s.drawer.setRect(0, 0, 400, 720)
  s.windowEvents.resize.forEach((fn) => fn())
  assert.strictEqual(marginOf(s), undefined)
})

// ── 场景 7：关闭后 resize 监听已卸载 ──
check('关闭抽屉后 resize 监听卸载', () => {
  const s = bootScene()
  clickFab(s)
  assert.strictEqual((s.windowEvents.resize || []).length, 1)
  clickFab(s)
  assert.strictEqual((s.windowEvents.resize || []).length, 0)
})

console.log(`\n===== ${passed} passed, ${failed} failed =====`)
process.exit(failed > 0 ? 1 : 0)
