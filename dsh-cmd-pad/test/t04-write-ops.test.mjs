/**
 * T04 验收 harness：写操作（F6/F7/F8）——添加/编辑/删除/重命名/常驻 + 撤销
 *
 * 覆盖（对照 TASK.md T04 完成定义 + 设计文档 §3.3/§3.5/§4.3）：
 *   D. 纯逻辑：id 生成 / 危险关键词 / 默认勾选规则 / 删除计划（解关联 vs 彻底删除）/
 *      分组删除影响 / 重命名级联与冲突 / 常驻切换
 *   E. DOM 渲染与交互：+ 添加入口 / 表单弹窗（默认勾选·新建分组·危险提示）/
 *      保存 PUT / 编辑预填 / 右键菜单 / 删除（静默解关联·确认彻底删除）/
 *      5s 撤销 / 分组删除影响确认 / 重命名 / 常驻切换 / 常驻无命令也显示 /
 *      连续 20+ 次增删改 yml 始终合法 / 手改 yml 重开自动生效
 *
 * 运行：node test/t04-write-ops.test.mjs
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

// ── 最小 DOM stub（同 t03，含 input/textarea/focus）──
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
    { id: 'proj-run', title: '跑测试', cmd: 'npm test', groups: ['D:\\work\\car_media'] },
    { id: 'proj-build', title: '构建', cmd: 'npm run build', groups: ['D:\\work\\car_media', 'common'] },
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

/** 构建场景：执行 client.js → apply → 打开抽屉 → 等待数据加载。 */
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
  const payloadRef = {
    library: JSON.parse(JSON.stringify(opts.library !== undefined ? opts.library : SAMPLE_LIBRARY)),
    state: JSON.parse(JSON.stringify(opts.state !== undefined ? opts.state : SAMPLE_STATE)),
    cwd: opts.cwd !== undefined ? opts.cwd : SAMPLE_CWD,
    mtime: 123,
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
  const moduleExports = factory(() => { throw new Error('require should not be used') })
  let disposer = null
  const ctx = {
    effect(fn) {
      const d = fn()
      if (typeof d === 'function') disposer = d
      return d
    },
    get() { return undefined },
  }
  moduleExports.apply(ctx)
  const drawer = find(body, '.cmd-pad-drawer')
  drawer.setRect(0, 0, 360, 720)
  const s = {
    body,
    drawer,
    fab: find(body, '.cmd-pad-fab'),
    addCmdBtn: find(drawer, '.cmd-pad-addcmd'),
    groupAddBtn: find(drawer, '.cmd-pad-group-add'),
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
    moduleExports,
    payloadRef,
    dispose: () => { if (typeof disposer === 'function') disposer() },
  }
  s.fab.listeners.click.forEach((fn) => fn())
  await tick()
  // ＋ 新建分组按钮由 renderGroups 在数据加载后挂进分组条（渲染依赖），须在 tick 后取
  s.groupAddBtn = find(drawer, '.cmd-pad-group-add')
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

function openAdd(s) {
  s.addCmdBtn.listeners.click.forEach((fn) => fn())
}

function openAddGroup(s) {
  s.groupAddBtn.listeners.click.forEach((fn) => fn())
}

function modalEl(s) {
  return find(s.body, '.cmd-pad-modal')
}

function modalInputs(s) {
  const modal = modalEl(s)
  const inputs = {}
  for (const tag of ['input', 'textarea']) {
    collect(modal, tag, []).forEach((el) => {
      const label = el.parentNode && el.parentNode.children[0]
      const key = label && label.className === 'cmd-pad-form-label' ? label.textContent : el.placeholder || tag
      inputs[key] = el
    })
  }
  return inputs
}

function fillForm(s, fields) {
  const inputs = modalInputs(s)
  for (const [label, value] of Object.entries(fields)) {
    const el = inputs[label]
    assert.ok(el !== undefined, `表单字段「${label}」应存在`)
    el.value = value
    if (el.listeners.input) el.listeners.input.forEach((fn) => fn())
  }
}

function clickModalButton(s, label) {
  const modal = modalEl(s)
  const btns = collect(modal, 'button', []).filter((b) => b.textContent === label)
  assert.ok(btns.length > 0, `弹窗按钮「${label}」应存在`)
  btns[0].listeners.click.forEach((fn) => fn())
}

function toggleGroupCheck(s, name) {
  const modal = modalEl(s)
  const row = findAttr(modal, 'data-group', name)
  assert.ok(row !== null, `分组勾选行「${name}」应存在`)
  row.listeners.click.forEach((fn) => fn())
}

function openCardMenu(s, cmdId) {
  const card = findAttr(s.contentEl, 'data-cmd-id', cmdId)
  assert.ok(card !== null, `卡片 ${cmdId} 应存在`)
  s.contentEl.listeners.contextmenu.forEach((fn) => fn({ target: card, clientX: 100, clientY: 100, preventDefault() {} }))
}

function openGroupMenu(s, viewId) {
  let row = findAttr(s.groupsEl, 'data-view-id', viewId)
  if (row === null) {
    const more = find(s.groupsEl, '.cmd-pad-more-toggle')
    if (more !== null) {
      s.groupsEl.listeners.click.forEach((fn) => fn({ target: more }))
      row = findAttr(s.groupsEl, 'data-view-id', viewId)
    }
  }
  assert.ok(row !== null, `分组行 ${viewId} 应存在`)
  s.groupsEl.listeners.contextmenu.forEach((fn) => fn({ target: row, clientX: 100, clientY: 100, preventDefault() {} }))
}

function clickMenu(s, label) {
  const menu = find(s.body, '.cmd-pad-menu')
  assert.ok(menu !== null, '右键菜单应打开')
  const item = collect(menu, 'button', []).find((b) => b.textContent === label)
  assert.ok(item !== undefined, `菜单项「${label}」应存在`)
  item.listeners.click.forEach((fn) => fn())
}

function cardIds(s) {
  return findAllAttr(s.contentEl, 'data-cmd-id', undefined, []).map((c) => c.getAttribute('data-cmd-id'))
}

function lastLibraryPut(s) {
  assert.ok(s.libraryPuts.length > 0, '应有 library PUT')
  return s.libraryPuts[s.libraryPuts.length - 1].library
}

function pressEsc(s) {
  s.documentEvents.keydown.forEach((fn) => fn({ key: 'Escape', preventDefault() {} }))
}

function assertLibraryValid(library) {
  assert.ok(Array.isArray(library.commands), 'commands 必须是数组')
  for (const c of library.commands) {
    assert.ok(typeof c.id === 'string' && c.id !== '', `id 非空: ${JSON.stringify(c)}`)
    assert.ok(typeof c.title === 'string' && c.title !== '', `title 非空: ${c.id}`)
    assert.ok(typeof c.cmd === 'string' && c.cmd !== '', `cmd 非空: ${c.id}`)
    assert.ok(Array.isArray(c.groups), `groups 为数组: ${c.id}`)
    assert.ok(c.groups.every((g) => typeof g === 'string' && g !== ''), `groups 元素非空: ${c.id}`)
  }
}

// ════════════════════════════════════════════════════════════════════════
// D. 纯逻辑（testable）
// ════════════════════════════════════════════════════════════════════════

const testableOf = async (opts) => (await bootScene(opts)).moduleExports.testable

await check('D1 generateCommandId：slug + 随机后缀，空标题兜底', async () => {
  const t = await testableOf({})
  const id = t.generateCommandId('查看 整机 内存!')
  assert.ok(/^[a-z0-9\u4e00-\u9fa5-]+$/.test(id), `id 为安全字符: ${id}`)
  assert.ok(id.startsWith('查看-整机-内存-'), `slug 前缀: ${id}`)
  const fallback = t.generateCommandId('')
  assert.ok(fallback.startsWith('cmd-'), `空标题兜底: ${fallback}`)
  assert.notStrictEqual(t.generateCommandId('a'), t.generateCommandId('a'), '随机后缀不重复')
})

await check('D2 dangerKeywordHits：rm/del/format 等命中；词边界避免误报；大小写不敏感', async () => {
  const t = await testableOf({})
  assert.deepStrictEqual(t.dangerKeywordHits('rm -rf /data'), ['rm'])
  assert.deepStrictEqual(t.dangerKeywordHits('echo hi'), [])
  assert.deepStrictEqual(t.dangerKeywordHits('FORMAT C:'), ['format']) // format 内含 rm 不误报
  assert.deepStrictEqual(t.dangerKeywordHits('echo rm 或 warm 测试'), ['rm']) // 独立词命中，warm 不命中
  assert.ok(t.dangerKeywordHits('rd /s /q C:\\x').includes('rd /s'))
})

await check('D3 defaultCheckedGroups：视图语境默认勾选规则（§3.5）', async () => {
  const t = await testableOf({})
  const model = t.buildGroupModel(SAMPLE_LIBRARY, SAMPLE_STATE, SAMPLE_CWD)
  // group:<x> 视图 → [x]（不常驻也默认勾选）
  assert.deepStrictEqual(t.defaultCheckedGroups('group:logs', model, SAMPLE_STATE, SAMPLE_CWD), ['logs'])
  // current-project → [cwd]
  assert.deepStrictEqual(t.defaultCheckedGroups('current-project', model, SAMPLE_STATE, SAMPLE_CWD), [SAMPLE_CWD])
  // ungrouped → []
  assert.deepStrictEqual(t.defaultCheckedGroups('ungrouped', model, SAMPLE_STATE, SAMPLE_CWD), [])
  // all：上次使用的分组存在 → 用之
  assert.deepStrictEqual(t.defaultCheckedGroups('all', model, SAMPLE_STATE, SAMPLE_CWD), ['perf'])
  // all：上次使用失效 → 当前项目
  const stale = { ...SAMPLE_STATE, lastUsedViewId: 'group:gone' }
  assert.deepStrictEqual(t.defaultCheckedGroups('all', model, stale, SAMPLE_CWD), [SAMPLE_CWD])
  // all：无 cwd 且上次使用失效 → 空（原「常用」兜底已移除，调整记录 #28——
  // 「常用」概念已由「上次使用」视图取代，defaultCheckedGroups 不再找名为「常用」的分组）
  const noCwd = t.buildGroupModel(SAMPLE_LIBRARY, SAMPLE_STATE, null)
  assert.deepStrictEqual(t.defaultCheckedGroups('all', noCwd, stale, null), []) // SAMPLE 无「常用」分组
  const libWithCommon = { commands: [{ id: 'x', title: 'x', cmd: 'x', groups: ['常用'] }] }
  const mCommon = t.buildGroupModel(libWithCommon, SAMPLE_STATE, null)
  assert.deepStrictEqual(t.defaultCheckedGroups('all', mCommon, stale, null), [], '即使存在「常用」分组也不回退（概念已取代）')
})

await check('D4 deletionPlan：解关联 vs 彻底删除（§3.5 语境语义）', async () => {
  const t = await testableOf({})
  const multi = { id: 'x', groups: ['a', 'b'] }
  const single = { id: 'y', groups: ['a'] }
  assert.deepStrictEqual(t.deletionPlan(multi, 'group:a'), { mode: 'unlink', group: 'a' })
  assert.deepStrictEqual(t.deletionPlan(single, 'group:a'), { mode: 'remove' })
  assert.deepStrictEqual(t.deletionPlan(multi, 'all'), { mode: 'remove' })
  assert.deepStrictEqual(t.deletionPlan(multi, 'group:z'), { mode: 'remove' }) // 不属于该分组
})

await check('D5 groupDeletionPlan：N 解关联 / M 彻底删除', async () => {
  const t = await testableOf({})
  const plan = t.groupDeletionPlan('common', SAMPLE_LIBRARY)
  assert.strictEqual(plan.affected.length, 2) // top-mem, proj-build
  assert.strictEqual(plan.deletedOnly.length, 0) // 两者都还有其他分组
  const plan2 = t.groupDeletionPlan('logs', SAMPLE_LIBRARY)
  assert.strictEqual(plan2.affected.length, 1)
  assert.strictEqual(plan2.deletedOnly.length, 1) // log-clean 仅属 logs
})

await check('D6 renameGroup：级联更新 / 冲突拒绝 / 空名拒绝', async () => {
  const t = await testableOf({})
  const existing = { common: true, perf: true, logs: true }
  const r = t.renameGroup(SAMPLE_LIBRARY, 'common', '常用', existing)
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.changed, 2)
  for (const c of r.library.commands) {
    if (c.id === 'top-mem' || c.id === 'proj-build') assert.ok(c.groups.includes('常用'))
    assert.ok(!c.groups.includes('common'))
  }
  const conflict = t.renameGroup(SAMPLE_LIBRARY, 'perf', 'common', existing)
  assert.strictEqual(conflict.ok, false)
  assert.ok(conflict.reason.includes('已存在'))
  assert.strictEqual(t.renameGroup(SAMPLE_LIBRARY, 'perf', 'perf', existing).ok, false)
  assert.strictEqual(t.renameGroup(SAMPLE_LIBRARY, 'perf', '  ', existing).ok, false)
})

