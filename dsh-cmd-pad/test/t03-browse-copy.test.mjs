/**
 * T03 验收 harness：抽屉只读浏览 + 复制（F2/F3/F5）
 *
 * 覆盖（对照 TASK.md T03 完成定义 + 设计文档 §3.2/§3.3/§3.4/§4.1/§4.4 + 视觉规范 §6）：
 *   A. 纯逻辑（exports.testable）：项目分组判定 / 路径末段 / 消歧 / 聚合 /
 *      分组模型排序（常驻在前、其他项目按最近使用倒序）/ 上次 slot 有效性与
 *      失效隐藏 / 视图命令 / 搜索匹配 / 会话探测
 *   B. DOM 渲染：侧栏结构（上次 slot、全部、项目：、常驻、▸更多）、更多展开
 *      （其他项目小节 + 不常驻分组，无「分组」小节标题，调整记录 #26）、视图切换、全部视图分节、一键复制（含多行 &&、
 *      命令块点击）、复制后「上次使用」刷新（PUT /api/state）、危险 pill、
 *      搜索（命中过滤/计数/高亮/分组名命中/Esc 清空//聚焦）、空态
 *   C. 视觉规范 §6 静态检查：无裸硬编码色值、无 emoji、类名全 cmd-pad- 前缀、
 *      仅 2 处单色 SVG、innerHTML 仅用于静态 SVG、z-index 层级（30/90）
 *
 * 运行：node test/t03-browse-copy.test.mjs
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

// ── 最小 DOM stub（支持 T03 渲染所需：textContent 聚合 / value / focus / input 事件）──
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
    _text: undefined,
    _focused: false,
    get textContent() {
      if (this._text !== undefined) return this._text
      return this.children.map((c) => c.textContent).join('')
    },
    set textContent(v) {
      this._text = String(v)
      this.children.length = 0 // 浏览器语义：赋值清空子节点
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
  if (typeof el.getAttribute !== 'function') return false // text node
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

/** 深度优先按属性值找元素。 */
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
    { id: 'top-mem', title: '查看整机内存', cmd: 'hdc shell "top -n 1 | head -30"', groups: ['perf', 'common'] },
    { id: 'log-clean', title: '清理日志', cmd: 'rm -rf /data/log/*', groups: ['logs'], danger: true },
    { id: 'proj-run', title: '跑测试', cmd: 'npm test', groups: ['D:\\work\\car_media'] },
    { id: 'proj-build', title: '构建', cmd: 'npm run build', groups: ['D:\\work\\car_media', 'common'] },
    { id: 'other-a', title: 'A 项目任务', cmd: 'echo a', groups: ['E:\\docs\\Temp_Code'] },
    { id: 'other-b', title: 'B 项目任务', cmd: 'echo b', groups: ['D:\\other\\Temp_Code'] },
    { id: 'multi-line', title: '多行命令', cmd: 'git add . && git commit -m "x"\ngit push', groups: ['common'] },
  ],
}
const SAMPLE_STATE = {
  pinnedGroups: ['common', 'perf'],
  lastUsedViewId: 'group:perf',
  viewLastUsedAt: {
    'group:E:\\docs\\Temp_Code': 300,
    'group:D:\\other\\Temp_Code': 100,
    'group:perf': 500,
  },
}
const SAMPLE_CWD = 'D:\\work\\car_media'

async function tick() {
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
}

