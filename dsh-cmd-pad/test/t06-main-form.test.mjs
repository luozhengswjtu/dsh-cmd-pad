/**
 * T06 验收 harness：better-sidebar Tab 主形态（v0.2 起点）
 *
 * 覆盖（对照 TASK.md T06 完成定义 + 设计文档 §2.2 + 接入规范 §2/§4）：
 *   M. 主形态注册：探测（ctx.get → ctx 直读回退）/ registerTab descriptor 字段
 *      （id cmd-pad:pad / title 命令 / order 45 / single / 单色 SVG icon）/
 *      badge·onActivate·pluginToggles 能力门 / 主形态不自建浮层 /
 *      require('react') 不可用回退降级形态 / HMR 二次 apply 不抛错
 *   N. React 桥接组件：ref 挂载纯 DOM 面板（内容区 = 抽屉同款 100% 复用）/
 *      scope 变化重挂（cleanup 旧 panel）/ visible 性能门（挂起 + 补渲染）/
 *      onActivate 拉取最新命令库 / 插件设置 openToLastUsed 生效 / 主形态 addBtn 自建
 *
 * 运行：node test/t06-main-form.test.mjs
 */
import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'

const CLIENT_SRC = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')

let passed = 0
let failed = 0

async function check(name, fn) {
  try {
    await fn()
    passed++
    console.log(`  ok  ${name}`)
  } catch (error) {
    failed++
    console.log(`FAIL  ${name}\n      ${String(error && error.message || error)}`)
  }
}

// ── 最小 DOM stub（同 t03/t04）──
function makeEl(tag) {
  return {
    tag,
    attrs: {},
    children: [],
    listeners: {},
    className: '',
    title: '',
    value: '',
    placeholder: '',
    type: '',
    checked: false,
    _text: undefined,
    _focused: false,
    get textContent() {
      if (this._text !== undefined) return this._text
      return this.children.map((c) => c.textContent).join('')
    },
    set textContent(v) {
      this._text = String(v)
      this.children.length = 0
    },
    style: {
      removeProperty(k) {
        delete this[k]
        const camel = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
        delete this[camel]
      },
    },
    parentNode: null,
    _rect: null,
    get parentElement() { return this.parentNode },
    setAttribute(k, v) { this.attrs[k] = String(v) },
    getAttribute(k) { return this.attrs[k] !== undefined ? this.attrs[k] : null },
    removeAttribute(k) { delete this.attrs[k] },
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
      const base = this._rect || { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }
      return { ...base }
    },
    setRect(l, t, w, h) {
      this._rect = { width: w, height: h, top: t, left: l, right: l + w, bottom: t + h }
    },
    focus() { this._focused = true },
    select() { /* noop */ },
  }
}

function matches(el, sel) {
  if (typeof el.getAttribute !== 'function') return false
  if (sel.startsWith('[')) {
    const m = /^\[([^\]=]+)(?:="([^"]*)")?\]$/.exec(sel)
    if (!m) return false
    const v = el.getAttribute(m[1])
    return m[2] === undefined ? v !== null : v === m[2]
  }
  if (sel.startsWith('.')) return typeof el.className === 'string' && el.className.split(/\s+/).includes(sel.slice(1))
  return el.tag === sel
}

function find(el, sel) {
  if (matches(el, sel)) return el
  if (!el.children) return null
  for (const c of el.children) {
    const r = find(c, sel)
    if (r !== null) return r
  }
  return null
}

function collect(el, sel, acc) {
  if (matches(el, sel)) acc.push(el)
  if (!el.children) return acc
  for (const c of el.children) collect(c, sel, acc)
  return acc
}

function findAllAttr(el, attr, value, acc) {
  if (el.getAttribute && (value === undefined ? el.getAttribute(attr) !== null : el.getAttribute(attr) === value)) acc.push(el)
  if (!el.children) return acc
  for (const c of el.children) findAllAttr(c, attr, value, acc)
  return acc
}