await check('D7 togglePinned：加入/移除/顺序保持', async () => {
  const t = await testableOf({})
  assert.deepStrictEqual(t.togglePinned(['a', 'b'], 'c'), ['a', 'b', 'c'])
  assert.deepStrictEqual(t.togglePinned(['a', 'b'], 'a'), ['b'])
  assert.deepStrictEqual(t.togglePinned(undefined, 'x'), ['x'])
})

// ════════════════════════════════════════════════════════════════════════
// E. DOM 渲染与交互
// ════════════════════════════════════════════════════════════════════════

await check('E1 添加命令入口 = 分组条下方长条按钮；新建分组 = 分组栏右侧 ＋（调整记录 #33）', async () => {
  const s = await bootScene({})
  assert.ok(s.addCmdBtn !== null, '应有「添加命令」长条按钮')
  assert.strictEqual(s.addCmdBtn.textContent, '添加命令')
  assert.ok(s.groupAddBtn !== null, '应有「＋」新建分组按钮')
  assert.strictEqual(s.groupAddBtn.textContent, '+')
  // 长条按钮位于分组条与命令区之间；旧搜索行/顶栏「+ 添加」已移除
  const body = s.drawer.children.find((c) => c.className === 'cmd-pad-drawer-body')
  const classes = body.children.map((c) => c.className)
  assert.deepStrictEqual(classes, ['cmd-pad-search', 'cmd-pad-groups', 'cmd-pad-addcmd', 'cmd-pad-content'], '搜索 → 分组条 → 添加命令 → 命令区')
  assert.strictEqual(find(s.body, '.cmd-pad-add'), null, '不再有旧「+ 添加」按钮')
  // ＋ 挂在分组条内（右侧）
  assert.ok(s.groupsEl.children.includes(s.groupAddBtn), '＋ 位于分组条内')
})

