/**
 * T01/T02 遗留修复：better-sidebar 按钮簇避让（applyClusterOffset）node 模拟验证。
 * 场景（对照 TASK.md 调整记录 #6 与 client.js findClusterRect 注释）：
 *   1. 无任何锚点 → 不避让
 *   2. v0.15.1 锚点 [data-dsh-toggle-cluster] 在场 → 按其 rect 避让
 *   3. v0.13.1 宿主 [data-dsh-better-sidebar] + 顶部右缘按钮 → 按按钮父容器 rect 避让
 *   4. 宿主在场但按钮不在右上角 → 不避让
 *   5. 按钮右缘在视口外（面板展开过渡）→ 不避让
 *   6. 打开抽屉时重算（时序修复：挂载时 better-sidebar 未渲染，打开时补上）
 *   7. 挂载时宿主已在 → 挂载即避让
 * 运行：node test/t02-cluster-offset.test.mjs
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

// ── 最小 DOM stub（够 client.js apply 流程 + 避让逻辑使用）──
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
    style: {},
    parentNode: null,
    _rect: null,
    get parentElement() { return this.parentNode }, // 浏览器语义：元素父节点
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
    removeEventListener() {},
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

/** 构建独立场景：执行 client.js 顶层（注册 factory）→ 取 factory → apply(mockCtx)。 */
function bootScene({ innerWidth = 1200, seedBody } = {}) {
  const head = makeEl('head')
  const body = makeEl('body')
  if (seedBody) seedBody(body, makeEl)
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
  }
  // 执行 client.js（new Function 注入 window/document 全局）
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', CLIENT_SRC)(windowStub, documentStub)
  const factory = windowStub.__loaded.factory
  const moduleExports = factory(() => { throw new Error('require should not be used in T01/T02 client') })
  const ctx = { effect(fn) { const d = fn(); return typeof d === 'function' ? d : undefined } }
  moduleExports.apply(ctx)
  return { window: windowStub, document: documentStub, body, head, drawerHead: () => find(body, '.cmd-pad-drawer-head') }
}

/** 打开抽屉（点击 FAB，模拟 onToggle）。 */
function openDrawer(scene) {
  const fab = find(scene.body, '.cmd-pad-fab')
  fab.listeners.click.forEach((fn) => fn())
}

function paddingOf(scene) {
  const head = scene.drawerHead()
  return head !== null ? head.style.paddingRight || '' : ''
}

// ── 场景 1：无任何锚点 → 不避让 ──
check('无按钮簇（无锚点/无宿主）→ 不避让', () => {
  const s = bootScene()
  openDrawer(s)
  assert.strictEqual(paddingOf(s), '')
})

// ── 场景 2：v0.15.1 锚点 [data-dsh-toggle-cluster] → 按其 rect 避让 ──
check('v0.15.1 锚点 [data-dsh-toggle-cluster] 在场 → 按 rect 避让', () => {
  const s = bootScene({
    seedBody(body, makeEl) {
      const cluster = makeEl('div')
      cluster.setAttribute('data-dsh-toggle-cluster', '')
      cluster.setRect(1130, 3, 60, 28) // left=1130, right=1190, 视口宽 1200
      body.appendChild(cluster)
    },
  })
  openDrawer(s)
  assert.strictEqual(paddingOf(s), '78px') // 1200 - 1130 + 8
})

// ── 场景 3：v0.13.1 宿主 + 顶部右缘按钮 → 按父容器 rect 避让 ──
check('v0.13.1 宿主 [data-dsh-better-sidebar] + 顶部右缘按钮 → 按父容器 rect 避让', () => {
  const s = bootScene({
    seedBody(body, makeEl) {
      const host = makeEl('div')
      host.setAttribute('data-dsh-better-sidebar', '')
      const cluster = makeEl('div')
      cluster.setRect(1130, 3, 60, 28)
      const b1 = makeEl('button')
      b1.setRect(1130, 3, 28, 28)
      const b2 = makeEl('button')
      b2.setRect(1162, 3, 28, 28)
      cluster.appendChild(b1)
      cluster.appendChild(b2)
      host.appendChild(cluster)
      body.appendChild(host)
    },
  })
  openDrawer(s)
  // 最右按钮 right=1190 → 父容器 cluster rect left=1130 → paddingRight = 78px
  assert.strictEqual(paddingOf(s), '78px')
})

// ── 场景 4：宿主在场但按钮不在右上角 → 不避让 ──
check('宿主在场但按钮不在右上角 → 不避让', () => {
  const s = bootScene({
    seedBody(body, makeEl) {
      const host = makeEl('div')
      host.setAttribute('data-dsh-better-sidebar', '')
      const btn = makeEl('button')
      btn.setRect(500, 200, 100, 28) // 中部，非顶部右缘
      host.appendChild(btn)
      body.appendChild(host)
    },
  })
  openDrawer(s)
  assert.strictEqual(paddingOf(s), '')
})

// ── 场景 5：按钮右缘在视口外 → 不避让 ──
check('按钮右缘在视口外（右缘 > innerWidth）→ 不避让', () => {
  const s = bootScene({
    seedBody(body, makeEl) {
      const host = makeEl('div')
      host.setAttribute('data-dsh-better-sidebar', '')
      const btn = makeEl('button')
      btn.setRect(1210, 3, 60, 28) // right=1270 > 1200
      host.appendChild(btn)
      body.appendChild(host)
    },
  })
  openDrawer(s)
  assert.strictEqual(paddingOf(s), '')
})

// ── 场景 6：时序修复——挂载时无宿主，打开前宿主渲染 → 打开时重算生效 ──
check('时序修复：挂载时无宿主，打开前宿主渲染 → 打开时重算生效', () => {
  const s = bootScene()
  openDrawer(s)
  assert.strictEqual(paddingOf(s), '') // 挂载时无宿主 → 未避让
  // better-sidebar 稍后挂载：注入宿主 + 按钮簇
  const host = makeEl('div')
  host.setAttribute('data-dsh-better-sidebar', '')
  const cluster = makeEl('div')
  cluster.setRect(1140, 3, 50, 28)
  const btn = makeEl('button')
  btn.setRect(1162, 3, 28, 28)
  cluster.appendChild(btn)
  host.appendChild(cluster)
  s.body.appendChild(host)
  // 再点一次 FAB 关闭 → 打开 → 重算
  const fab = find(s.body, '.cmd-pad-fab')
  fab.listeners.click.forEach((fn) => fn()) // 关闭
  fab.listeners.click.forEach((fn) => fn()) // 打开（重算）
  assert.strictEqual(paddingOf(s), '68px') // 1200 - 1140 + 8
})

// ── 场景 7：挂载时直接避让（better-sidebar 先于 cmd-pad 渲染）──
check('挂载时宿主已在 → 挂载即避让', () => {
  const s = bootScene({
    seedBody(body, makeEl) {
      const host = makeEl('div')
      host.setAttribute('data-dsh-better-sidebar', '')
      const cluster = makeEl('div')
      cluster.setRect(1130, 3, 60, 28)
      const btn = makeEl('button')
      btn.setRect(1162, 3, 28, 28)
      cluster.appendChild(btn)
      host.appendChild(cluster)
      body.appendChild(host)
    },
  })
  // 挂载时即调用一次 applyClusterOffset（client.js apply 内）
  assert.strictEqual(paddingOf(s), '78px')
})

console.log(`\n===== ${passed} passed, ${failed} failed =====`)
process.exit(failed > 0 ? 1 : 0)