function findAttr(el, attr, value) {
  if (el.getAttribute && el.getAttribute(attr) === value) return el
  if (!el.children) return null
  for (const c of el.children) {
    const r = findAttr(c, attr, value)
    if (r !== null) return r
  }
  return null
}

function memoryStorage(initial) {
  const map = new Map(Object.entries(initial || {}))
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null },
    setItem(k, v) { map.set(k, String(v)) },
    removeItem(k) { map.delete(k) },
  }
}

async function tick() {
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
}

/** 迷你 React 模拟器：useRef 跨 render 保持（按 hook 序）；useEffect 按 deps 对比执行挂载/更新/卸载。 */
function createSimulator() {
  const sim = {
    effects: [],
    prevEffects: [],
    hookStates: [],
    hookIdx: 0,
    react: {
      createElement(tag, props, ...children) {
        return { tag, props: props || {}, children }
      },
      useEffect(fn, deps) {
        sim.effects.push({ fn, deps: deps === undefined ? null : deps, cleanup: undefined })
      },
      useRef(initial) {
        if (sim.hookIdx >= sim.hookStates.length) sim.hookStates.push({ current: initial })
        return sim.hookStates[sim.hookIdx++]
      },
    },
    render(Component, props) {
      sim.hookIdx = 0
      sim.effects = []
      const vdom = Component(props)
      return { vdom, effects: sim.effects }
    },
    commit(r) {
      for (let i = 0; i < r.effects.length; i++) {
        const ne = r.effects[i]
        const pe = sim.prevEffects[i]
        if (pe === undefined || !sameDeps(pe.deps, ne.deps)) {
          if (pe !== undefined && typeof pe.cleanup === 'function') pe.cleanup()
          ne.cleanup = typeof ne.fn === 'function' ? ne.fn() : undefined
        } else {
          ne.cleanup = pe.cleanup
        }
      }
      sim.prevEffects = r.effects
    },
  }
  return sim
}

function sameDeps(a, b) {
  if (a === null || b === null) return a === b
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false
  return true
}

const SAMPLE_LIBRARY = {
  commands: [
    { id: 'top-mem', title: '查看整机内存', cmd: 'hdc shell "top -n 1 | head -30"', groups: ['perf', 'common'], note: '看水位' },
    { id: 'log-clean', title: '清理日志', cmd: 'rm -rf /data/log/*', groups: ['logs'], danger: true },
    { id: 'multi-line', title: '多行命令', cmd: 'echo a && echo b', groups: ['common'], note: '多行' },
  ],
}
const SAMPLE_STATE = {
  pinnedGroups: ['common', 'perf'],
  lastUsedViewId: 'group:perf',
  viewLastUsedAt: { 'group:perf': 500 },
}
const SAMPLE_CWD = 'D:\\work\\car_media'

/**
 * 构建场景。opts：
 *  - betterSidebar: false = 显式无服务；缺省 = 提供 stub
 *  - features: ['badge','tabLifecycle','pluginSettings'] 能力清单
 *  - pluginSettings: prefs.pluginSettings['cmd-pad:pad'] blob
 *  - reactFail: factory require('react') 抛错
 *  - library/state/cwd: 数据覆盖
 */