await check('E2 分组视图点 + 添加 → 表单弹窗，默认勾选当前分组（含不常驻）', async () => {
  const s = await bootScene({})
  clickGroup(s, 'group:logs')
  openAdd(s)
  const modal = modalEl(s)
  assert.ok(modal !== null, '弹窗应出现')
  assert.strictEqual(find(modal, '.cmd-pad-modal-title').textContent, '添加命令')
  const checked = findAllAttr(modal, 'data-checked', 'true', [])
  assert.strictEqual(checked.length, 1, '默认勾选 1 个分组')
  assert.strictEqual(checked[0].getAttribute('data-group'), 'logs')
})

await check('E3 全部视图点添加 → 默认勾选上次使用的分组', async () => {
  const s = await bootScene({})
  clickGroup(s, 'all') // 切到全部视图语境（§3.5：全部/搜索态默认勾选 上次使用 → 当前项目；原「常用」兜底已移除，调整记录 #28）
  openAdd(s)
  const modal = modalEl(s)
  const checked = findAllAttr(modal, 'data-checked', 'true', [])
  assert.strictEqual(checked[0].getAttribute('data-group'), 'perf') // lastUsedViewId=group:perf
})

await check('E4 填写表单保存 → PUT library 正确 + 面板刷新 + 弹窗关闭', async () => {
  const s = await bootScene({})
  clickGroup(s, 'group:perf')
  openAdd(s)
  fillForm(s, { 标题: '新命令', 命令: 'echo new', 备注: '测试备注' })
  clickModalButton(s, '保存')
  await tick()
  const lib = lastLibraryPut(s)
  assertLibraryValid(lib)
  const added = lib.commands.find((c) => c.title === '新命令')
  assert.ok(added !== undefined, '新命令应存在')
  assert.strictEqual(added.cmd, 'echo new')
  assert.strictEqual(added.note, '测试备注')
  assert.deepStrictEqual(added.groups, ['perf'])
  assert.strictEqual(added.danger, false)
  assert.strictEqual(modalEl(s), null, '保存后弹窗关闭')
  assert.ok(cardIds(s).includes(added.id), '面板刷新出现新卡片')
  assert.strictEqual(find(s.body, '.cmd-pad-toast').textContent, '已添加')
})