/** 构建独立场景：预置 #root → 执行 client.js → apply(mockCtx) → 打开抽屉 → 等待数据加载。 */
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
  const clipboardTexts = []
  // 深拷贝隔离：client 运行时会改写 data.state（如 recentCommands / lastUsedViewId），
  // 共享 SAMPLE_STATE/SAMPLE_LIBRARY 会让用例间串扰（调整记录 #28 用例发现）
  const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)))
  const libraryPayload = {
    ok: true,
    library: clone(opts.library !== undefined ? opts.library : SAMPLE_LIBRARY),
    state: clone(opts.state !== undefined ? opts.state : SAMPLE_STATE),
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
    navigator: {
      clipboard: {
        writeText(t) {
          clipboardTexts.push(String(t))
          return Promise.resolve()
        },
      },
    },
    fetch(url, init) {
      fetchCalls.push({ url, init })
      if (init && init.method === 'PUT') {
        statePuts.push(JSON.parse(init.body))
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(libraryPayload) })
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
  const sessionId = opts.sessionId || ''
  const ctx = {
    effect(fn) {
      const d = fn()
      if (typeof d === 'function') disposer = d
      return d
    },
    get(name) {
      if (name === 'sessions' && sessionId !== '') {
        return { list: { getSnapshot: () => ({ current: sessionId, byId: {} }) } }
      }
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
    clipboardTexts,
    moduleExports,
    dispose: () => { if (typeof disposer === 'function') disposer() },
  }
  s.fab.listeners.click.forEach((fn) => fn())
  await tick()
  return s
}

function clickGroup(s, viewId) {
  let row = findAttr(s.groupsEl, 'data-view-id', viewId)
  if (row === null) {
    // 目标行可能在折叠的「更多」里（不常驻分组/其他项目）：先展开
    const more = find(s.groupsEl, '.cmd-pad-more-toggle')
    if (more !== null) {
      s.groupsEl.listeners.click.forEach((fn) => fn({ target: more }))
      row = findAttr(s.groupsEl, 'data-view-id', viewId)
    }
  }
  assert.ok(row !== null, `分组行 data-view-id=${viewId} 应存在`)
  s.groupsEl.listeners.click.forEach((fn) => fn({ target: row }))
}

function cardIds(s) {
  return findAllAttr(s.contentEl, 'data-cmd-id', undefined, []).map((c) => c.getAttribute('data-cmd-id'))
}

function clickCardButton(s, cmdId) {
  const card = findAttr(s.contentEl, 'data-cmd-id', cmdId)
  assert.ok(card !== null, `卡片 ${cmdId} 应存在`)
  const actions = card.children.find((c) => c.className === 'cmd-pad-card-actions')
  assert.ok(actions !== undefined, `卡片 ${cmdId} 应有操作行`)
  const btn = actions.children[0]
  assert.ok(btn !== undefined, `卡片 ${cmdId} 应有复制按钮`)
  s.contentEl.listeners.click.forEach((fn) => fn({ target: btn }))
}

function clickCmdBlock(s, cmdId) {
  const card = findAttr(s.contentEl, 'data-cmd-id', cmdId)
  const block = findAttr(card, 'data-copy-cmd', '')
  assert.ok(block !== null, `卡片 ${cmdId} 应有命令块`)
  s.contentEl.listeners.click.forEach((fn) => fn({ target: block }))
}

function typeSearch(s, text) {
  s.searchInput.value = text
  s.searchInput.listeners.input.forEach((fn) => fn())
}

function pressEsc(s) {
  s.documentEvents.keydown.forEach((fn) => fn({ key: 'Escape', preventDefault() {} }))
}

function pressSlash(s, target) {
  s.documentEvents.keydown.forEach((fn) => fn({ key: '/', target: target || s.body, preventDefault() {} }))
}

/** 分组行语义文本 = 前缀 + 名字（不含计数；浏览器中计数 span 与名字分开布局）。 */
function groupRowSemanticText(row) {
  const prefix = row.children.find((c) => c.className === 'cmd-pad-group-prefix')
  const name = row.children.find((c) => c.className === 'cmd-pad-group-name')
  return (prefix ? prefix.textContent : '') + (name ? name.textContent : '')
}

function groupRowTexts(s) {
  return collect(s.groupsEl, '.cmd-pad-group-row', []).map(groupRowSemanticText)
}

// ════════════════════════════════════════════════════════════════════════
// A. 纯逻辑（exports.testable）
// ════════════════════════════════════════════════════════════════════════

const testableOf = async (opts) => (await bootScene(opts)).moduleExports.testable

await check('A1 isProjectGroup：盘符 / UNC / POSIX 判定', async () => {
  const t = await testableOf({})
  assert.strictEqual(t.isProjectGroup('D:\\work\\car_media'), true)
  assert.strictEqual(t.isProjectGroup('D:/work/car_media'), true)
  assert.strictEqual(t.isProjectGroup('\\\\server\\share\\proj'), true)
  assert.strictEqual(t.isProjectGroup('/home/user/proj'), true)
  assert.strictEqual(t.isProjectGroup('性能采集'), false)
  assert.strictEqual(t.isProjectGroup('常用'), false)
})

await check('A2 pathBase / pathParents：Windows 与 POSIX 通吃', async () => {
  const t = await testableOf({})
  assert.strictEqual(t.pathBase('D:\\work\\car_media'), 'car_media')
  assert.strictEqual(t.pathBase('/home/user/proj'), 'proj')
  assert.deepStrictEqual(t.pathParents('D:\\work\\car_media'), ['D:', 'work'])
  assert.deepStrictEqual(t.pathParents('/home/user/proj'), ['home', 'user'])
  assert.deepStrictEqual(t.pathParents('car_media'), [])
})

await check('A3 消歧：末段唯一直接用末段；重名带上一级路径', async () => {
  const t = await testableOf({})
  const single = t.disambiguateProjectNames(['D:\\work\\car_media'])
  assert.strictEqual(single['D:\\work\\car_media'], 'car_media')
  const dup = t.disambiguateProjectNames(['E:\\docs\\Temp_Code', 'D:\\other\\Temp_Code'])
  assert.strictEqual(dup['E:\\docs\\Temp_Code'], 'docs / Temp_Code')
  assert.strictEqual(dup['D:\\other\\Temp_Code'], 'other / Temp_Code')
})

await check('A4 aggregateGroups：自定义 / 项目 / 未分组分类', async () => {
  const t = await testableOf({})
  const agg = t.aggregateGroups([
    { groups: ['perf', 'common'] },
    { groups: ['D:\\work\\x'] },
    { groups: [] },
    { groups: ['common'] },
  ])
  assert.deepStrictEqual(agg.custom, ['perf', 'common'])
  assert.deepStrictEqual(agg.projects, ['D:\\work\\x'])
  assert.strictEqual(agg.hasUngrouped, true)
  const agg2 = t.aggregateGroups([{ groups: ['a'] }, { groups: ['a', 'b'] }])
  assert.deepStrictEqual(agg2.custom, ['a', 'b'])
  assert.strictEqual(agg2.hasUngrouped, false)
})

await check('A5 buildGroupModel：常驻在前、不常驻名字序、其他项目按最近使用倒序', async () => {
  const t = await testableOf({})
  const m = t.buildGroupModel(SAMPLE_LIBRARY, SAMPLE_STATE, SAMPLE_CWD)
  assert.deepStrictEqual(m.pinnedCustom, ['common', 'perf']) // pinnedGroups 顺序
  assert.deepStrictEqual(m.unpinnedCustom, ['logs'])
  assert.deepStrictEqual(m.otherProjects, ['E:\\docs\\Temp_Code', 'D:\\other\\Temp_Code']) // 300 在 100 前
  assert.strictEqual(m.moreCount, 3) // 2 其他项目 + 1 不常驻分组
  assert.strictEqual(m.displayNames[SAMPLE_CWD], 'car_media')
  assert.strictEqual(m.displayNames['E:\\docs\\Temp_Code'], 'docs / Temp_Code')
  assert.strictEqual(m.countByGroup.common, 3)
  assert.strictEqual(m.hasUngrouped, false)
  assert.deepStrictEqual(m.lastUsed, { id: 'group:perf', label: '上次：perf' })
})

await check('A6 computeLastUsed：指向失效视图（分组删除）→ 隐藏', async () => {
  const t = await testableOf({})
  const m = t.buildGroupModel(SAMPLE_LIBRARY, SAMPLE_STATE, SAMPLE_CWD)
  assert.strictEqual(t.computeLastUsed({ lastUsedViewId: 'group:不存在的组' }, m), null)
  assert.strictEqual(t.computeLastUsed({ lastUsedViewId: 'all' }, m), null)
  assert.strictEqual(t.computeLastUsed({ lastUsedViewId: 'current-project' }, m).id, 'current-project')
  assert.strictEqual(t.computeLastUsed({ lastUsedViewId: 'current-project' }, { ...m, cwd: null }), null)
})

await check('A7 isValidView / commandsForView：视图命令归属', async () => {
  const t = await testableOf({})
  const m = t.buildGroupModel(SAMPLE_LIBRARY, SAMPLE_STATE, SAMPLE_CWD)
  assert.strictEqual(t.isValidView('all', m), true)
  assert.strictEqual(t.isValidView('current-project', m), true)
  assert.strictEqual(t.isValidView('group:perf', m), true)
  assert.strictEqual(t.isValidView('group:gone', m), false)
  assert.strictEqual(t.isValidView('ungrouped', m), false)
  assert.deepStrictEqual(
    t.commandsForView(SAMPLE_LIBRARY.commands, 'current-project', SAMPLE_CWD).map((c) => c.id),
    ['proj-run', 'proj-build'],
  )
  assert.deepStrictEqual(t.commandsForView(SAMPLE_LIBRARY.commands, 'group:perf', SAMPLE_CWD).map((c) => c.id), ['top-mem'])
  assert.deepStrictEqual(
    t.commandsForView([{ id: 'x', groups: [] }], 'ungrouped', SAMPLE_CWD).map((c) => c.id),
    ['x'],
  )
})

await check('A8 searchMatches：字段命中 + 分组名命中', async () => {
  const t = await testableOf({})
  const cmd = { title: '查看整机内存', cmd: 'hdc shell "top -n 1"', note: '先看水位', tags: ['内存', 'top'], groups: ['perf', 'common'] }
  assert.strictEqual(t.searchMatches(cmd, '内存').hit, true)
  assert.strictEqual(t.searchMatches(cmd, 'hdc').hit, true)
  assert.strictEqual(t.searchMatches(cmd, '水位').hit, true)
  assert.strictEqual(t.searchMatches(cmd, 'perf').hit, true) // 分组名命中
  assert.strictEqual(t.searchMatches(cmd, 'zzz').hit, false)
  assert.strictEqual(t.searchMatches(cmd, '内存').title, true)
  assert.strictEqual(t.searchMatches(cmd, 'hdc').body, true)
})

await check('A9 getCurrentSessionId：探测 sessions 取 current；无服务返回空', async () => {
  const t = await testableOf({ sessionId: 'sess-1' })
  // bootScene 的 ctx.get('sessions') 返回 stub，仅当 sessionId 非空
  const direct = t.getCurrentSessionId({ get: () => ({ list: { getSnapshot: () => ({ current: 'sess-9', byId: {} }) } }) })
  assert.strictEqual(direct, 'sess-9')
  assert.strictEqual(t.getCurrentSessionId({ get: () => undefined }), '')
  assert.strictEqual(t.getCurrentSessionId({}), '')
})

await check('A10 pushRecent：「上次使用」记录去重置顶 + 保留上限 100（调整记录 #28）', async () => {
  const t = await testableOf({})
  // 空记录 → 新增
  const one = t.pushRecent([], 'cmd-a')
  assert.deepStrictEqual(one.map((r) => r.id), ['cmd-a'])
  // 重复使用 → 置顶（旧记录顺延，不重复）
  const two = t.pushRecent([{ id: 'cmd-b', at: 1 }, { id: 'cmd-a', at: 2 }], 'cmd-b')
  assert.deepStrictEqual(two.map((r) => r.id), ['cmd-b', 'cmd-a'])
  // 上限 100：105 条 + 置顶 c0 → 100 条且 c0 在首位
  const base = []
  for (let i = 0; i < 105; i++) base.push({ id: 'c' + i, at: i })
  const capped = t.pushRecent(base, 'c0')
  assert.strictEqual(capped.length, 100, '保留上限 100 条')
  assert.strictEqual(capped[0].id, 'c0')
  assert.strictEqual(capped[1].id, 'c1')
  // 非数组容错
  assert.deepStrictEqual(t.pushRecent(null, 'x').map((r) => r.id), ['x'])
})

await check('A11 recentCommandsView：倒序解析 / 已删除跳过 / 项目过滤 / 显示上限 20', async () => {
  const t = await testableOf({})
  const cmds = SAMPLE_LIBRARY.commands
  const recs = [
    { id: 'deleted-cmd', at: 900 }, // 库里不存在 → 跳过
    { id: 'top-mem', at: 800 },     // groups: [perf, common] → 非当前项目
    { id: 'proj-run', at: 700 },    // groups: [D:\work\car_media] = 当前项目
    { id: 'multi-line', at: 600 },  // groups: [common] → 非当前项目
  ]
  assert.deepStrictEqual(t.recentCommandsView(cmds, recs, 'all', SAMPLE_CWD, 20).map((c) => c.id), ['top-mem', 'proj-run', 'multi-line'], '全部范围：跳过已删除，按记录倒序')
  assert.deepStrictEqual(t.recentCommandsView(cmds, recs, 'project', SAMPLE_CWD, 20).map((c) => c.id), ['proj-run'], '项目范围：仅当前项目')
  assert.strictEqual(t.recentCommandsView(cmds, recs, 'all', SAMPLE_CWD, 1).length, 1, 'limit 生效（显示 20 条以内可截断）')
  assert.strictEqual(t.recentCommandsView([], recs, 'all', SAMPLE_CWD, 20).length, 0, '空命令库 → 空')
  assert.strictEqual(t.recentCommandsView(cmds, null, 'all', SAMPLE_CWD, 20).length, 0, '无记录 → 空')
})

await check('A12 defaultCheckedGroups：all/搜索态兜底不再回退「常用」分组（调整记录 #28）', async () => {
  const t = await testableOf({})
  const m = t.buildGroupModel(SAMPLE_LIBRARY, SAMPLE_STATE, SAMPLE_CWD)
  // lastUsed=group:perf 有效 → 默认勾选 perf
  assert.deepStrictEqual(t.defaultCheckedGroups('all', m, SAMPLE_STATE, SAMPLE_CWD), ['perf'])
  // lastUsed 失效 → 当前项目
  const stale = { pinnedGroups: [], lastUsedViewId: 'group:gone', viewLastUsedAt: {} }
  assert.deepStrictEqual(t.defaultCheckedGroups('all', m, stale, SAMPLE_CWD), [SAMPLE_CWD])
  // 即使库里存在名为「常用」的分组也不再兜底（概念已被「上次使用」视图取代）
  const m2 = t.buildGroupModel({ commands: [{ id: 'x', title: 'x', cmd: 'x', groups: ['常用'] }] }, {}, SAMPLE_CWD)
  assert.deepStrictEqual(t.defaultCheckedGroups('all', m2, { pinnedGroups: [], lastUsedViewId: '', viewLastUsedAt: {} }, SAMPLE_CWD), [])
})

// ════════════════════════════════════════════════════════════════════════
// B. DOM 渲染
// ════════════════════════════════════════════════════════════════════════

await check('B1 打开抽屉 → fetch /cmd-pad/api/library 一次，带 sessionId', async () => {
  const s = await bootScene({ sessionId: 'sess-42' })
  assert.strictEqual(s.fetchCalls.length, 1)
  assert.ok(s.fetchCalls[0].url.startsWith('/cmd-pad/api/library'))
  assert.ok(s.fetchCalls[0].url.includes('sessionId=sess-42'))
  assert.strictEqual(s.drawer.getAttribute('data-open'), 'true')
})

await check('B2 侧栏结构：全部 / 项目： / 上次使用 / 常驻分组 / 更多箭头（调整记录 #26/#28）', async () => {
  const s = await bootScene({})
  const rows = groupRowTexts(s)
  assert.deepStrictEqual(rows, ['全部', '项目：car_media', '上次使用', 'common', 'perf'])
  assert.strictEqual(find(s.groupsEl, '.cmd-pad-last-slot'), null, '不应有上次使用 slot 标签（#17 语义：打开即定位）')
  const more = find(s.groupsEl, '.cmd-pad-more-toggle')
  assert.ok(more !== null, '应有更多箭头')
  // 调整记录 #26：仅箭头（无「更多」文字）；折叠态 ▸ 指向右侧隐藏内容；计数入 title
  assert.strictEqual(more.textContent, '▸')
  assert.strictEqual(more.getAttribute('aria-expanded'), 'false')
  assert.ok(more.title.includes('3'), `折叠 title 应含隐藏分组计数（实际 ${more.title}）`)
  // 打开抽屉初始视图 = 上次使用的分组（lastUsedViewId=group:perf 有效）→ 内容区显示 perf 命令
  assert.deepStrictEqual(cardIds(s), ['top-mem'])
  assert.ok(findAttr(s.groupsEl, 'data-view-id', 'group:perf').getAttribute('data-active') === 'true')
})

await check('B3 更多展开 → 其他项目（消歧名 + 最近使用倒序）+ 不常驻分组（无「分组」小节标题，调整记录 #26）', async () => {
  const s = await bootScene({})
  clickGroup(s, 'all') // 先切到全部，避免初始视图干扰
  const more = find(s.groupsEl, '.cmd-pad-more-toggle')
  s.groupsEl.listeners.click.forEach((fn) => fn({ target: more }))
  const rows = groupRowTexts(s)
  // 顶层行（含「上次使用」视图 chip，调整记录 #28）
  assert.deepStrictEqual(rows.slice(0, 5), ['全部', '项目：car_media', '上次使用', 'common', 'perf'])
  // 小节标题：仅「其他项目」（「分组」标题已移除）
  const sections = collect(s.groupsEl, '.cmd-pad-more-section', []).map((x) => x.textContent)
  assert.deepStrictEqual(sections, ['其他项目'])
  // 更多内行：其他项目（最近使用倒序：E 300 前于 D 100）+ 不常驻分组
  assert.deepStrictEqual(rows.slice(5), ['docs / Temp_Code', 'other / Temp_Code', 'logs'])
  // 折叠计数：2 其他项目 + 1 不常驻分组 = 3；展开态 ◂ 指向收起方向
  const t = find(s.groupsEl, '.cmd-pad-more-toggle')
  assert.strictEqual(t.textContent, '◂')
  assert.strictEqual(t.getAttribute('aria-expanded'), 'true')
  assert.ok(t.title.includes('收起'), `展开 title 应为收起提示（实际 ${t.title}）`)
})

await check('B4 视图切换：点「项目：car_media」→ 只显示该项目命令', async () => {
  const s = await bootScene({})
  clickGroup(s, 'current-project')
  assert.deepStrictEqual(cardIds(s), ['proj-run', 'proj-build'])
  assert.ok(findAttr(s.groupsEl, 'data-view-id', 'current-project').getAttribute('data-active') === 'true')
  clickGroup(s, 'group:perf')
  assert.deepStrictEqual(cardIds(s), ['top-mem'])
  // 无未分组命令 → 侧栏无「未分组」行
  assert.strictEqual(findAttr(s.groupsEl, 'data-view-id', 'ungrouped'), null)
})

await check('B5 全部视图分节：节标题 + 计数（当前项目 → 其他项目 → 常驻 → 不常驻）', async () => {
  const s = await bootScene({})
  clickGroup(s, 'all')
  const titles = collect(s.contentEl, '.cmd-pad-section-title', []).map((t) => t.textContent)
  assert.deepStrictEqual(titles, ['car_media2', 'docs / Temp_Code1', 'other / Temp_Code1', 'common3', 'perf1', 'logs1'])
  // 未分组节不存在（无未分组命令）
  assert.strictEqual(titles.some((t) => t.startsWith('未分组')), false)
})

await check('B6 一键复制：命令原样进剪贴板（含多行 &&）+ Toast + 上次使用刷新', async () => {
  const s = await bootScene({})
  clickGroup(s, 'group:common') // multi-line 在 common 分组
  clickCardButton(s, 'multi-line')
  await tick()
  assert.deepStrictEqual(s.clipboardTexts, ['git add . && git commit -m "x"\ngit push'])
  const toast = find(s.body, '.cmd-pad-toast')
  assert.strictEqual(toast.getAttribute('data-show'), 'true')
  assert.strictEqual(toast.textContent, '已复制')
  // Toast 锚定到复制按钮左侧（用户定稿）：inline left 被设置、right 为 auto
  assert.ok(typeof toast.style.left === 'string' && toast.style.left.endsWith('px'), 'toast 定位到按钮左侧: ' + toast.style.left)
  assert.strictEqual(toast.style.right, 'auto')
  // 上次使用刷新：common 视图复制 → lastUsedViewId=group:common；PUT /api/state 已发
  assert.strictEqual(s.statePuts.length, 1)
  assert.strictEqual(s.statePuts[0].lastUsedViewId, 'group:common')
  assert.ok(typeof s.statePuts[0].viewLastUsedAt['group:common'] === 'number')
  // 重开抽屉 → 初始视图直接定位到 group:common（无「上次」标签，调整记录 #17）
  s.fab.listeners.click.forEach((fn) => fn()) // close
  await tick()
  s.fab.listeners.click.forEach((fn) => fn()) // reopen
  await tick()
  assert.deepStrictEqual(cardIds(s), ['top-mem', 'proj-build', 'multi-line'], '重开直接显示 common 分组')
  assert.ok(findAttr(s.groupsEl, 'data-view-id', 'group:common').getAttribute('data-active') === 'true')
})

await check('B7 命令块点击复制：原样 + 危险命令也复制', async () => {
  const s = await bootScene({})
  clickGroup(s, 'group:logs')
  clickCmdBlock(s, 'log-clean')
  await tick()
  assert.deepStrictEqual(s.clipboardTexts, ['rm -rf /data/log/*'])
  assert.strictEqual(find(s.body, '.cmd-pad-toast').getAttribute('data-show'), 'true')
})

await check('B8 危险 pill：仅 danger 命令显示「危险」', async () => {
  const s = await bootScene({})
  clickGroup(s, 'group:logs')
  const danger = collect(s.contentEl, '.cmd-pad-card-danger', [])
  assert.strictEqual(danger.length, 1)
  assert.strictEqual(danger[0].textContent, '危险')
  clickGroup(s, 'all')
  const allDanger = collect(s.contentEl, '.cmd-pad-card-danger', [])
  assert.strictEqual(allDanger.length, 1) // 仅 log-clean
})

await check('B9 搜索：命中过滤 + 计数 + 高亮 + 分组名命中', async () => {
  const s = await bootScene({})
  typeSearch(s, 'rm')
  assert.deepStrictEqual(cardIds(s), ['log-clean'])
  const count = find(s.drawer, '.cmd-pad-search-count')
  assert.strictEqual(count.textContent, '命中 1 条')
  assert.ok(find(s.contentEl, '.cmd-pad-hit') !== null, '应有高亮 span')
  typeSearch(s, 'perf') // 分组名命中
  assert.deepStrictEqual(cardIds(s), ['top-mem'])
  assert.strictEqual(count.textContent, '命中 1 条')
  typeSearch(s, '不存在词')
  assert.strictEqual(find(s.contentEl, '.cmd-pad-empty').textContent, '没有匹配的命令')
  assert.strictEqual(count.textContent, '命中 0 条')
})

await check('B10 Esc 清空搜索 → 恢复视图；搜索态下再 Esc → 关闭抽屉', async () => {
  const s = await bootScene({})
  clickGroup(s, 'all') // 切到全部再测搜索
  typeSearch(s, 'rm')
  pressEsc(s)
  assert.strictEqual(s.searchInput.value, '')
  // 恢复全部视图内容（多分组命令跨节重复出现，去重后 7 条）
  assert.strictEqual(new Set(cardIds(s)).size, 7)
  // 搜索空时 Esc → 关抽屉
  pressEsc(s)
  assert.strictEqual(s.drawer.getAttribute('data-open'), 'false')
})

await check('B11 "/" 聚焦搜索（焦点不在输入框时）', async () => {
  const s = await bootScene({})
  pressSlash(s)
  assert.strictEqual(s.searchInput._focused, true)
})

await check('B12 空态：空库提示「等待添加」（发布版文案，调整记录 #27）', async () => {
  const s = await bootScene({ library: { commands: [] }, state: {}, cwd: null })
  assert.strictEqual(find(s.contentEl, '.cmd-pad-empty').textContent, '等待添加')
  // 无 cwd → 无「项目：」行；上次 slot（current-project）隐藏
  assert.strictEqual(findAttr(s.groupsEl, 'data-view-id', 'current-project'), null)
})

await check('B13 lastUsed 指向已删分组 → 打开初始视图回退「全部」', async () => {
  const s = await bootScene({ state: { pinnedGroups: [], lastUsedViewId: 'group:gone', viewLastUsedAt: {} } })
  assert.deepStrictEqual(cardIds(s).length > 0, true, '回退到全部视图有内容')
  assert.ok(findAttr(s.groupsEl, 'data-view-id', 'all').getAttribute('data-active') === 'true', '全部行激活')
})

await check('B14 分组视图空态：常驻分组无命令', async () => {
  const s = await bootScene({})
  clickGroup(s, 'group:logs')
  assert.deepStrictEqual(cardIds(s), ['log-clean'])
  // 全部视图含未分组命令的场景
  const s2 = await bootScene({ library: { commands: [{ id: 'orphan', title: '孤', cmd: 'x', groups: [] }] }, state: {}, cwd: null })
  assert.ok(findAttr(s2.groupsEl, 'data-view-id', 'ungrouped') !== null)
  clickGroup(s2, 'ungrouped')
  assert.deepStrictEqual(cardIds(s2), ['orphan'])
})

await check('B15 「上次使用」视图：工具栏（项目|全部 切换 + ⓘ 帮助）+ 空态（调整记录 #28）', async () => {
  const s = await bootScene({})
  clickGroup(s, 'recent')
  // 视图工具栏：范围切换 = 项目 | 全部（默认全部激活）
  const opts = collect(s.contentEl, '.cmd-pad-scope-opt', [])
  assert.strictEqual(opts.length, 2, '两个范围选项')
  assert.strictEqual(opts[0].textContent, '项目')
  assert.strictEqual(opts[1].textContent, '全部')
  assert.ok(opts[1].className.includes('cmd-pad-scope-opt-active'), '默认范围 = 全部')
  // ⓘ 帮助：小圆 + 空心问号 SVG + 悬停 title（简短语言提示切换作用）
  const help = find(s.contentEl, '.cmd-pad-help')
  assert.ok(help !== null, '应有 ⓘ 帮助按钮')
  assert.ok(help.innerHTML.includes('<svg') && help.innerHTML.includes('<circle'), 'ⓘ 为圆形 SVG')
  assert.ok(help.title.includes('项目') && help.title.includes('全部'), `ⓘ title 应提示切换作用（实际 ${help.title}）`)
  // 无使用记录 → 空态
  const empty = find(s.contentEl, '.cmd-pad-empty')
  assert.strictEqual(empty.textContent, '还没有使用记录')
})

await check('B16 复制命令 → 记录「上次使用」并持久化；视图按记录倒序显示', async () => {
  const s = await bootScene({})
  clickGroup(s, 'group:common')
  clickCardButton(s, 'multi-line')
  await tick()
  const put = s.statePuts[s.statePuts.length - 1]
  assert.ok(Array.isArray(put.recentCommands), 'state PUT 应含 recentCommands')
  assert.strictEqual(put.recentCommands[0].id, 'multi-line', '复制即记录')
  assert.ok(typeof put.recentCommands[0].at === 'number', '记录带时间戳')
  // 打开「上次使用」视图 → 显示该命令
  clickGroup(s, 'recent')
  assert.deepStrictEqual(cardIds(s), ['multi-line'])
})

await check('B17 「上次使用」范围切换：项目过滤 + 持久化 + 重开保持', async () => {
  const recs = [
    { id: 'top-mem', at: 300 },    // groups [perf, common] → 非当前项目
    { id: 'proj-run', at: 200 },   // groups [D:\work\car_media] → 当前项目
    { id: 'multi-line', at: 100 }, // groups [common] → 非当前项目
  ]
  const s = await bootScene({ state: { ...SAMPLE_STATE, recentCommands: recs } })
  clickGroup(s, 'recent')
  assert.deepStrictEqual(cardIds(s), ['top-mem', 'proj-run', 'multi-line'], '全部范围：按记录倒序')
  // 切到「项目」→ 仅当前项目命令
  const opts = collect(s.contentEl, '.cmd-pad-scope-opt', [])
  opts[0].listeners.click.forEach((fn) => fn({ target: opts[0] }))
  await tick()
  assert.deepStrictEqual(cardIds(s), ['proj-run'], '项目范围：仅当前项目')
  const optsAfter = collect(s.contentEl, '.cmd-pad-scope-opt', [])
  assert.ok(optsAfter[0].className.includes('cmd-pad-scope-opt-active'), '「项目」激活')
  // 范围持久化到 state
  const put = s.statePuts[s.statePuts.length - 1]
  assert.strictEqual(put.recentScope, 'project')
  // 重开 → 范围保持 project（aria-pressed 标注）
  const s2 = await bootScene({ state: { ...SAMPLE_STATE, recentCommands: recs, recentScope: 'project' } })
  clickGroup(s2, 'recent')
  assert.deepStrictEqual(cardIds(s2), ['proj-run'])
  const opts2 = collect(s2.contentEl, '.cmd-pad-scope-opt', [])
  assert.strictEqual(opts2[0].getAttribute('aria-pressed'), 'true', '项目为按下态')
  assert.strictEqual(opts2[1].getAttribute('aria-pressed'), 'false')
})

await check('B18 「上次使用」视图下复制 → lastUsed 指向命令第一个分组（§3.4 语境语义）', async () => {
  const s = await bootScene({ state: { ...SAMPLE_STATE, recentCommands: [{ id: 'proj-run', at: 200 }] } })
  clickGroup(s, 'recent')
  clickCardButton(s, 'proj-run')
  await tick()
  const put = s.statePuts[s.statePuts.length - 1]
  assert.strictEqual(put.lastUsedViewId, 'group:D:\\work\\car_media', 'recent 视图复制 → lastUsed = 命令第一个所属分组')
  // 同时更新 recentCommands（置顶 proj-run）
  assert.strictEqual(put.recentCommands[0].id, 'proj-run')
})

await check('B19 「上次使用」视图：项目范围空态（有记录但当前项目无）+ 删除命令不显示', async () => {
  const s = await bootScene({ state: { ...SAMPLE_STATE, recentCommands: [{ id: 'top-mem', at: 300 }, { id: 'gone-cmd', at: 200 }], recentScope: 'project' } })
  clickGroup(s, 'recent')
  // gone-cmd 已删除跳过；top-mem 非当前项目 → 项目范围空
  const empty = find(s.contentEl, '.cmd-pad-empty')
  assert.strictEqual(empty.textContent, '当前项目还没有使用记录')
  // 切回全部 → top-mem 显示
  const opts = collect(s.contentEl, '.cmd-pad-scope-opt', [])
  opts[1].listeners.click.forEach((fn) => fn({ target: opts[1] }))
  await tick()
  assert.deepStrictEqual(cardIds(s), ['top-mem'])
})

// ════════════════════════════════════════════════════════════════════════
// C. 视觉规范 §6 静态检查
// ════════════════════════════════════════════════════════════════════════

await check('C1 无裸硬编码色值：所有 #hex 均在 --cp-* 兜底链内', async () => {
  const cssStart = CLIENT_SRC.indexOf('var CSS = [')
  assert.ok(cssStart > 0, '找到 CSS 定义')
  const cssEnd = CLIENT_SRC.indexOf('].join', cssStart)
  const css = CLIENT_SRC.slice(cssStart, cssEnd)
  const re = /#[0-9a-fA-F]{3,8}\b/g
  let m
  let bad = []
  while ((m = re.exec(css)) !== null) {
    const ctx = css.slice(Math.max(0, m.index - 80), m.index)
    if (!ctx.includes('--cp-')) bad.push(m[0] + ' @ ' + css.slice(Math.max(0, m.index - 40), m.index))
  }
  assert.deepStrictEqual(bad, [], '裸 hex 色值：' + JSON.stringify(bad))
  // rgba 仅允许中性投影/遮罩（浮起感与压暗，不承载主题色语义）
  const rgba = css.match(/rgba?\([^)]*\)/g) || []
  assert.ok(rgba.length >= 1, '有投影 rgba')
  assert.ok(rgba.every((r) => /rgba\(0,\s*0,\s*0,\s*\.\d+\)/.test(r)), 'rgba 必须为中性黑 rgba(0,0,0,.x)，实际：' + JSON.stringify(rgba))
})