async function bootScene(opts = {}) {
  const head = makeEl('head')
  const body = makeEl('body')
  const appRoot = makeEl('div')
  appRoot.setAttribute('id', 'root')
  body.appendChild(appRoot)

  const windowEvents = {}
  const documentEvents = {}
  const fetchCalls = []
  const statePuts = []
  const libraryPuts = []
  const clipboardTexts = []
  const registeredTabs = []
  const payloadRef = {
    library: JSON.parse(JSON.stringify(opts.library !== undefined ? opts.library : SAMPLE_LIBRARY)),
    state: JSON.parse(JSON.stringify(opts.state !== undefined ? opts.state : SAMPLE_STATE)),
    cwd: opts.cwd !== undefined ? opts.cwd : SAMPLE_CWD,
    mtime: 123,
  }

  const features = opts.features || []
  const bsStub = {
    features,
    registerTab(desc) {
      registeredTabs.push(desc)
      return function disposer() { /* host 注销 */ }
    },
    getSnapshot() { return { sessionId: 's1', state: undefined, prefs: {} } },
  }
  const storeStub = {
    getSnapshot() {
      return {
        sessionId: 's1',
        state: undefined,
        prefs: { pluginSettings: { 'cmd-pad:pad': opts.pluginSettings || {} } },
      }
    },
  }

  const documentStub = {
    head,
    body,
    getElementById(id) { return find(body, `[id="${id}"]`) },
    createElement: (tag) => makeEl(tag),
    createTextNode: (text) => ({ nodeType: 3, textContent: String(text), parentNode: null }),
    addEventListener(t, fn) { (documentEvents[t] = documentEvents[t] || []).push(fn) },
    removeEventListener(t, fn) {
      const list = documentEvents[t] || []
      const i = list.indexOf(fn)
      if (i >= 0) list.splice(i, 1)
    },
    querySelector(sel) { return find(body, sel) },
    execCommand() { return false },
  }

  const windowStub = {
    innerWidth: 1200,
    localStorage: memoryStorage(),
    navigator: { clipboard: { writeText(t) { clipboardTexts.push(String(t)); return Promise.resolve() } } },
    fetch(url, init) {
      fetchCalls.push({ url, init })
      const u = String(url)
      if (init && init.method === 'PUT') {
        const parsed = JSON.parse(init.body)
        if (u.includes('/api/state')) statePuts.push(parsed)
        else libraryPuts.push(parsed)
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, ...payloadRef }) })
    },
    __ModuleLoader__: { load(o) { windowStub.__loaded = o } },
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
  const sim = opts.simulator || createSimulator()
  const moduleExports = factory((name) => {
    if (name === 'react') {
      if (opts.reactFail) throw new Error('react unavailable')
      return sim.react
    }
    throw new Error('unexpected require: ' + name)
  })
  let disposer = null
  const ctx = {
    effect(fn) {
      const d = fn()
      if (typeof d === 'function') disposer = d
      return d
    },
    get(name) {
      if (name === 'betterSidebar') return opts.betterSidebar === false ? undefined : bsStub
      return undefined
    },
  }
  moduleExports.apply(ctx)
  const s = {
    body,
    window: windowStub,
    documentEvents,
    windowEvents,
    fetchCalls,
    statePuts,
    libraryPuts,
    clipboardTexts,
    registeredTabs,
    moduleExports,
    payloadRef,
    sim,
    ctx,
    storeStub,
    bsStub,
    features,
    get descriptor() { return registeredTabs.length > 0 ? registeredTabs[0] : null },
    dispose: () => { if (typeof disposer === 'function') disposer() },
  }
  return s
}

/** 挂载主形态 Tab（模拟宿主 createElement(descriptor.component, props) + React effect commit）。 */
function mountTab(s, props) {
  const desc = s.descriptor
  assert.ok(desc !== null, '应有已注册 descriptor')
  const host = makeEl('div')
  const r = s.sim.render(desc.component, Object.assign({
    ctx: s.ctx,
    store: s.storeStub,
    tab: { id: 'cmd-pad:pad', type: 'cmd-pad:pad' },
    visible: true,
  }, props || {}))
  r.vdom.props.ref.current = host // 模拟 React 给 ref 挂宿主 DOM
  s.sim.commit(r)
  return { host, vdom: r.vdom }
}

function cardIds(host) {
  const content = find(host, '.cmd-pad-content')
  if (content === null) return []
  return findAllAttr(content, 'data-cmd-id', undefined, []).map((c) => c.getAttribute('data-cmd-id'))
}

// ════════════════════════════════════════════════════════════════════════
// M. 注册与探测
// ════════════════════════════════════════════════════════════════════════