await check('E5 新建分组：保存时自动创建并勾选', async () => {
  const s = await bootScene({})
  clickGroup(s, 'all')
  openAdd(s)
  fillForm(s, { 标题: '含新组', 命令: 'ls' })
  // 新建分组输入框（placeholder 含「新建」）
  const newGroupInput = collect(modalEl(s), 'input', []).find((el) => (el.placeholder || '').includes('新建'))
  assert.ok(newGroupInput !== undefined, '新建分组输入框应存在')
  newGroupInput.value = 'brand-new'
  clickModalButton(s, '保存')
  await tick()
  const lib = lastLibraryPut(s)
  const added = lib.commands.find((c) => c.title === '含新组')
  assert.ok(added.groups.includes('brand-new'), '新分组应自动创建并归属')
})

await check('E5b 新建分组（分组栏 ＋）：弹窗 → 输名创建 → 自动常驻 + state 持久化 + 空分组出现在分组条', async () => {
  const s = await bootScene({})
  openAddGroup(s)
  const modal = modalEl(s)
  assert.ok(modal !== null, '新建分组弹窗出现')
  assert.strictEqual(find(modal, '.cmd-pad-modal-title').textContent, '新建分组')
  const input = find(modal, '.cmd-pad-form-input')
  input.value = '部署脚本'
  clickModalButton(s, '创建')
  await tick()
  assert.strictEqual(modalEl(s), null, '创建后弹窗关闭')
  // state 持久化（自动常驻）
  const lastState = s.statePuts[s.statePuts.length - 1]
  assert.ok(Array.isArray(lastState.pinnedGroups) && lastState.pinnedGroups.includes('部署脚本'), 'pinnedGroups 持久化新分组')
  assert.deepStrictEqual(lastState.pinnedGroups, ['common', 'perf', '部署脚本'], '新分组追加在常驻列表末尾')
  // 分组条出现该空分组（常驻空分组也显示）
  const rows = collect(s.groupsEl, '.cmd-pad-group-row', []).map((r) => r.textContent)
  assert.ok(rows.some((t) => t.includes('部署脚本')), '分组条出现新分组')
  assert.strictEqual(find(s.body, '.cmd-pad-toast').textContent, '已创建分组「部署脚本」')
})

