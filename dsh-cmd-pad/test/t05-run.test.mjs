/**
 * T05 验收 harness：运行（对话输入框通道）+ 危险确认（v0.1 闭环）
 *
 * 覆盖（对照 TASK.md T05 完成定义 + 功能文档 §4.2/§4.3）：
 *   R. 纯逻辑：writeComposerDraft 探测链（sessions/conversation/scope/setDraft
 *      缺失各分支、成功替换式写入、抛错静默）+
 *      resolveSessionScope / resolveConversationInput 的 ctx.get → ctx 直读回退
 *   S. DOM 渲染与交互：卡片「运行」按钮 / 点运行写输入框（原文、不自动发送、
 *      Toast、lastUsed 刷新）/ 危险命令确认弹窗（完整命令原文）·取消不写·确认写 /
 *      conversation 缺失降级复制 + Toast 明示 / 剪贴板也失败报错 /
 *      右键菜单运行路径 / 完成定义 4：浏览·搜索·切换分组不触发执行 /
 *      Toast 锚定运行按钮左侧
 *
 * 运行：node test/t05-run.test.mjs
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
      let width = base.width
      if (this.style && typeof this.style.width === 'string') {
        const m = /^(-?[\d.]+)px$/.exec(this.style.width)
        if (m) width = Number(m[1])
      }
      return { ...base, width, right: base.left + width }
    },
    setRect(l, t, w, h) {
      this._rect = { width: w, height: t ? h : h, top: t, left: l, right: l + w, bottom: t + h }
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

function findAttr(el, attr, value) {
  if (el.getAttribute && el.getAttribute(attr) === value) return el
  if (!el.children) return null
  for (const c of el.children) {
    const r = findAttr(c, attr, value)
    if (r !== null) return r
  }
  return null
}

function findAllAttr(el, attr, value, acc) {
  if (el.getAttribute && (value === undefined ? el.getAttribute(attr) !== null : el.getAttribute(attr) === value)) acc.push(el)
  if (!el.children) return acc
  for (const c of el.children) findAllAttr(c, attr, value, acc)
  return acc
}

function memoryStorage(initial) {
  const map = new Map(Object.entries(initial || {}))
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null },
    setItem(k, v) { map.set(k, String(v)) },
    removeItem(k) { map.delete(k) },
  }
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

async function tick() {
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
}

/**
 * 构建场景：执行 client.js → apply → 打开抽屉 → 等待数据加载。
 * opts：
 *  - noSessions: 不提供 sessions 服务（ctx.get('sessions') → undefined）
 *  - noConversation: 不提供 conversation 服务（ctx.get('conversation') → undefined）
 *  - clipboardFail: navigator.clipboard 缺失且 execCommand 返回 false
 *  - library/state/cwd: 数据覆盖
 * 返回对象含 draftWrites（setDraft 调用记录）与全套 DOM 句柄。
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
  const draftWrites = []
  const payloadRef = {
    library: JSON.parse(JSON.stringify(opts.library !== undefined ? opts.library : SAMPLE_LIBRARY)),
    state: JSON.parse(JSON.stringify(opts.state !== undefined ? opts.state : SAMPLE_STATE)),
    cwd: opts.cwd !== undefined ? opts.cwd : SAMPLE_CWD,
    mtime: 123,
  }

  // 会话服务 + 对话服务（契约对齐 better-sidebar conversation-draft.ts）
  const sessionScope = { __scopeOf: 'session-1' }
  const sessionsSvc = {
    list: { getSnapshot() { return { current: 'session-1' } } },
    scope(id) { return id === 'session-1' ? sessionScope : undefined },
  }
  const inputStore = {
    state: { getSnapshot() { return { draft: '' } } },
    setDraft(text) { draftWrites.push(String(text)) },
  }
  const conversationSvc = {
    input: {
      for(actx) { return actx === sessionScope ? inputStore : undefined },
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
    navigator: opts.clipboardFail
      ? {}
      : { clipboard: { writeText(t) { clipboardTexts.push(String(t)); return Promise.resolve() } } },
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
  const moduleExports = factory(() => { throw new Error('require should not be used') })
  let disposer = null
  const ctx = {
    effect(fn) {
      const d = fn()
      if (typeof d === 'function') disposer = d
      return d
    },
    get(name) {
      if (name === 'sessions') return opts.noSessions ? undefined : sessionsSvc
      if (name === 'conversation') return opts.noConversation ? undefined : conversationSvc
      return undefined
    },
  }
  moduleExports.apply(ctx)
  const drawer = find(body, '.cmd-pad-drawer')
  drawer.setRect(0, 0, 360, 720)
  const s = {
    body,
    drawer,
    fab: find(body, '.cmd-pad-fab'),
    groupsEl: find(drawer, '.cmd-pad-groups'),
    contentEl: find(drawer, '.cmd-pad-content'),
    searchInput: find(drawer, '.cmd-pad-search-input'),
    documentEvents,
    windowEvents,
    window: windowStub,
    storage: windowStub.localStorage,
    fetchCalls,
    statePuts,
    libraryPuts,
    clipboardTexts,
    draftWrites,
    moduleExports,
    payloadRef,
    sessionScope,
    inputStore,
    dispose: () => { if (typeof disposer === 'function') disposer() },
  }
  s.fab.listeners.click.forEach((fn) => fn())
  await tick()
  return s
}

// ── 交互辅助 ──

function clickGroup(s, viewId) {
  let row = findAttr(s.groupsEl, 'data-view-id', viewId)
  if (row === null) {
    const more = find(s.groupsEl, '.cmd-pad-more-toggle')
    if (more !== null) {
      s.groupsEl.listeners.click.forEach((fn) => fn({ target: more }))
      row = findAttr(s.groupsEl, 'data-view-id', viewId)
    }
  }
  assert.ok(row !== null, `分组行 data-view-id=${viewId} 应存在`)
  s.groupsEl.listeners.click.forEach((fn) => fn({ target: row }))
}

function clickRun(s, cmdId) {
  const card = findAttr(s.contentEl, 'data-cmd-id', cmdId)
  assert.ok(card !== null, `卡片 ${cmdId} 应存在`)
  const runBtn = findAttr(card, 'data-run-cmd', '')
  assert.ok(runBtn !== null, `卡片 ${cmdId} 应有运行按钮`)
  s.contentEl.listeners.click.forEach((fn) => fn({ target: runBtn }))
}

function openCardMenu(s, cmdId) {
  const card = findAttr(s.contentEl, 'data-cmd-id', cmdId)
  assert.ok(card !== null, `卡片 ${cmdId} 应存在`)
  s.contentEl.listeners.contextmenu.forEach((fn) => fn({ target: card, clientX: 100, clientY: 100, preventDefault() {} }))
}

function clickMenu(s, label) {
  const menu = find(s.body, '.cmd-pad-menu')
  assert.ok(menu !== null, '右键菜单应打开')
  const item = collect(menu, 'button', []).find((b) => b.textContent === label)
  assert.ok(item !== undefined, `菜单项「${label}」应存在`)
  item.listeners.click.forEach((fn) => fn())
}

function modalEl(s) {
  return find(s.body, '.cmd-pad-modal')
}

function clickModalButton(s, label) {
  const modal = modalEl(s)
  const btns = collect(modal, 'button', []).filter((b) => b.textContent === label)
  assert.ok(btns.length > 0, `弹窗按钮「${label}」应存在`)
  btns[0].listeners.click.forEach((fn) => fn())
}

function toastEl(s) {
  return find(s.body, '.cmd-pad-toast')
}

// ════════════════════════════════════════════════════════════════════════
// R. 纯逻辑（testable）
// ════════════════════════════════════════════════════════════════════════

const testableOf = async (opts) => (await bootScene(opts)).moduleExports.testable

await check('R1 writeComposerDraft：探测链各分支（缺失 → false，不抛错）', async () => {
  const t = await testableOf({})
  const mkCtx = (over) => Object.assign({
    sessions: { scope: () => ({}) },
    conversation: { input: { for: () => ({ setDraft() {} }) } },
    get(name) {
      if (name === 'sessions') return this.sessions
      if (name === 'conversation') return this.conversation
      return undefined
    },
  }, over)
  // ctx.get 缺失
  assert.strictEqual(t.writeComposerDraft({}, 's1', 'ls'), false)
  // sessions 缺失
  assert.strictEqual(t.writeComposerDraft(mkCtx({ sessions: undefined }), 's1', 'ls'), false)
  // sessions.scope 缺失
  assert.strictEqual(t.writeComposerDraft(mkCtx({ sessions: {} }), 's1', 'ls'), false)
  // scope 返回 undefined
  assert.strictEqual(t.writeComposerDraft(mkCtx({ sessions: { scope: () => undefined } }), 's1', 'ls'), false)
  // conversation 缺失
  assert.strictEqual(t.writeComposerDraft(mkCtx({ conversation: undefined }), 's1', 'ls'), false)
  // conversation.input 缺失
  assert.strictEqual(t.writeComposerDraft(mkCtx({ conversation: {} }), 's1', 'ls'), false)
  // input.setDraft 缺失
  assert.strictEqual(t.writeComposerDraft(mkCtx({ conversation: { input: { for: () => ({}) } } }), 's1', 'ls'), false)
  // sessionId 为空
  assert.strictEqual(t.writeComposerDraft(mkCtx({}), '', 'ls'), false)
})

await check('R2 writeComposerDraft：成功替换式写入原文，返回 true', async () => {
  const t = await testableOf({})
  const writes = []
  const actx = { tag: 'scope' }
  const ctx = {
    sessions: { scope: (id) => (id === 's1' ? actx : undefined) },
    conversation: { input: { for: (a) => (a === actx ? { setDraft(txt) { writes.push(String(txt)) } } : undefined) } },
    get(name) {
      if (name === 'sessions') return this.sessions
      if (name === 'conversation') return this.conversation
      return undefined
    },
  }
  const text = 'hdc shell "top -n 1 | head -30" && echo 多行'
  assert.strictEqual(t.writeComposerDraft(ctx, 's1', text), true)
  assert.deepStrictEqual(writes, [text], 'setDraft 收到命令原文（替换式，一字不改）')
})

await check('R3 writeComposerDraft：setDraft 抛错 → 静默 false（不 crash）', async () => {
  const t = await testableOf({})
  const actx = { tag: 'scope' }
  const ctx = {
    sessions: { scope: () => actx },
    conversation: { input: { for: () => ({ setDraft() { throw new Error('boom') } }) } },
    get(name) {
      if (name === 'sessions') return this.sessions
      if (name === 'conversation') return this.conversation
      return undefined
    },
  }
  const origWarn = console.warn
  console.warn = () => {} // 静默预期的 warn（写入失败日志）
  try {
    assert.strictEqual(t.writeComposerDraft(ctx, 's1', 'ls'), false)
  } finally {
    console.warn = origWarn
  }
})

await check('R4 resolve 回退：ctx.get 缺失时直读 ctx.sessions / ctx.conversation', async () => {
  const t = await testableOf({})
  const actx = { tag: 'scope' }
  const ctx = {
    sessions: { scope: (id) => (id === 's1' ? actx : undefined) },
    conversation: { input: { for: (a) => (a === actx ? { setDraft() {} } : undefined) } },
    // 无 get 方法 → 走直读回退
  }
  assert.strictEqual(t.resolveSessionScope(ctx, 's1'), actx)
  assert.ok(t.resolveConversationInput(ctx, actx) !== undefined)
  assert.strictEqual(t.writeComposerDraft(ctx, 's1', 'ls'), true)
})

// ════════════════════════════════════════════════════════════════════════
// S. DOM 渲染与交互
// ════════════════════════════════════════════════════════════════════════

await check('S1 卡片操作行含「运行」按钮（data-run-cmd）', async () => {
  const s = await bootScene({})
  clickGroup(s, 'all')
  const cards = findAllAttr(s.contentEl, 'data-cmd-id', undefined, [])
  assert.ok(cards.length >= 3, '全部视图应有命令卡片')
  for (const card of cards) {
    const runBtn = findAttr(card, 'data-run-cmd', '')
    assert.ok(runBtn !== null, `卡片 ${card.getAttribute('data-cmd-id')} 应有运行按钮`)
    assert.strictEqual(runBtn.textContent, '运行')
    // 复制按钮仍在操作行首位（t03 断言 actions.children[0] 为复制）
    const actions = card.children.find((c) => c.className === 'cmd-pad-card-actions')
    assert.strictEqual(actions.children[0].textContent, '复制')
  }
})

await check('S2 点运行（非危险）→ setDraft 写入命令原文、不自动发送、Toast + lastUsed 刷新', async () => {
  const s = await bootScene({})
  // 初始视图 = 上次使用 group:perf
  clickRun(s, 'top-mem')
  await tick()
  assert.deepStrictEqual(s.draftWrites, ['hdc shell "top -n 1 | head -30"'], '输入框内容 = 命令原文')
  assert.strictEqual(s.draftWrites.length, 1, '只写一次（不自动发送）')
  assert.strictEqual(toastEl(s).textContent, '已写入输入框，回车执行')
  // lastUsed 刷新（§3.4）：perf 视图语境 → group:perf
  const put = s.statePuts[s.statePuts.length - 1]
  assert.strictEqual(put.lastUsedViewId, 'group:perf')
  assert.ok(put.viewLastUsedAt['group:perf'] > 500, 'viewLastUsedAt 已更新')
})

await check('S3 「全部」视图语境运行 → lastUsed 指向第一个所属分组', async () => {
  const s = await bootScene({})
  clickGroup(s, 'all')
  clickRun(s, 'top-mem') // groups: perf, common
  await tick()
  const put = s.statePuts[s.statePuts.length - 1]
  assert.strictEqual(put.lastUsedViewId, 'group:perf', 'all 视图 → 第一个所属分组')
})

await check('S4 危险命令点运行 → 确认弹窗（完整命令原文）→ 取消不写、确认才写', async () => {
  const s = await bootScene({})
  clickGroup(s, 'group:logs')
  clickRun(s, 'log-clean')
  const modal = modalEl(s)
  assert.ok(modal !== null, '危险命令必须弹确认弹窗')
  assert.strictEqual(find(modal, '.cmd-pad-modal-title').textContent, '运行危险命令')
  const pre = find(modal, '.cmd-pad-modal-pre')
  assert.ok(pre !== null, '弹窗应含命令原文块')
  assert.strictEqual(pre.textContent, 'rm -rf /data/log/*', '完整命令原文一字不改')
  const okBtn = collect(modal, 'button', []).find((b) => b.textContent === '运行')
  assert.strictEqual(okBtn.getAttribute('data-danger') !== undefined || okBtn.className.includes('danger'), true, '确认按钮为危险样式')
  // 取消 → 不写入
  clickModalButton(s, '取消')
  await tick()
  assert.strictEqual(s.draftWrites.length, 0, '取消后不写入输入框')
  assert.deepStrictEqual(s.clipboardTexts, [], '取消后也不复制')
  // 再运行 → 确认 → 写入
  clickRun(s, 'log-clean')
  clickModalButton(s, '运行')
  await tick()
  assert.deepStrictEqual(s.draftWrites, ['rm -rf /data/log/*'], '确认后命令原文入输入框')
  assert.strictEqual(toastEl(s).textContent, '已写入输入框，回车执行')
})

await check('S5 conversation 服务缺失 → 降级复制 + Toast 明示', async () => {
  const s = await bootScene({ noConversation: true })
  clickRun(s, 'top-mem')
  await tick()
  assert.deepStrictEqual(s.draftWrites, [], '无 conversation 服务不写输入框')
  assert.deepStrictEqual(s.clipboardTexts, ['hdc shell "top -n 1 | head -30"'], '降级复制原文')
  assert.strictEqual(toastEl(s).textContent, '运行通道不可用，已复制到剪贴板')
  // lastUsed 仍按 §3.4 刷新（运行语义）
  const put = s.statePuts[s.statePuts.length - 1]
  assert.strictEqual(put.lastUsedViewId, 'group:perf')
})

await check('S6 conversation 缺失且剪贴板失败 → Toast「运行通道不可用，复制失败」error', async () => {
  const s = await bootScene({ noConversation: true, clipboardFail: true })
  clickRun(s, 'top-mem')
  await tick()
  assert.strictEqual(s.draftWrites.length, 0)
  assert.strictEqual(s.clipboardTexts.length, 0)
  const toast = toastEl(s)
  assert.strictEqual(toast.textContent, '运行通道不可用，复制失败')
  assert.strictEqual(toast.getAttribute('data-kind'), 'error')
})

await check('S7 右键菜单「运行」路径同样生效（含危险确认）', async () => {
  const s = await bootScene({})
  openCardMenu(s, 'top-mem')
  const items = collect(find(s.body, '.cmd-pad-menu'), 'button', []).map((b) => b.textContent)
  assert.deepStrictEqual(items, ['运行', '复制', '编辑', '删除'])
  clickMenu(s, '运行')
  await tick()
  assert.deepStrictEqual(s.draftWrites, ['hdc shell "top -n 1 | head -30"'], '菜单运行写入输入框')
  // 危险命令经菜单运行 → 弹窗（切到 logs 视图使 log-clean 可见）
  clickGroup(s, 'group:logs')
  openCardMenu(s, 'log-clean')
  clickMenu(s, '运行')
  assert.ok(modalEl(s) !== null, '危险命令菜单运行也需确认')
})

await check('S8 完成定义 4：浏览/搜索/切换分组/开合抽屉等非点击行为不触发执行', async () => {
  const s = await bootScene({})
  // 搜索输入
  s.searchInput.value = 'top'
  s.searchInput.listeners.input.forEach((fn) => fn())
  // 切换分组 / 视图（ungrouped 不存在于样例库，用存在的视图）
  clickGroup(s, 'all')
  clickGroup(s, 'current-project')
  clickGroup(s, 'group:common')
  clickGroup(s, 'group:logs')
  clickGroup(s, 'group:perf')
  // 展开更多
  const more = find(s.groupsEl, '.cmd-pad-more-toggle')
  if (more !== null) s.groupsEl.listeners.click.forEach((fn) => fn({ target: more }))
  // 关闭再打开抽屉
  s.fab.listeners.click.forEach((fn) => fn())
  await tick()
  s.fab.listeners.click.forEach((fn) => fn())
  await tick()
  assert.strictEqual(s.draftWrites.length, 0, '任何非点击行为都不写输入框')
  assert.strictEqual(s.clipboardTexts.length, 0, '任何非点击行为都不复制')
  // 最后真实点击运行才触发
  clickRun(s, 'top-mem')
  await tick()
  assert.strictEqual(s.draftWrites.length, 1, '仅点击运行触发执行')
})

await check('S9 运行 Toast 锚定到运行按钮左侧（inline left + right auto）', async () => {
  const s = await bootScene({})
  const card = findAttr(s.contentEl, 'data-cmd-id', 'top-mem')
  const runBtn = findAttr(card, 'data-run-cmd', '')
  s.contentEl.listeners.click.forEach((fn) => fn({ target: runBtn }))
  await tick()
  const toast = toastEl(s)
  assert.ok(/^\d+px$/.test(toast.style.left), `toast left 为 px: ${toast.style.left}`)
  assert.strictEqual(toast.style.right, 'auto')
  assert.strictEqual(toast.style.bottom, 'auto')
})

await check('S10 危险命令确认后运行 → lastUsed 同步刷新', async () => {
  const s = await bootScene({})
  clickGroup(s, 'group:logs')
  clickRun(s, 'log-clean')
  clickModalButton(s, '运行')
  await tick()
  const put = s.statePuts[s.statePuts.length - 1]
  assert.strictEqual(put.lastUsedViewId, 'group:logs', '危险命令运行同样刷新 lastUsed')
})

console.log(`\n===== ${passed} passed, ${failed} failed =====`)
process.exit(failed > 0 ? 1 : 0)