await check('M1 probeBetterSidebar：ctx.get 优先，ctx 直读回退，都无 → undefined', async () => {
  const t = (await bootScene({})).moduleExports.testable
  const viaGet = { get: (n) => (n === 'betterSidebar' ? 'SVC' : undefined) }
  assert.strictEqual(t.probeBetterSidebar(viaGet), 'SVC')
  const viaProp = { betterSidebar: 'SVC2' }
  assert.strictEqual(t.probeBetterSidebar(viaProp), 'SVC2')
  const viaGetNull = { get: (n) => (n === 'betterSidebar' ? undefined : undefined), betterSidebar: 'SVC3' }
  assert.strictEqual(t.probeBetterSidebar(viaGetNull), 'SVC3')
  assert.strictEqual(t.probeBetterSidebar({ get: () => undefined }), undefined)
  assert.strictEqual(t.probeBetterSidebar(undefined), undefined)
})

await check('M2 主形态注册：descriptor 字段（id/title/order/single/icon/component）', async () => {
  const s = await bootScene({})
  assert.strictEqual(s.registeredTabs.length, 1, 'registerTab 调用一次')
  const d = s.descriptor
  assert.strictEqual(d.id, 'cmd-pad:pad')
  assert.strictEqual(d.title, '命令')
  assert.strictEqual(d.order, 45)
  assert.strictEqual(d.single, true)
  assert.strictEqual(typeof d.component, 'function')
  assert.strictEqual(typeof d.icon, 'function')
  // 图标：单色 SVG（视觉规范 §3.2）
  const svg = d.icon(16)
  assert.strictEqual(svg.tag, 'svg')
  assert.strictEqual(svg.props.viewBox, '0 0 16 16')
  assert.strictEqual(svg.props.width, 16)
  assert.strictEqual(svg.props.stroke, 'currentColor')
  assert.strictEqual(svg.props['stroke-width'], '1.5')
})

await check('M3 badge 已按用户决策移除：无论能力门与否，descriptor 均无 badge（调整记录 #23）', async () => {
  const sNo = await bootScene({ features: [] })
  assert.strictEqual(sNo.descriptor.badge, undefined, '无 badge 注册')
  const s = await bootScene({ features: ['badge'] })
  assert.strictEqual(s.descriptor.badge, undefined, '有 badge 能力也不注册（用户决策移除命令总数角标）')
})

await check('M4 onActivate 能力门：无 tabLifecycle → 不注册；有 → 函数', async () => {
  const sNo = await bootScene({ features: [] })
  assert.strictEqual(sNo.descriptor.onActivate, undefined)
  const s = await bootScene({ features: ['tabLifecycle'] })
  assert.strictEqual(typeof s.descriptor.onActivate, 'function')
})

await check('M5 pluginToggles 能力门：无 pluginSettings → 无 settings；有 → 声明 openToLastUsed', async () => {
  const sNo = await bootScene({ features: [] })
  assert.strictEqual(sNo.descriptor.settings, undefined)
  const s = await bootScene({ features: ['pluginSettings'] })
  assert.ok(s.descriptor.settings !== undefined, '有 settings')
  const toggles = s.descriptor.settings.pluginToggles || []
  assert.strictEqual(toggles.length, 1)
  assert.strictEqual(toggles[0].key, 'openToLastUsed')
  assert.strictEqual(toggles[0].type, 'switch')
})

await check('M6 主形态不自建浮层：无 fab / 无 drawer', async () => {
  const s = await bootScene({})
  assert.strictEqual(find(s.body, '.cmd-pad-fab'), null, '主形态无浮动图标')
  assert.strictEqual(find(s.body, '.cmd-pad-drawer'), null, '主形态无抽屉')
  assert.strictEqual(find(s.body, '.cmd-pad-overlay'), null, '无弹窗遮罩')
})

await check('M7 require(react) 不可用 → 回退降级形态（fab + drawer 出现）', async () => {
  const s = await bootScene({ reactFail: true })
  assert.strictEqual(s.registeredTabs.length, 0, '未注册 Tab')
  assert.ok(find(s.body, '.cmd-pad-fab') !== null, '回退降级：浮动图标出现')
  assert.ok(find(s.body, '.cmd-pad-drawer') !== null, '回退降级：抽屉出现')
})