await check('E5c 新建分组校验：空名 / 重名 / 路径名拒绝；Esc 关闭', async () => {
  const s = await bootScene({})
  openAddGroup(s)
  // 空名
  clickModalButton(s, '创建')
  assert.strictEqual(find(s.body, '.cmd-pad-toast').textContent, '分组名不能为空')
  assert.ok(modalEl(s) !== null, '弹窗保留')
  // 重名（SAMPLE 有 perf 分组）
  let input = find(modalEl(s), '.cmd-pad-form-input')
  input.value = 'perf'
  clickModalButton(s, '创建')
  assert.ok(find(s.body, '.cmd-pad-toast').textContent.includes('已存在'), `重名拒绝: ${find(s.body, '.cmd-pad-toast').textContent}`)
  assert.ok(modalEl(s) !== null, '弹窗保留')
  // 路径名
  input.value = 'D:\\evil\\path'
  clickModalButton(s, '创建')
  assert.strictEqual(find(s.body, '.cmd-pad-toast').textContent, '分组名不能是路径')
  assert.ok(modalEl(s) !== null, '弹窗保留')
  // 回车键 = 创建（输入新名字后 Enter）
  input.value = '回车创建'
  const keydownFns = input.listeners.keydown || []
  assert.ok(keydownFns.length > 0, '输入框绑定了回车提交')
  keydownFns.forEach((fn) => fn({ key: 'Enter', preventDefault() {} }))
  await tick()
  assert.strictEqual(modalEl(s), null, '回车创建后弹窗关闭')
  // Esc 再开一个 → 关闭
  openAddGroup(s)
  pressEsc(s)
  assert.strictEqual(modalEl(s), null, 'Esc 关闭新建分组弹窗')
})