await check('C2 无 emoji（杂项符号/象形文字区）', async () => {
  assert.strictEqual(/[\u{1F300}-\u{1FAFF}]/u.test(CLIENT_SRC), false)
})

await check('C3 类名全带 cmd-pad- 前缀（CSS 选择器 + className 赋值）', async () => {
  const cssStart = CLIENT_SRC.indexOf('var CSS = [')
  const cssEnd = CLIENT_SRC.indexOf('].join', cssStart)
  const css = CLIENT_SRC.slice(cssStart, cssEnd)
  const cssClasses = [...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1])
  const badCss = cssClasses.filter((c) => !c.startsWith('cmd-pad-'))
  assert.deepStrictEqual(badCss, [], 'CSS 非 cmd-pad- 类名：' + JSON.stringify(badCss))
  const jsClasses = [...CLIENT_SRC.matchAll(/className\s*=\s*'([^']+)'/g)].map((m) => m[1])
  const badJs = jsClasses.filter((c) => c.split(/\s+/).some((p) => p !== '' && !p.startsWith('cmd-pad-')))
  assert.deepStrictEqual(badJs, [], 'JS className 非 cmd-pad-：' + JSON.stringify(badJs))
  // 不引用 better-sidebar CSS Modules 哈希类名
  assert.ok(!CLIENT_SRC.includes('nArs4W'), '不引用 better-sidebar 哈希类名')
})