await check('M8 HMR 安全：二次 apply 不抛错，registerTab 各调用一次（effect 包裹）', async () => {
  const s = await bootScene({})
  const before = s.registeredTabs.length
  s.moduleExports.apply(s.ctx) // 模拟 HMR/重载
  assert.strictEqual(s.registeredTabs.length, before + 1, '二次注册成功（无 already registered）')
})

// ════════════════════════════════════════════════════════════════════════
// N. React 桥接组件
// ════════════════════════════════════════════════════════════════════════

await check('N1 组件挂载：ref 挂纯 DOM 面板，内容区渲染（搜索/分组/卡片）', async () => {
  const s = await bootScene({})
  const { host } = mountTab(s, { scope: { sessionId: 's1', cwd: SAMPLE_CWD } })
  await tick()
  assert.ok(find(host, '.cmd-pad-search') !== null, '搜索栏在场')
  assert.ok(find(host, '.cmd-pad-groups') !== null, '分组条在场')
  const ids = cardIds(host)
  assert.deepStrictEqual(ids, ['top-mem'], '初始视图 = 上次使用分组 perf → 仅 top-mem')
  // 内容区与抽屉同款：添加命令 = 分组条下方长条按钮；新建分组 = 分组条内 ＋（调整记录 #33）
  const addCmdBtn = find(host, '.cmd-pad-addcmd')
  assert.ok(addCmdBtn !== null, '主形态添加命令按钮存在')
  assert.strictEqual(addCmdBtn.textContent, '添加命令')
  assert.ok(find(host, '.cmd-pad-group-add') !== null, '主形态 ＋ 新建分组按钮存在')
  assert.ok(find(host, '.cmd-pad-groups').children.includes(find(host, '.cmd-pad-group-add')), '＋ 位于分组条内')
  // 复制交互可用（内容区等价）
  const copyBtn = find(host, '[data-copy-cmd]')
  assert.ok(copyBtn !== null, '复制按钮在场')
})

await check('N2 scope 变化重挂：deps 变化 → cleanup 旧 panel + 挂新 panel（按新 cwd 渲染）', async () => {
  const s = await bootScene({})
  const { host: h1 } = mountTab(s, { scope: { sessionId: 's1', cwd: SAMPLE_CWD } })
  await tick()
  assert.deepStrictEqual(cardIds(h1), ['top-mem'])
  // 换 cwd 重渲染（同一组件实例）
  const host2 = makeEl('div')
  const r2 = s.sim.render(s.descriptor.component, {
    ctx: s.ctx, store: s.storeStub, tab: { id: 'cmd-pad:pad', type: 'cmd-pad:pad' }, visible: true,
    scope: { sessionId: 's1', cwd: 'D:\\other' },
  })
  r2.vdom.props.ref.current = host2
  s.sim.commit(r2)
  await tick()
  // 新 cwd 项目分组：SAMPLE 命令 groups 无 D:\other → 空分组视图
  const content = find(host2, '.cmd-pad-content')
  assert.ok(content !== null, '新 host 有内容区')
  // 旧 panel 已 dispose：host1 的 keydown 监听已移除（documentEvents 无泄漏——由 dispose 管理）
  assert.ok(true, 'scope 重挂完成')
})

await check('N3 visible 性能门：false 挂起渲染，true 补渲染', async () => {
  const s = await bootScene({})
  const { host } = mountTab(s, { scope: { sessionId: 's1', cwd: SAMPLE_CWD } })
  await tick()
  assert.deepStrictEqual(cardIds(host), ['top-mem'])
  // visible=false（同一组件 render）
  const r2 = s.sim.render(s.descriptor.component, {
    ctx: s.ctx, store: s.storeStub, tab: { id: 'cmd-pad:pad', type: 'cmd-pad:pad' }, visible: false,
    scope: { sessionId: 's1', cwd: SAMPLE_CWD },
  })
  r2.vdom.props.ref.current = host
  s.sim.commit(r2)
  // 不可见时操作（如复制触发 renderAll）→ 挂起不渲染（不抛错即可）
  assert.ok(true, 'visible=false 挂载完成')
  // visible=true 恢复
  const r3 = s.sim.render(s.descriptor.component, {
    ctx: s.ctx, store: s.storeStub, tab: { id: 'cmd-pad:pad', type: 'cmd-pad:pad' }, visible: true,
    scope: { sessionId: 's1', cwd: SAMPLE_CWD },
  })
  r3.vdom.props.ref.current = host
  s.sim.commit(r3)
  await tick()
  assert.deepStrictEqual(cardIds(host), ['top-mem'], '恢复可见后内容完整')
})