await check('E6 危险关键词：输入 rm → 提示 + 自动勾选危险', async () => {
  const s = await bootScene({})
  openAdd(s)
  const inputs = modalInputs(s)
  const cmdInput = inputs['命令']
  cmdInput.value = 'rm -rf /tmp/x'
  cmdInput.listeners.input.forEach((fn) => fn())
  const hint = find(modalEl(s), '.cmd-pad-form-hint')
  assert.ok(hint.textContent.includes('危险关键词'), `提示出现: ${hint.textContent}`)
  const dangerCheck = collect(modalEl(s), 'input', []).find((el) => el.type === 'checkbox')
  assert.strictEqual(dangerCheck.checked, true, '危险自动勾选')
})

await check('E7 编辑：右键菜单 → 预填 → 修改保存', async () => {
  const s = await bootScene({})
  openCardMenu(s, 'top-mem')
  clickMenu(s, '编辑')
  const inputs = modalInputs(s)
  assert.strictEqual(inputs['标题'].value, '查看整机内存')
  assert.strictEqual(inputs['命令'].value, 'hdc shell "top -n 1 | head -30"')
  inputs['标题'].value = '改名后的内存'
  clickModalButton(s, '保存')
  await tick()
  const lib = lastLibraryPut(s)
  const edited = lib.commands.find((c) => c.id === 'top-mem')
  assert.strictEqual(edited.title, '改名后的内存')
  assert.deepStrictEqual(edited.groups, ['perf', 'common'], '编辑保留原分组勾选')
})

await check('E8 删除解关联：多分组命令在分组视图删除 → 静默解关联（无确认弹窗）', async () => {
  const s = await bootScene({})
  clickGroup(s, 'group:common')
  openCardMenu(s, 'top-mem') // groups: perf, common
  clickMenu(s, '删除')
  await tick()
  assert.strictEqual(modalEl(s), null, '解关联无确认弹窗')
  const lib = lastLibraryPut(s)
  const cmd = lib.commands.find((c) => c.id === 'top-mem')
  assert.ok(cmd !== undefined, '命令保留')
  assert.deepStrictEqual(cmd.groups, ['perf'], '仅移除 common 关联')
})

await check('E9 彻底删除：仅此分组命令 → 确认弹窗 → 删除 + Toast 撤销', async () => {
  const s = await bootScene({})
  clickGroup(s, 'group:logs')
  openCardMenu(s, 'log-clean') // groups: [logs]
  clickMenu(s, '删除')
  const modal = modalEl(s)
  assert.ok(modal !== null, '彻底删除需确认弹窗')
  assert.ok(find(modal, '.cmd-pad-modal-message').textContent.includes('彻底删除'))
  clickModalButton(s, '删除')
  await tick()
  const lib = lastLibraryPut(s)
  assert.strictEqual(lib.commands.find((c) => c.id === 'log-clean'), undefined, '命令已删除')
  const toast = find(s.body, '.cmd-pad-toast')
  assert.ok(toast.textContent.includes('已删除'), `toast: ${toast.textContent}`)
  assert.ok(find(toast, 'button') !== null, 'Toast 带撤销按钮')
})