await check('C4 仅 3 处单色 SVG（浮动图标 + 搜索放大镜 + 上次使用范围帮助 ⓘ）；innerHTML 仅用于静态 SVG', async () => {
  const svgCount = (CLIENT_SRC.match(/<svg/g) || []).length
  assert.strictEqual(svgCount, 3, 'SVG 数量应为 3，实际 ' + svgCount)
  const innerHtmlAssigns = (CLIENT_SRC.match(/\.innerHTML\s*=/g) || []).length
  assert.strictEqual(innerHtmlAssigns, 3, 'innerHTML 仅用于 FAB_SVG / SEARCH_SVG / HELP_SVG 三处静态 SVG')
})

await check('C5 z-index 层级：抽屉 30、Toast 90（视觉规范 §4.3）', async () => {
  const cssStart = CLIENT_SRC.indexOf('var CSS = [')
  const cssEnd = CLIENT_SRC.indexOf('].join', cssStart)
  const css = CLIENT_SRC.slice(cssStart, cssEnd)
  assert.ok(/\.cmd-pad-drawer\{[^}]*z-index:30/.test(css.replace(/\n/g, '')), '抽屉 z-index 30')
  assert.ok(/\.cmd-pad-toast\{[^}]*z-index:90/.test(css.replace(/\n/g, '')), 'Toast z-index 90')
})

