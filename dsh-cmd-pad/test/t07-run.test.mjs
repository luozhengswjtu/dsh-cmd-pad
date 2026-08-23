/**
 * T07 验收 harness：终端直写运行通道（主形态）
 *
 * 覆盖（对照 TASK.md T07 完成定义 + 设计文档 §4.2/§4.3 + 用户决策 2026-08-23）：
 *   R. 纯逻辑：terminalTabsOf（splits+bottomSplits 叶子遍历 / agent: 排除 / 空容错）/
 *      pickNewTerminalTab（差集识别新开终端）/ terminalWsUrl（sessionId/tab 编码、cwd 可选）/
 *      terminalSendText（普通带 \r / 危险不带 \r）
 *   S. runner 流程（stub bs + stub WebSocket）：openTab 新开专用终端（用户决策，不复用活跃终端）/
 *      差集识别新终端 / WS 附加 URL / 发送文本 / bare drop（不发 {type:'close'} 帧）/
 *      成功 Toast（普通 / 危险）
 *   T. 降级链（完成定义 3）：终端配额满（openTab 无新终端）/ WS error → 复制 + Toast
 *      「已复制，到终端粘贴执行」（用户决策：不再写对话输入框，调整记录 #21）
 *   U. DOM 交互：主形态卡片渲染「运行」按钮 + 右键菜单「运行」首位（设计文档 §4.1）/
 *      点击运行（普通直接 run）→ WS 发送断言 / 危险命令确认弹窗（命令原文 .cmd-pad-modal-pre）/
 *      确认 → run 不带 \r / 取消 → 不运行 / 降级形态（无 better-sidebar）无运行入口（只复制）
 *
 * 运行：node test/t07-run.test.mjs
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

// ── 最小 DOM stub（同 t03/t04/t06）──
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
  if (el === null || el === undefined) return null
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

/** WebSocket stub：onopen 异步触发；failNext=true 时触发 error（模拟 WS 失败）。
 *  正常路径在 open 后回放一条含提示符 `>` 的消息（模拟宿主 transcript 回放），
 *  触发 run() 的「shell 就绪」检测立即发送；noPrompt=true 时不回放（模拟新 pty 冷启动）。 */
class WsStub {
  static instances = []
  static failNext = false
  static noPrompt = false
  constructor(url) {
    this.url = String(url)
    this.readyState = 0
    this.listeners = {}
    this.sent = []
    this.closed = false
    WsStub.instances.push(this)
    if (WsStub.failNext) {
      WsStub.failNext = false
      setTimeout(() => this.fire('error'), 0)
    } else {
      setTimeout(() => {
        this.readyState = 1
        this.fire('open')
        if (!WsStub.noPrompt) {
          this.fire('message', { data: 'Windows PowerShell\r\nPS C:\\work> ' })
        }
      }, 0)
    }
  }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn) }
  fire(t, ev) { (this.listeners[t] || []).forEach((fn) => fn(ev || {})) }
  send(d) { this.sent.push(String(d)) }
  close() {
    if (this.closed) return
    this.closed = true
    this.readyState = 3
    this.fire('close')
  }
}