await check('E10 撤销：点 Toast 撤销 → PUT 恢复快照', async () => {
  const s = await bootScene({})
  clickGroup(s, 'group:logs')
  openCardMenu(s, 'log-clean')
  clickMenu(s, '删除')
  clickModalButton(s, '删除')
  await tick()
  const afterDelete = s.libraryPuts.length
  const toast = find(s.body, '.cmd-pad-toast')
  const undoBtn = find(toast, 'button')
  assert.ok(undoBtn !== null)
  undoBtn.listeners.click.forEach((fn) => fn())
  await tick()
  const lib = lastLibraryPut(s)
  assert.ok(lib.commands.find((c) => c.id === 'log-clean') !== undefined, '撤销后命令恢复')
  assert.ok(s.libraryPuts.length === afterDelete + 1, '撤销触发一次 PUT')
  assert.strictEqual(find(s.body, '.cmd-pad-toast').textContent, '已撤销')
})

await check('E11 分组删除：确认弹窗列出影响（N 解关联 / M 彻底删除）', async () => {
  const s = await bootScene({})
  openGroupMenu(s, 'group:logs')
  clickMenu(s, '删除')
  const modal = modalEl(s)
  assert.ok(modal !== null)
  const msg = find(modal, '.cmd-pad-modal-message').textContent
  assert.ok(msg.includes('1 条命令解除关联'), `影响文案: ${msg}`)
  assert.ok(msg.includes('1 条仅此分组的将彻底删除'), `彻底删除计数: ${msg}`)
  clickModalButton(s, '删除')
  await tick()
  const lib = lastLibraryPut(s)
  assert.strictEqual(lib.commands.find((c) => c.id === 'log-clean'), undefined, 'log-clean 彻底删除')
  // top-mem 与 logs 无关联，不受影响
  assert.ok(lib.commands.find((c) => c.id === 'top-mem') !== undefined, 'top-mem 不受影响')
})

await check('E12 重命名：级联更新 + 冲突拒绝（弹窗保留）', async () => {
  const s = await bootScene({})
  openGroupMenu(s, 'group:perf')
  clickMenu(s, '重命名')
  let inputs = modalInputs(s)
  inputs[Object.keys(inputs)[0]].value = '性能采集'
  clickModalButton(s, '确定')
  await tick()
  const lib = lastLibraryPut(s)
  const cmd = lib.commands.find((c) => c.id === 'top-mem')
  assert.ok(cmd.groups.includes('性能采集'), '级联更新')
  assert.ok(!cmd.groups.includes('perf'))
  // 冲突：把 perf 重命名为 common（已存在）
  openGroupMenu(s, 'group:性能采集')
  clickMenu(s, '重命名')
  inputs = modalInputs(s)
  inputs[Object.keys(inputs)[0]].value = 'common'
  clickModalButton(s, '确定')
  await tick()
  assert.ok(modalEl(s) !== null, '冲突时弹窗保留')
  assert.strictEqual(find(s.body, '.cmd-pad-toast').textContent, '分组名「common」已存在')
})

await check('E13 常驻切换：设为常驻 → PUT state + 侧栏重排', async () => {
  const s = await bootScene({})
  // logs 当前不常驻（在更多里）
  openGroupMenu(s, 'group:logs')
  clickMenu(s, '设为常驻')
  await tick()
  assert.deepStrictEqual(s.statePuts[s.statePuts.length - 1].pinnedGroups, ['common', 'perf', 'logs'])
  // 侧栏：logs 进入常驻区（取名字 span 语义文本，不含计数）
  const names = collect(s.groupsEl, '.cmd-pad-group-name', []).map((n) => n.textContent)
  assert.ok(names.includes('logs'), 'logs 出现在常驻区')
  // 再取消常驻
  openGroupMenu(s, 'group:logs')
  clickMenu(s, '取消常驻')
  await tick()
  assert.deepStrictEqual(s.statePuts[s.statePuts.length - 1].pinnedGroups, ['common', 'perf'])
})

await check('E14 常驻分组无命令也显示（§3.3）', async () => {
  const t = await testableOf({})
  const state = { pinnedGroups: ['ghost'], lastUsedViewId: '', viewLastUsedAt: {} }
  const m = t.buildGroupModel(SAMPLE_LIBRARY, state, SAMPLE_CWD)
  assert.deepStrictEqual(m.pinnedCustom, ['ghost'], '无命令常驻分组也显示')
  // DOM 侧栏应渲染 ghost 行
  const s = await bootScene({ state })
  const row = findAttr(s.groupsEl, 'data-view-id', 'group:ghost')
  assert.ok(row !== null, 'ghost 行应显示')
  clickGroup(s, 'group:ghost')
  assert.strictEqual(find(s.contentEl, '.cmd-pad-empty').textContent, '该分组还没有命令')
})