await check('C7 布局结构：搜索 → 分组横条 → 命令区（上下结构，用户定稿）', async () => {
  const cssStart = CLIENT_SRC.indexOf('var CSS = [')
  const cssEnd = CLIENT_SRC.indexOf('].join', cssStart)
  const css = CLIENT_SRC.slice(cssStart, cssEnd)
  const bodyBlock = /\.cmd-pad-drawer-body\{([^}]*)\}/.exec(css)[1]
  assert.ok(bodyBlock.includes('flex-direction:column'), 'drawer-body 必须纵向排列')
  const searchBlock = /\.cmd-pad-search\{([^}]*)\}/.exec(css)[1]
  assert.ok(searchBlock.includes('flex:none'), '搜索栏 flex:none 不拉伸')
  const groupsBlock = /\.cmd-pad-groups\{([^}]*)\}/.exec(css)[1]
  assert.ok(groupsBlock.includes('flex-wrap:wrap'), '分组区横向换行排列')
  const contentBlock = /\.cmd-pad-content\{([^}]*)\}/.exec(css)[1]
  assert.ok(contentBlock.includes('flex:1'), '命令区占满剩余高度')
  // DOM 结构：search → groups → content（上下）
  const s = await bootScene({})
  const body = s.drawer.children.find((c) => c.className === 'cmd-pad-drawer-body')
  const classes = body.children.map((c) => c.className)
  assert.deepStrictEqual(classes, ['cmd-pad-search', 'cmd-pad-groups', 'cmd-pad-content'], '搜索栏→分组区→命令区')
  // 分组区不占用内容宽度（无左侧竖栏）
  assert.ok(!CLIENT_SRC.includes('cmd-pad-layout'), '不再有 layout 左右分栏容器')
})

await check('C6 纯逻辑面导出完整（testable 钩子）', async () => {
  const s = await bootScene({})
  const t = s.moduleExports.testable
  const expected = ['isProjectGroup', 'pathBase', 'pathParents', 'disambiguateProjectNames', 'aggregateGroups', 'groupStats', 'computeLastUsed', 'buildGroupModel', 'isValidView', 'commandsForView', 'searchMatches', 'allSections', 'getCurrentSessionId', 'highlightText', 'copyText']
  for (const k of expected) assert.ok(typeof t[k] === 'function', `testable.${k} 应存在`)
})

console.log(`\n===== ${passed} passed, ${failed} failed =====`)
process.exit(failed > 0 ? 1 : 0)