/** 迷你 React 模拟器（同 t06）。 */
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
 *  - betterSidebar: false = 显式无服务（降级形态）
 *  - noNewTerminal: true = openTab 不产生新终端（模拟配额满 / 设置禁用 / createTab 被拒）
 *  - wsFail: true = WS 连接触发 error（模拟 WS 失败）
 *  - library/state/cwd: 数据覆盖
 *  - seedTabs: 预置已有终端 tab（验证新开差集识别）
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
  const openTabCalls = []
  const activateCalls = []
  const closeTabCalls = []
  const payloadRef = {
    library: JSON.parse(JSON.stringify(opts.library !== undefined ? opts.library : SAMPLE_LIBRARY)),
    state: JSON.parse(JSON.stringify(opts.state !== undefined ? opts.state : SAMPLE_STATE)),
    cwd: opts.cwd !== undefined ? opts.cwd : SAMPLE_CWD,
    mtime: 123,
  }

  const features = opts.features || []
  // 可变 snapshot：openTab 模拟往 bottomSplits 新开终端
  const snapshotState = { splits: [], bottomSplits: [], activePane: 'pane:1' }
  let termSeq = 0
  const bsStub = {
    features,
    registerTab(desc) {
      registeredTabs.push(desc)
      return function disposer() { /* host 注销 */ }
    },
    getSnapshot() { return { sessionId: 's1', state: snapshotState, prefs: {} } },
    openTab(seed, scope) {
      openTabCalls.push({ seed, scope })
      if (!opts.noNewTerminal && seed && seed.type === 'terminal') {
        termSeq++
        snapshotState.bottomSplits = [{
          id: 'pane:term',
          tabs: [{ id: 'terminal:uuid-' + termSeq, type: 'terminal', title: '终端' }],
        }]
      }
    },
    activateTab(id, scope) { activateCalls.push({ id, scope }) },
    closeTab(id, scope) { closeTabCalls.push({ id, scope }) },
  }
  if (Array.isArray(opts.seedTabs) && opts.seedTabs.length > 0) {
    snapshotState.bottomSplits = [{ id: 'pane:seed', tabs: opts.seedTabs }]
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
    WebSocket: WsStub,
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
  const sim = createSimulator()
  const moduleExports = factory((name) => {
    if (name === 'react') return sim.react
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
    openTabCalls,
    activateCalls,
    closeTabCalls,
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

/** 挂载主形态 Tab（同 t06）。 */
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

function toastText(s, host) {
  const t = find(host || s.body, '.cmd-pad-toast')
  return t === null ? '' : t.textContent
}

function lastWs() {
  return WsStub.instances.length > 0 ? WsStub.instances[WsStub.instances.length - 1] : null
}

// ════════════════════════════════════════════════════════════════════════
// R. 纯逻辑
// ════════════════════════════════════════════════════════════════════════

await check('R1 terminalTabsOf：splits+bottomSplits 叶子遍历 / agent: 排除 / 空容错', async () => {
  const t = (await bootScene({})).moduleExports.testable
  const snap = {
    state: {
      splits: [{ id: 'p1', tabs: [{ id: 'terminal:uuid-a', type: 'terminal' }, { id: 'editor:x', type: 'editor' }] }],
      bottomSplits: [
        { id: 'p2', tabs: [{ id: 'terminal:uuid-b', type: 'terminal' }] },
        { id: 'p3', tabs: [{ id: 'agent:abc', type: 'terminal' }, { id: 'terminal:uuid-c', type: 'terminal' }] },
      ],
    },
  }
  const ids = t.terminalTabsOf(snap).map((x) => x.id)
  assert.deepStrictEqual(ids, ['terminal:uuid-a', 'terminal:uuid-b', 'terminal:uuid-c'], '遍历两棵树叶子，排除 agent:')
  assert.deepStrictEqual(t.terminalTabsOf(null), [], 'null snapshot 容错')
  assert.deepStrictEqual(t.terminalTabsOf({}), [], '空 snapshot 容错')
  assert.deepStrictEqual(t.terminalTabsOf({ state: { splits: { left: { id: 'x', tabs: [{ id: 'terminal:uuid-d', type: 'terminal' }] }, right: { id: 'y', tabs: [] } } } }).map((x) => x.id),
    ['terminal:uuid-d'], '嵌套 split（left/right）遍历')
})

await check('R2 pickNewTerminalTab：差集识别新开终端 / 无新终端 null / agent 排除', async () => {
  const t = (await bootScene({})).moduleExports.testable
  const before = [{ id: 'terminal:uuid-1', type: 'terminal' }]
  const after = [{ id: 'terminal:uuid-1', type: 'terminal' }, { id: 'terminal:uuid-2', type: 'terminal' }]
  assert.strictEqual(t.pickNewTerminalTab(before, after).id, 'terminal:uuid-2', '差集取新出现的终端')
  assert.strictEqual(t.pickNewTerminalTab(after, after), null, '无新终端 → null')
  assert.strictEqual(t.pickNewTerminalTab([], [{ id: 'agent:z', type: 'terminal' }]), null, 'agent: 终端不选')
  assert.strictEqual(t.pickNewTerminalTab(undefined, null), null, '入参容错')
})

await check('R3 terminalWsUrl：sessionId/tab 编码、cwd 可选', async () => {
  const t = (await bootScene({})).moduleExports.testable
  assert.strictEqual(
    t.terminalWsUrl('s1', 'terminal:uuid-1', 'D:\\work'),
    '/sidebar/ws/terminal?sessionId=s1&tab=terminal%3Auuid-1&cwd=D%3A%5Cwork', '含 cwd')
  assert.strictEqual(
    t.terminalWsUrl('s 1', 't&x', ''),
    '/sidebar/ws/terminal?sessionId=s%201&tab=t%26x', 'cwd 空时不拼；sessionId/tab 编码')
})

await check('R4 terminalSendText：普通命令带 \\r 执行 / 危险命令不带 \\r 停在提示符', async () => {
  const t = (await bootScene({})).moduleExports.testable
  assert.strictEqual(t.terminalSendText({ cmd: 'ls -la', danger: false }), 'ls -la\r')
  assert.strictEqual(t.terminalSendText({ cmd: 'rm -rf /', danger: true }), 'rm -rf /', '危险不带 \\r')
  assert.strictEqual(t.terminalSendText({ cmd: 'echo x', danger: undefined }), 'echo x\r')
})

await check('R5 firstBottomTab：底部树任意 tab（排除 agent:）/ 空容错（调整记录 #28 强制底部栏）', async () => {
  const t = (await bootScene({})).moduleExports.testable
  assert.strictEqual(t.firstBottomTab(null), null, 'null snapshot 容错')
  assert.strictEqual(t.firstBottomTab({}), null, '空 snapshot 容错')
  assert.strictEqual(t.firstBottomTab({ state: {} }), null, '无 bottomSplits 容错')
  assert.strictEqual(t.firstBottomTab({ state: { bottomSplits: [] } }), null, '空底部树容错')
  assert.strictEqual(t.firstBottomTab({ state: { bottomSplits: [{ id: 'p', tabs: [] }] } }), null, '叶子无 tab 容错')
  const tab = { id: 'terminal:x', type: 'terminal' }
  assert.strictEqual(
    t.firstBottomTab({ state: { bottomSplits: [{ id: 'p', tabs: [{ id: 'agent:z', type: 'terminal' }, tab] }] } }).id,
    'terminal:x', '跳过 agent: 前缀')
  assert.strictEqual(
    t.firstBottomTab({ state: { bottomSplits: [{ id: 'p', tabs: [{ id: 'editor:y', type: 'editor' }] }] } }).id,
    'editor:y', '任意类型既有 tab 均可作为底部落点锚')
})

// ════════════════════════════════════════════════════════════════════════
// S. runner 流程（成功路径）
// ════════════════════════════════════════════════════════════════════════

await check('S1 runner.run 成功：openTab 新开专用终端 → 差集识别 → WS 附加发送 → bare drop', async () => {
  const s = await bootScene({ seedTabs: [{ id: 'terminal:uuid-existing', type: 'terminal' }] })
  WsStub.instances.length = 0
  WsStub.failNext = false
  const t = s.moduleExports.testable
  const toasts = []
  const copied = []
  const runner = t.createTerminalRunner(s.bsStub, () => ({ sessionId: 's1', cwd: SAMPLE_CWD }), (msg) => toasts.push(msg), (text, cb) => { copied.push(text); cb(true) })
  runner.run({ id: 'top-mem', cmd: 'hdc shell "top"', danger: false })
  await tick()
  // openTab 新开（用户决策：不复用已有终端）
  assert.strictEqual(s.openTabCalls.length, 1, 'openTab 调用一次')
  assert.strictEqual(s.openTabCalls[0].seed.type, 'terminal')
  assert.deepStrictEqual(s.openTabCalls[0].scope, { sessionId: 's1', cwd: SAMPLE_CWD }, 'scope 携带当前会话')
  // 差集识别新终端（不是既有 terminal:uuid-existing）
  const ws = lastWs()
  assert.ok(ws !== null, 'WS 已创建')
  assert.ok(ws.url.includes('terminal%3Auuid-1'), 'WS 附加到新开的终端 id（编码后）')
  assert.ok(ws.url.includes('sessionId=s1'), 'sessionId 编码')
  assert.ok(ws.url.includes('cwd=' + encodeURIComponent(SAMPLE_CWD)), 'cwd 编码')
  // 发送文本：普通命令带 \r
  assert.deepStrictEqual(ws.sent, ['hdc shell "top"\r'], '发送 命令+\r')
  // 保持连接保 pty 活（实机教训：新开专用终端无 UI 视图长连，bare drop 会
  // 在 reconnect grace 30s 到期后杀 pty，长命令/交互命令中断）；不发 close 帧
  assert.ok(!ws.closed, '发送后保持连接（不 bare drop，保 pty 活）')
  assert.ok(!ws.sent.some((x) => x.includes('"close"')), '未发 close 控制帧')
  // 成功 Toast（无复制降级）
  assert.deepStrictEqual(toasts, ['已发送到终端'], '成功 Toast')
  assert.deepStrictEqual(copied, [], '不触发复制')
})

await check('S2 危险命令 run：确认后发送不带 \\r，Toast 提示用户终端内回车', async () => {
  const s = await bootScene({})
  WsStub.instances.length = 0
  WsStub.failNext = false
  const t = s.moduleExports.testable
  const toasts = []
  const runner = t.createTerminalRunner(s.bsStub, () => ({ sessionId: 's1', cwd: SAMPLE_CWD }), (msg) => toasts.push(msg), () => {})
  runner.run({ id: 'log-clean', cmd: 'rm -rf /data/log/*', danger: true })
  await tick()
  const ws = lastWs()
  assert.ok(ws !== null, 'WS 已创建')
  assert.deepStrictEqual(ws.sent, ['rm -rf /data/log/*'], '危险命令不带 \\r')
  assert.deepStrictEqual(toasts, ['已写入终端，请在终端内确认后回车'], '危险 Toast 提示人工回车')
})

await check('S3 shell 未就绪（新 pty 冷启动）→ 等待提示符出现后才发送（防吞命令，实机教训）', async () => {
  const s = await bootScene({})
  WsStub.instances.length = 0
  WsStub.failNext = false
  WsStub.noPrompt = true
  const t = s.moduleExports.testable
  const toasts = []
  const copied = []
  const runner = t.createTerminalRunner(s.bsStub, () => ({ sessionId: 's1', cwd: SAMPLE_CWD }), (msg) => toasts.push(msg), (text, cb) => { copied.push(text); cb(true) })
  runner.run({ id: 'top-mem', cmd: 'echo x', danger: false })
  await tick()
  const ws = lastWs()
  assert.ok(ws !== null, 'WS 已创建')
  assert.deepStrictEqual(ws.sent, [], '提示符未出现前不发送（防命令被吞）')
  assert.deepStrictEqual(copied, [], '未降级')
  // 宿主随后回放提示符（PowerShell profile 加载完成）
  ws.fire('message', { data: '\r\nPS E:\\KimiProGram\\dshplugin> ' })
  await tick()
  assert.deepStrictEqual(ws.sent, ['echo x\r'], '提示符出现后立即发送')
  assert.ok(!ws.closed, '发送后保持连接（不 bare drop，保 pty 活）')
  assert.deepStrictEqual(toasts, ['已发送到终端'], '成功 Toast')
  WsStub.noPrompt = false
})

// ════════════════════════════════════════════════════════════════════════
// S+. 调整记录 #28：运行终端强制落底部栏 + 成功回调（「上次使用」记录）
// ════════════════════════════════════════════════════════════════════════

await check('S5 底部面板打开且有既有 tab → 先激活底部 tab 再 openTab（运行终端落底部栏）', async () => {
  const s = await bootScene({ seedTabs: [{ id: 'terminal:existing', type: 'terminal', title: '旧终端' }] })
  WsStub.instances.length = 0
  WsStub.failNext = false
  // 模拟底部面板打开（getSnapshot 的 state 与 snapshotState 同引用）
  s.bsStub.getSnapshot().state.bottomOpen = true
  const t = s.moduleExports.testable
  const runner = t.createTerminalRunner(s.bsStub, () => ({ sessionId: 's1', cwd: SAMPLE_CWD }), () => {}, () => {}, () => {})
  runner.run({ id: 'top-mem', cmd: 'echo x', danger: false })
  await tick()
  // 先激活底部既有 tab（把 activePane 切到底部树）→ 再 openTab → 再激活新终端
  assert.strictEqual(s.activateCalls.length, 2, '激活底部旧 tab + 激活新终端')
  assert.strictEqual(s.activateCalls[0].id, 'terminal:existing', 'openTab 前先激活底部既有 tab')
  assert.strictEqual(s.openTabCalls.length, 1, 'openTab 一次')
  assert.strictEqual(s.openTabCalls[0].seed.type, 'terminal')
  const ws = lastWs()
  assert.ok(ws !== null, 'WS 已创建（发送链路正常）')
  assert.deepStrictEqual(ws.sent, ['echo x\r'], '命令已发送')
})

await check('S6 底部面板关闭 / 无底部 tab → 不强制（降级当前行为，避免终端落在隐藏面板）', async () => {
  // bottomOpen 缺失（undefined）→ 不激活底部 tab
  const s = await bootScene({ seedTabs: [{ id: 'terminal:existing', type: 'terminal' }] })
  WsStub.instances.length = 0
  WsStub.failNext = false
  const t = s.moduleExports.testable
  const runner = t.createTerminalRunner(s.bsStub, () => ({ sessionId: 's1', cwd: SAMPLE_CWD }), () => {}, () => {}, () => {})
  runner.run({ id: 'top-mem', cmd: 'echo x', danger: false })
  await tick()
  assert.strictEqual(s.activateCalls.length, 1, 'bottomOpen 缺失 → 不强制，仅激活新终端')
  assert.strictEqual(s.activateCalls[0].id, 'terminal:uuid-1')
  // 底部面板打开但底部树无 tab → 不强制
  const s2 = await bootScene({})
  WsStub.instances.length = 0
  WsStub.failNext = false
  s2.bsStub.getSnapshot().state.bottomOpen = true
  const runner2 = t.createTerminalRunner(s2.bsStub, () => ({ sessionId: 's1', cwd: SAMPLE_CWD }), () => {}, () => {}, () => {})
  runner2.run({ id: 'top-mem', cmd: 'echo x', danger: false })
  await tick()
  assert.strictEqual(s2.activateCalls.length, 1, '底部树无 tab → 不强制，仅激活新终端')
  assert.strictEqual(s2.activateCalls[0].id, 'terminal:uuid-1')
})

await check('S7 runner 成功回调 onSuccess：运行成功即触发（「上次使用」记录接线）', async () => {
  const s = await bootScene({})
  WsStub.instances.length = 0
  WsStub.failNext = false
  const t = s.moduleExports.testable
  const successes = []
  const runner = t.createTerminalRunner(s.bsStub, () => ({ sessionId: 's1', cwd: SAMPLE_CWD }), () => {}, () => {}, (cmd) => successes.push(cmd))
  runner.run({ id: 'top-mem', cmd: 'echo x', danger: false })
  await tick()
  assert.strictEqual(successes.length, 1, '成功路径触发 onSuccess')
  assert.strictEqual(successes[0].id, 'top-mem')
  // 失败路径不触发 onSuccess（降级复制不当作「使用」）
  WsStub.instances.length = 0
  WsStub.failNext = true
  const copied = []
  const runner2 = t.createTerminalRunner(s.bsStub, () => ({ sessionId: 's1', cwd: SAMPLE_CWD }), () => {}, (text, cb) => { copied.push(text); cb(true) }, (cmd) => successes.push(cmd))
  runner2.run({ id: 'top-mem', cmd: 'echo x', danger: false })
  await tick()
  assert.strictEqual(successes.length, 1, 'WS 失败降级不触发 onSuccess')
  assert.deepStrictEqual(copied, ['echo x'], '仍走复制降级')
})

// ════════════════════════════════════════════════════════════════════════
// T. 降级链（完成定义 3：配额满 / 设置禁用 / 无终端新开被拒 → 复制 + Toast）
// ════════════════════════════════════════════════════════════════════════

await check('T1 终端配额满（openTab 无新终端）→ 复制 + Toast「已复制，到终端粘贴执行」', async () => {
  const s = await bootScene({ noNewTerminal: true })
  WsStub.instances.length = 0
  WsStub.failNext = false
  const t = s.moduleExports.testable
  const toasts = []
  const copied = []
  const runner = t.createTerminalRunner(s.bsStub, () => ({ sessionId: 's1', cwd: SAMPLE_CWD }), (msg) => toasts.push(msg), (text, cb) => { copied.push(text); cb(true) })
  runner.run({ id: 'top-mem', cmd: 'hdc shell "top"', danger: false })
  await tick()
  assert.strictEqual(s.openTabCalls.length, 1, 'openTab 尝试过')
  assert.deepStrictEqual(copied, ['hdc shell "top"'], '降级复制命令原文')
  assert.deepStrictEqual(toasts, ['已复制，到终端粘贴执行'], 'Toast 明示原因')
  assert.strictEqual(WsStub.instances.length, 0, '未创建 WS')
})

await check('T2 WS 连接失败（error）→ 复制 + Toast 降级 + 回滚刚创建的 tab（防泄漏）', async () => {
  const s = await bootScene({})
  WsStub.instances.length = 0
  WsStub.failNext = true
  const t = s.moduleExports.testable
  const toasts = []
  const copied = []
  const runner = t.createTerminalRunner(s.bsStub, () => ({ sessionId: 's1', cwd: SAMPLE_CWD }), (msg) => toasts.push(msg), (text, cb) => { copied.push(text); cb(true) })
  runner.run({ id: 'top-mem', cmd: 'hdc shell "top"', danger: false })
  await tick()
  assert.deepStrictEqual(copied, ['hdc shell "top"'], 'WS 失败 → 复制')
  assert.deepStrictEqual(toasts, ['已复制，到终端粘贴执行'], 'Toast 明示原因')
  assert.strictEqual(s.closeTabCalls.length, 1, '失败回滚新开的 tab')
  assert.strictEqual(s.closeTabCalls[0].id, 'terminal:uuid-1', '回滚的是 openTab 创建的终端')
})

await check('T4 WS 被宿主主动关闭（未发送，如 pty 配额满 attachTerminal 拒绝）→ 复制 + 回滚', async () => {
  const s = await bootScene({})
  WsStub.instances.length = 0
  WsStub.failNext = false
  WsStub.noPrompt = true
  const t = s.moduleExports.testable
  const toasts = []
  const copied = []
  const runner = t.createTerminalRunner(s.bsStub, () => ({ sessionId: 's1', cwd: SAMPLE_CWD }), (msg) => toasts.push(msg), (text, cb) => { copied.push(text); cb(true) })
  runner.run({ id: 'top-mem', cmd: 'echo x', danger: false })
  await tick()
  const ws = lastWs()
  assert.ok(ws !== null, 'WS 已创建')
  assert.deepStrictEqual(ws.sent, [], '尚未发送（等提示符）')
  // 宿主在发送前主动关闭（attachTerminal 错误路径 close(1011)）
  ws.fire('close', { code: 1011, reason: 'pty limit' })
  await tick()
  assert.deepStrictEqual(copied, ['echo x'], '宿主关闭 → 复制降级')
  assert.strictEqual(s.closeTabCalls.length, 1, '回滚刚创建的 tab（防 UI tab 泄漏）')
  assert.strictEqual(s.closeTabCalls[0].id, 'terminal:uuid-1', '回滚目标正确')
  WsStub.noPrompt = false
})

await check('T3 WebSocket 不可用（window.WebSocket 缺失）→ 复制 + Toast 降级', async () => {
  const s = await bootScene({})
  WsStub.instances.length = 0
  WsStub.failNext = false
  const t = s.moduleExports.testable
  const toasts = []
  const copied = []
  const runner = t.createTerminalRunner(s.bsStub, () => ({ sessionId: 's1', cwd: SAMPLE_CWD }), (msg) => toasts.push(msg), (text, cb) => { copied.push(text); cb(true) })
  // 临时移除 window.WebSocket
  const orig = s.window.WebSocket
  s.window.WebSocket = undefined
  runner.run({ id: 'top-mem', cmd: 'echo x', danger: false })
  await tick()
  s.window.WebSocket = orig
  assert.deepStrictEqual(copied, ['echo x'], '无 WebSocket → 复制')
  assert.deepStrictEqual(toasts, ['已复制，到终端粘贴执行'], 'Toast 明示原因')
})

// ════════════════════════════════════════════════════════════════════════
// U. DOM 交互
// ════════════════════════════════════════════════════════════════════════

await check('U1 主形态卡片渲染「运行」按钮（复制前）；降级形态无运行按钮（只复制，用户决策）', async () => {
  const s = await bootScene({})
  const { host } = mountTab(s, { scope: { sessionId: 's1', cwd: SAMPLE_CWD } })
  await tick()
  const runBtn = find(host, '[data-run-cmd]')
  assert.ok(runBtn !== null, '主形态卡片有运行按钮')
  assert.strictEqual(runBtn.textContent, '运行')
  // 降级形态（无 better-sidebar）
  const s2 = await bootScene({ betterSidebar: false })
  assert.ok(s2.registeredTabs.length === 0, '降级不注册 Tab')
  // 降级：浮动图标 + 抽屉
  const fab = find(s2.body, '.cmd-pad-fab')
  assert.ok(fab !== null, '降级浮动图标在场')
  fab.listeners.click.forEach((fn) => fn()) // 打开抽屉
  await tick() // 等待数据加载渲染卡片
  const content = find(s2.body, '.cmd-pad-content')
  assert.ok(content !== null, '抽屉内容区在场')
  assert.strictEqual(find(content, '[data-run-cmd]'), null, '降级形态无运行按钮')
  const copyBtn = find(content, '[data-copy-cmd]')
  assert.ok(copyBtn !== null, '降级形态仍有复制')
})

await check('U2 主形态右键菜单：首位「运行」（设计文档 §4.1）；降级形态无「运行」项', async () => {
  const s = await bootScene({})
  const { host } = mountTab(s, { scope: { sessionId: 's1', cwd: SAMPLE_CWD } })
  await tick()
  const content = find(host, '.cmd-pad-content')
  const card = findAttr(content, 'data-cmd-id', 'top-mem')
  content.listeners.contextmenu.forEach((fn) => fn({ target: card, clientX: 100, clientY: 100, preventDefault() {} }))
  const items = collect(s.body, '.cmd-pad-menu-item', [])
  const labels = items.map((e) => e.textContent)
  assert.deepStrictEqual(labels, ['运行', '复制', '编辑', '删除'], '运行在首位')
  // 降级形态
  const s2 = await bootScene({ betterSidebar: false })
  const fab = find(s2.body, '.cmd-pad-fab')
  fab.listeners.click.forEach((fn) => fn())
  await tick()
  const content2 = find(s2.body, '.cmd-pad-content')
  const card2 = findAttr(content2, 'data-cmd-id', 'top-mem')
  content2.listeners.contextmenu.forEach((fn) => fn({ target: card2, clientX: 100, clientY: 100, preventDefault() {} }))
  const items2 = collect(s2.body, '.cmd-pad-menu-item', [])
  const labels2 = items2.map((e) => e.textContent)
  assert.deepStrictEqual(labels2, ['复制', '编辑', '删除'], '降级右键无运行')
})

await check('U3 点击「运行」（普通命令）→ runner.run 全链路（WS 发送 命令+\\r，Toast 已发送到终端）', async () => {
  const s = await bootScene({})
  WsStub.instances.length = 0
  WsStub.failNext = false
  const { host } = mountTab(s, { scope: { sessionId: 's1', cwd: SAMPLE_CWD } })
  await tick()
  const content = find(host, '.cmd-pad-content')
  const runBtn = find(content, '[data-run-cmd]')
  assert.ok(runBtn !== null, '运行按钮在场')
  content.listeners.click.forEach((fn) => fn({ target: runBtn }))
  await tick()
  const ws = lastWs()
  assert.ok(ws !== null, 'WS 已创建（运行点击生效）')
  assert.deepStrictEqual(ws.sent, ['hdc shell "top -n 1 | head -30"\r'], '发送命令原文+\r')
  assert.strictEqual(toastText(s, host), '已发送到终端', '成功 Toast')
  assert.strictEqual(find(host, '.cmd-pad-modal'), null, '普通命令无确认弹窗')
})

await check('U4 点击「运行」（危险命令）→ 确认弹窗（命令原文）→ 确认后发送不带 \\r', async () => {
  const s = await bootScene({})
  WsStub.instances.length = 0
  WsStub.failNext = false
  const { host } = mountTab(s, { scope: { sessionId: 's1', cwd: SAMPLE_CWD } })
  await tick()
  const content = find(host, '.cmd-pad-content')
  // 切到未分组/全部视图找 log-clean（danger）：初始视图 = perf → 只有 top-mem；搜 log-clean
  const searchInput = find(host, '.cmd-pad-search-input')
  searchInput.value = 'log'
  searchInput.listeners.input.forEach((fn) => fn())
  const runBtn = find(content, '[data-run-cmd]')
  assert.ok(runBtn !== null, '危险卡片有运行按钮')
  content.listeners.click.forEach((fn) => fn({ target: runBtn }))
  await tick()
  // 确认弹窗：命令原文块 + 危险按钮
  const pre = find(s.body, '.cmd-pad-modal-pre')
  assert.ok(pre !== null, '危险确认弹窗命令原文块在场')
  assert.strictEqual(pre.textContent, 'rm -rf /data/log/*', '命令原文精确展示')
  const okBtn = collect(s.body, '.cmd-pad-btn-danger', [])[0]
  assert.ok(okBtn !== null, '危险确认按钮在场')
  okBtn.listeners.click.forEach((fn) => fn())
  await tick()
  const ws = lastWs()
  assert.ok(ws !== null, '确认后 WS 创建')
  assert.deepStrictEqual(ws.sent, ['rm -rf /data/log/*'], '危险命令不带 \\r（双人工确认）')
  assert.strictEqual(find(s.body, '.cmd-pad-modal'), null, '确认后弹窗关闭')
})

await check('U5 危险确认弹窗「取消」→ 不运行（无 WS、无复制）', async () => {
  const s = await bootScene({})
  WsStub.instances.length = 0
  WsStub.failNext = false
  const { host } = mountTab(s, { scope: { sessionId: 's1', cwd: SAMPLE_CWD } })
  await tick()
  const content = find(host, '.cmd-pad-content')
  const searchInput = find(host, '.cmd-pad-search-input')
  searchInput.value = 'log'
  searchInput.listeners.input.forEach((fn) => fn())
  const runBtn = find(content, '[data-run-cmd]')
  content.listeners.click.forEach((fn) => fn({ target: runBtn }))
  await tick()
  assert.ok(find(s.body, '.cmd-pad-modal-pre') !== null, '弹窗出现')
  const cancelBtn = collect(s.body, '.cmd-pad-btn', []).find((e) => !e.className.includes('danger'))
  assert.ok(cancelBtn !== null, '取消按钮在场')
  cancelBtn.listeners.click.forEach((fn) => fn())
  await tick()
  assert.strictEqual(find(s.body, '.cmd-pad-modal'), null, '取消后弹窗关闭')
  assert.strictEqual(WsStub.instances.length, 0, '未创建 WS')
  assert.deepStrictEqual(s.clipboardTexts, [], '未复制')
})

await check('U6 主形态危险命令在弹窗阶段 Esc 可关闭（Esc 链：弹层优先）', async () => {
  const s = await bootScene({})
  WsStub.instances.length = 0
  WsStub.failNext = false
  const { host } = mountTab(s, { scope: { sessionId: 's1', cwd: SAMPLE_CWD } })
  await tick()
  const content = find(host, '.cmd-pad-content')
  const searchInput = find(host, '.cmd-pad-search-input')
  searchInput.value = 'log'
  searchInput.listeners.input.forEach((fn) => fn())
  const runBtn = find(content, '[data-run-cmd]')
  content.listeners.click.forEach((fn) => fn({ target: runBtn }))
  await tick()
  assert.ok(find(s.body, '.cmd-pad-modal') !== null, '弹窗出现')
  s.documentEvents.keydown.forEach((fn) => fn({ key: 'Escape', preventDefault() {} }))
  assert.strictEqual(find(s.body, '.cmd-pad-modal'), null, 'Esc 关闭确认弹窗')
  assert.strictEqual(WsStub.instances.length, 0, '未运行')
})

console.log(`\n===== ${passed} passed, ${failed} failed =====`)
process.exit(failed === 0 ? 0 : 1)