await check('E15 连续 20+ 次增删改 → yml 始终合法、分组聚合正确', async () => {
  const s = await bootScene({})
  for (let i = 0; i < 22; i++) {
    // 添加
    openAdd(s)
    fillForm(s, { 标题: '批量命令' + i, 命令: 'echo ' + i, 分组: '' })
    clickModalButton(s, '保存')
    await tick()
    assertLibraryValid(lastLibraryPut(s))
    // 编辑（改标题）
    const added = lastLibraryPut(s).commands.find((c) => c.title === '批量命令' + i)
    openCardMenu(s, added.id)
    clickMenu(s, '编辑')
    const inputs = modalInputs(s)
    inputs['标题'].value = '改名' + i
    clickModalButton(s, '保存')
    await tick()
    assertLibraryValid(lastLibraryPut(s))
    // 删除（最后一个分组视图 = all → 彻底删除需确认）
    if (i % 3 === 0) {
      openCardMenu(s, added.id)
      clickMenu(s, '删除')
      assert.ok(modalEl(s) !== null)
      clickModalButton(s, '删除')
      await tick()
      assertLibraryValid(lastLibraryPut(s))
    }
  }
  const final = lastLibraryPut(s)
  assertLibraryValid(final)
  const names = final.commands.map((c) => c.title)
  assert.ok(names.filter((n) => n.startsWith('改名')).length >= 14, '剩余改名命令 ≥14（22 添加 - 7 删除）')
  // 分组聚合正确：buildGroupModel 不抛错且每组计数与命令数一致
  const model = s.moduleExports.testable.buildGroupModel(final, SAMPLE_STATE, SAMPLE_CWD)
  let total = 0
  for (const k in model.countByGroup) total += model.countByGroup[k]
  assert.ok(total >= final.commands.length, '分组计数与命令数一致')
})

await check('E16 手改 yml 重开自动生效（每次打开拉取）', async () => {
  const state = { pinnedGroups: [], lastUsedViewId: 'group:common', viewLastUsedAt: {} }
  const s = await bootScene({ state })
  // 初始视图 = 上次使用的 common 分组（top-mem / proj-build 属于 common）
  assert.deepStrictEqual(cardIds(s), ['top-mem', 'proj-build'])
  // 模拟外部手改：payloadRef 指向新数据
  s.payloadRef.library = { commands: [{ id: 'external', title: '外部新增', cmd: 'x', groups: ['common'] }] }
  // 关闭再打开
  s.fab.listeners.click.forEach((fn) => fn()) // close
  await tick()
  s.fab.listeners.click.forEach((fn) => fn()) // reopen
  await tick()
  const ids = cardIds(s)
  assert.deepStrictEqual(ids, ['external'], '重开拉取最新命令库（初始视图仍为 common）')
})

await check('E17 Esc 链：弹窗开 → Esc 关弹窗（不动抽屉）', async () => {
  const s = await bootScene({})
  openAdd(s)
  assert.ok(modalEl(s) !== null)
  pressEsc(s)
  assert.strictEqual(modalEl(s), null, 'Esc 关闭弹窗')
  assert.strictEqual(s.drawer.getAttribute('data-open'), 'true', '抽屉保持打开')
})

await check('E18 卡片右键菜单项：复制/编辑/删除', async () => {
  const s = await bootScene({})
  openCardMenu(s, 'top-mem')
  const items = collect(find(s.body, '.cmd-pad-menu'), 'button', []).map((b) => b.textContent)
  assert.deepStrictEqual(items, ['复制', '编辑', '删除'])
  // 菜单项点击后自动关闭
  clickMenu(s, '复制')
  await tick()
  assert.strictEqual(find(s.body, '.cmd-pad-menu'), null, '菜单已关闭')
  assert.deepStrictEqual(s.clipboardTexts, ['hdc shell "top -n 1 | head -30"'])
})

console.log(`\n===== ${passed} passed, ${failed} failed =====`)
process.exit(failed > 0 ? 1 : 0)