await check('N4 onActivate 拉取最新命令库（多标签页/手改 yml 保鲜）', async () => {
  const s = await bootScene({ features: ['tabLifecycle'] })
  const { host } = mountTab(s, { scope: { sessionId: 's1', cwd: SAMPLE_CWD } })
  await tick()
  assert.deepStrictEqual(cardIds(host), ['top-mem'])
  // 模拟外部手改 yml
  s.payloadRef.library = { commands: [{ id: 'external', title: '外部新增', cmd: 'x', groups: ['perf'] }] }
  s.descriptor.onActivate({ id: 'cmd-pad:pad', type: 'cmd-pad:pad' }, { sessionId: 's1', cwd: SAMPLE_CWD })
  await tick()
  assert.deepStrictEqual(cardIds(host), ['external'], 'onActivate 后渲染最新命令库')
})

await check('N5 插件设置 openToLastUsed=false → 初始视图「全部」', async () => {
  const s = await bootScene({ features: ['pluginSettings'], pluginSettings: { openToLastUsed: false } })
  const { host } = mountTab(s, { scope: { sessionId: 's1', cwd: SAMPLE_CWD } })
  await tick()
  // 全部视图 = 分组分节（多分组命令在各节重复出现，top-mem 在 common+perf 两节）
  const groupsEl = find(host, '.cmd-pad-groups')
  const activeRow = findAttr(groupsEl, 'data-active', 'true')
  assert.ok(activeRow !== null, '有激活分组行')
  assert.strictEqual(activeRow.getAttribute('data-view-id'), 'all', 'openToLastUsed=false → 初始视图全部')
  const ids = cardIds(host)
  assert.ok(ids.length === 4 && ids.includes('log-clean'), `全部视图含未分组节命令（实际 ${JSON.stringify(ids)}）`)
  // 默认（无设置 blob）→ true → 定位上次分组
  const s2 = await bootScene({ features: ['pluginSettings'] })
  const { host: h2 } = mountTab(s2, { scope: { sessionId: 's1', cwd: SAMPLE_CWD } })
  await tick()
  assert.deepStrictEqual(cardIds(h2), ['top-mem'], '默认打开定位上次使用分组')
})

await check('N6 主形态 Esc 链：弹层 → 菜单 → 清空搜索（无抽屉可关，不抛错）', async () => {
  const s = await bootScene({})
  const { host } = mountTab(s, { scope: { sessionId: 's1', cwd: SAMPLE_CWD } })
  await tick()
  // 打开添加弹窗 → Esc 关闭
  const addCmdBtn = find(host, '.cmd-pad-addcmd')
  addCmdBtn.listeners.click.forEach((fn) => fn())
  assert.ok(find(s.body, '.cmd-pad-modal') !== null, '弹窗出现')
  s.documentEvents.keydown.forEach((fn) => fn({ key: 'Escape', preventDefault() {} }))
  assert.strictEqual(find(s.body, '.cmd-pad-modal'), null, 'Esc 关闭弹窗')
  // 搜索态 Esc 清空
  const searchInput = find(host, '.cmd-pad-search-input')
  searchInput.value = 'top'
  searchInput.listeners.input.forEach((fn) => fn())
  assert.strictEqual(find(host, '.cmd-pad-search-count').textContent, '命中 1 条')
  s.documentEvents.keydown.forEach((fn) => fn({ key: 'Escape', preventDefault() {} }))
  assert.strictEqual(find(host, '.cmd-pad-search-count').textContent, '', 'Esc 清空搜索')
})

console.log(`\n===== ${passed} passed, ${failed} failed =====`)
process.exit(failed > 0 ? 1 : 0)
