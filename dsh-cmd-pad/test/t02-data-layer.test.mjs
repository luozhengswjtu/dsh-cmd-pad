/**
 * T02 数据层验收 harness（独立运行，零第三方依赖）：
 *   node test/t02-data-layer.test.mjs
 *
 * 覆盖：
 *   A. 迷你 YAML 读写器（解析/序列化/往返/错误面）
 *   B. 原子写 + 串行写队列
 *   C. API 全链路（真实 node:http + 模拟 cordis ctx + 真实插件 apply）：
 *      curl 语义的 GET/PUT、.bak 备份、非法输入不破坏、并发 PUT 不交错
 *   D. Host 头信任围栏（loopback / trustedHosts / cross-site / Origin）
 *   E. yaml 包动态加载优先、迷你回退
 *
 * 退出码 0 = 全部通过；非 0 = 有失败。
 */
import { strict as assert } from 'node:assert'
import { createServer, request as httpRequest } from 'node:http'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { internals, apply } from '../src/index.js'

let passed = 0
let failed = 0
const failures = []
const pending = []

function test(name, fn) {
  pending.push(
    Promise.resolve()
      .then(fn)
      .then(() => {
        passed++
        console.log(`  ok  ${name}`)
      })
      .catch((error) => {
        failed++
        failures.push({ name, error })
        console.log(`FAIL  ${name}\n      ${error && error.stack ? error.stack.split('\n').slice(0, 4).join('\n      ') : error}`)
      }),
  )
}

function tmpDir() {
  return mkdtempSync(join(tmpdir(), 'cmd-pad-t02-'))
}

// ──────────────────────────────────────────────────────────────────────────
// A. 迷你 YAML
// ──────────────────────────────────────────────────────────────────────────
console.log('\n[A] mini YAML')

const CANONICAL_YML = [
  'commands:',
  '  - id: top-mem',
  '    title: 查看整机内存',
  '    cmd: hdc shell "top -n 1 | head -30"',
  '    groups: [性能采集, 常用]',
  '    note: 看 Pss 前先确认整机水位',
  '    tags: [内存, top]',
  '    danger: false',
  '',
].join('\n')

const CANONICAL_OBJ = {
  commands: [
    {
      id: 'top-mem',
      title: '查看整机内存',
      cmd: 'hdc shell "top -n 1 | head -30"',
      groups: ['性能采集', '常用'],
      note: '看 Pss 前先确认整机水位',
      tags: ['内存', 'top'],
      danger: false,
    },
  ],
}

test('parse canonical commands.yml (设计文档 §5.1)', () => {
  assert.deepStrictEqual(internals.miniYamlParse(CANONICAL_YML), CANONICAL_OBJ)
})

test('stringify canonical object == 设计文档 §5.1 格式', () => {
  assert.strictEqual(internals.miniYamlStringify(CANONICAL_OBJ), CANONICAL_YML)
})

test('往返稳定 parse(stringify(x)) === x', () => {
  const cases = [
    CANONICAL_OBJ,
    { commands: [] },
    { commands: [{ id: 'a', title: 't', cmd: 'echo hi', groups: ['g'], danger: true }] },
    { commands: [{ id: 'b', title: '带:冒号', cmd: 'echo "a: b"', groups: ['x'], tags: ['带,逗号', '空 格'], note: '尾部注释 # 测试', danger: false }] },
    { commands: [{ id: 'c', title: 'true', cmd: 'echo 123', groups: ['123'], note: 'null', danger: true }] },
    { a: { b: { c: ['x', 'y'] } }, list: [{ k: 'v' }, { k: 'w' }] },
  ]
  for (const c of cases) {
    assert.deepStrictEqual(internals.miniYamlParse(internals.miniYamlStringify(c)), c)
  }
})

test('注释：整行 / 行尾 / 值后 / 引号内 # 不受影响', () => {
  const yml = [
    '# 文件头注释',
    'commands: # 行尾注释',
    '  - id: a # 值后注释',
    '    title: "带#井号，引号内不是注释"',
    '    cmd: echo a#b',
    '    groups: [x] # 流后注释',
    '',
  ].join('\n')
  const obj = internals.miniYamlParse(yml)
  assert.strictEqual(obj.commands[0].title, '带#井号，引号内不是注释')
  assert.strictEqual(obj.commands[0].cmd, 'echo a#b')
  assert.strictEqual(obj.commands[0].id, 'a')
})

test('引号转义：双引号 \\" \\\\ \\n \\uXXXX；单引号 \'\' 加倍', () => {
  const yml = [
    'a: "say \\"hi\\"\\nnext \\\\ path \\u4e2d"',
    'b: \'it\'\'s ok\'',
    '',
  ].join('\n')
  const obj = internals.miniYamlParse(yml)
  assert.strictEqual(obj.a, 'say "hi"\nnext \\ path 中')
  assert.strictEqual(obj.b, "it's ok")
})

test('流序列：空 / 引号含逗号 / 布尔与 null 元素', () => {
  const yml = 'groups: []\ntags: ["a, b", c]\nflags: [true, false, null]\n'
  const obj = internals.miniYamlParse(yml)
  assert.deepStrictEqual(obj.groups, [])
  assert.deepStrictEqual(obj.tags, ['a, b', 'c'])
  assert.deepStrictEqual(obj.flags, [true, false, null])
})

test('流映射与嵌套', () => {
  const yml = 'meta: {name: x, level: 3}\n'
  assert.deepStrictEqual(internals.miniYamlParse(yml), { meta: { name: 'x', level: '3' } })
})

test('块标量 | 与折叠 >', () => {
  const yml = [
    'cmd: |',
    '  echo line1',
    '  echo line2',
    'note: >',
    '  fold this',
    '  into one',
    '',
  ].join('\n')
  const obj = internals.miniYamlParse(yml)
  assert.strictEqual(obj.cmd, 'echo line1\necho line2\n')
  assert.strictEqual(obj.note, 'fold this into one\n')
})

test('无缩进序列（合法 YAML）', () => {
  const yml = 'items:\n- a\n- b\n'
  assert.deepStrictEqual(internals.miniYamlParse(yml), { items: ['a', 'b'] })
})

test('布尔 / null 推断；数字保持字符串', () => {
  const yml = 'a: true\nb: False\nc: NULL\nd: ~\ne: 123\nf: 1.5\n'
  const obj = internals.miniYamlParse(yml)
  assert.strictEqual(obj.a, true)
  assert.strictEqual(obj.b, false)
  assert.strictEqual(obj.c, null)
  assert.strictEqual(obj.d, null)
  assert.strictEqual(obj.e, '123') // 数字保持字符串（schema 面向）
  assert.strictEqual(obj.f, '1.5')
})

test('BOM 与 CRLF', () => {
  const yml = '\uFEFFa: 1\r\nb: 2\r\n'
  assert.deepStrictEqual(internals.miniYamlParse(yml), { a: '1', b: '2' })
})

test('空文档 / 根裸标量 / 根序列', () => {
  assert.strictEqual(internals.miniYamlParse(''), null)
  assert.strictEqual(internals.miniYamlParse('   \n# 只有注释\n'), null)
  assert.strictEqual(internals.miniYamlParse('hello'), 'hello')
  assert.deepStrictEqual(internals.miniYamlParse('- a\n- b\n'), ['a', 'b'])
})

test('错误面：坏缩进 / 未闭合引号 / 未闭合流 / 重复键 / 引号后多余内容', () => {
  assert.throws(() => internals.miniYamlParse('a:\n    b: 1\n  c: 2\n'), /indentation/)
  assert.throws(() => internals.miniYamlParse('a: "unclosed\n'), /unterminated/)
  assert.throws(() => internals.miniYamlParse('a: [1, 2\n'), /unterminated/)
  assert.throws(() => internals.miniYamlParse('a: 1\na: 2\n'), /duplicate key/)
  assert.throws(() => internals.miniYamlParse('a: "x" junk\n'), /trailing content/)
})

test('writer 对歧义字符串加引号：true/123/含 ": "/含 " #"', () => {
  assert.strictEqual(internals.miniYamlStringify({ a: 'true' }), 'a: "true"\n')
  assert.strictEqual(internals.miniYamlStringify({ a: '123' }), 'a: "123"\n')
  assert.strictEqual(internals.miniYamlStringify({ a: 'x: y' }), 'a: "x: y"\n')
  assert.strictEqual(internals.miniYamlStringify({ a: 'echo #x' }), 'a: "echo #x"\n')
  assert.strictEqual(internals.miniYamlStringify({ a: '多\n行' }), 'a: "多\\n行"\n')
})

// ──────────────────────────────────────────────────────────────────────────
// B. 原子写 + 串行队列
// ──────────────────────────────────────────────────────────────────────────
console.log('\n[B] atomic write + serial queue')

test('原子写：文件正确落盘、无残留 .tmp', async () => {
  const dir = tmpDir()
  const target = join(dir, 'commands.yml')
  await internals.writeFileAtomic(target, 'hello')
  assert.strictEqual(readFileSync(target, 'utf8'), 'hello')
  await internals.writeFileAtomic(target, 'world')
  assert.strictEqual(readFileSync(target, 'utf8'), 'world')
  const leftovers = readdirSync(dir).filter((f) => f.endsWith('.tmp'))
  assert.deepStrictEqual(leftovers, [])
})

test('串行队列：并发入队按序执行', async () => {
  const queue = internals.createWriteQueue()
  const order = []
  const tasks = []
  for (let k = 0; k < 10; k++) {
    tasks.push(queue.enqueue(async () => {
      order.push(`start-${k}`)
      await new Promise((r) => setTimeout(r, Math.random() * 5))
      order.push(`end-${k}`)
    }))
  }
  await Promise.all(tasks)
  for (let k = 0; k < 10; k++) {
    assert.strictEqual(order[k * 2], `start-${k}`)
    assert.strictEqual(order[k * 2 + 1], `end-${k}`)
  }
})

// ──────────────────────────────────────────────────────────────────────────
// 环境：模拟 cordis ctx + 真实 node:http 服务器（复刻 webServer 最长前缀匹配）
// ──────────────────────────────────────────────────────────────────────────
function makeMockCtx({ webRuntime, sessions } = {}) {
  return {
    baseUrl: pathToFileURL(process.cwd() + '/').href,
    logger: { warn() {}, error() {} },
    get(name) {
      if (name === 'webRuntime') return webRuntime
      if (name === 'sessions') return sessions
      return undefined
    },
    effect(fn) {
      const dispose = fn()
      return typeof dispose === 'function' ? dispose : undefined
    },
  }
}

function startApiServer(pluginConfig, env = {}) {
  const prefixes = new Map()
  const exact = new Map()
  const webServer = {
    host: '127.0.0.1',
    port: 0,
    register(route) {
      const table = route.kind === 'exact' ? exact : prefixes
      if (table.has(route.path)) throw new Error(`duplicate ${route.kind} route ${route.path}`)
      table.set(route.path, route)
      return () => { table.delete(route.path) }
    },
  }
  const ctx = makeMockCtx(env)
  ctx.webServer = webServer
  apply(ctx, pluginConfig)

  const server = createServer(async (req, res) => {
    let pathname
    try {
      pathname = new URL(req.url ?? '/', 'http://x').pathname
    } catch {
      res.writeHead(400)
      res.end()
      return
    }
    let route = exact.get(pathname)
    if (route === undefined) {
      let best
      for (const [prefix, r] of prefixes) {
        if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) continue
        if (best === undefined || prefix.length > best.len) best = { r, len: prefix.length }
      }
      route = best?.r
    }
    if (route === undefined) {
      res.writeHead(404)
      res.end()
      return
    }
    try {
      await route.handler(req, res)
    } catch (error) {
      if (!res.headersSent) {
        res.writeHead(400)
        res.end()
      } else {
        res.destroy()
      }
    }
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        origin: `http://127.0.0.1:${server.address().port}`,
        server,
      })
    })
  })
}

async function api(server, path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${server.origin}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* non-json */ }
  return { status: res.status, json, text }
}

async function withApiServer(fn, options = {}) {
  const dir = join(tmpDir(), 'data')
  mkdirSync(dir, { recursive: true })
  const pluginConfig = { ...options.pluginConfig }
  if (pluginConfig.dataDir === undefined) pluginConfig.dataDir = dir
  const server = await startApiServer(pluginConfig, options.env)
  try {
    return await fn({ server, dir })
  } finally {
    server.server.close()
  }
}

// ──────────────────────────────────────────────────────────────────────────
// C. API 全链路
// ──────────────────────────────────────────────────────────────────────────
console.log('\n[C] API end-to-end')

test('GET 空库：默认 { commands: [] } + state {} + cwd null + mtime null', async () => {
  await withApiServer(async ({ server }) => {
    const r = await api(server, '/cmd-pad/api/library')
    assert.strictEqual(r.status, 200)
    assert.deepStrictEqual(r.json.library, { commands: [] })
    assert.deepStrictEqual(r.json.state, {})
    assert.strictEqual(r.json.cwd, null)
    assert.strictEqual(r.json.mtime, null)
  })
})

test('手改 yml → GET 读回（完成定义 1）', async () => {
  await withApiServer(async ({ server, dir }) => {
    writeFileSync(join(dir, 'commands.yml'), CANONICAL_YML, 'utf8')
    const r = await api(server, '/cmd-pad/api/library')
    assert.strictEqual(r.status, 200)
    assert.deepStrictEqual(r.json.library, CANONICAL_OBJ)
    assert.strictEqual(typeof r.json.mtime, 'number')
  })
})

test('PUT library → 文件正确 + 生成 .bak（完成定义 1）', async () => {
  await withApiServer(async ({ server, dir }) => {
    const first = { commands: [{ id: 'a', title: 'A', cmd: 'echo a', groups: ['g'] }] }
    let r = await api(server, '/cmd-pad/api/library', { method: 'PUT', body: { library: first } })
    assert.strictEqual(r.status, 200)
    assert.strictEqual(typeof r.json.mtime, 'number')
    // 文件内容精确匹配序列化文本
    const expected = internals.miniYamlStringify(first)
    assert.strictEqual(readFileSync(join(dir, 'commands.yml'), 'utf8'), expected)
    // 首次写入（无既有文件）不产生 .bak
    assert.ok(!existsSync(join(dir, 'commands.yml.bak')))

    // 第二次 PUT → .bak 保留第一次内容
    const second = { commands: [{ id: 'b', title: 'B', cmd: 'echo b', groups: ['g'] }] }
    r = await api(server, '/cmd-pad/api/library', { method: 'PUT', body: { library: second } })
    assert.strictEqual(r.status, 200)
    assert.strictEqual(readFileSync(join(dir, 'commands.yml.bak'), 'utf8'), expected)
    assert.strictEqual(readFileSync(join(dir, 'commands.yml'), 'utf8'), internals.miniYamlStringify(second))
  })
})

test('GET 与 PUT 往返一致', async () => {
  await withApiServer(async ({ server }) => {
    const lib = {
      commands: [
        { id: 'x', title: 't1', cmd: 'echo 1', groups: ['常用'], tags: ['a'], note: 'n', danger: true },
        { id: 'y', title: 't2', cmd: 'echo 2', groups: ['常用', '项目'], danger: false },
      ],
    }
    await api(server, '/cmd-pad/api/library', { method: 'PUT', body: { library: lib } })
    const r = await api(server, '/cmd-pad/api/library')
    assert.deepStrictEqual(r.json.library, lib)
  })
})

test('非法 JSON / 错误 schema / 非 JSON content-type → 不破坏既有文件（完成定义 2）', async () => {
  await withApiServer(async ({ server, dir }) => {
    const good = { commands: [{ id: 'a', title: 'A', cmd: 'echo a', groups: ['g'] }] }
    await api(server, '/cmd-pad/api/library', { method: 'PUT', body: { library: good } })
    const before = readFileSync(join(dir, 'commands.yml'), 'utf8')
    const beforeBak = existsSync(join(dir, 'commands.yml.bak')) ? readFileSync(join(dir, 'commands.yml.bak'), 'utf8') : null

    // 非法 JSON 文本
    const res1 = await fetch(`${server.origin}/cmd-pad/api/library`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: '{ not json',
    })
    assert.strictEqual(res1.status, 400)

    // 错误 schema：commands 非数组 / 缺 cmd / groups 含非法项 / danger 非布尔
    const bad = [
      { library: { commands: 'nope' } },
      { library: { commands: [{ id: 'a', title: 'A', cmd: '' }] } },
      { library: { commands: [{ id: 'a', title: 'A', cmd: 'x', groups: ['ok', ''] }] } },
      { library: null },
      { library: { commands: [{ id: 'a', title: 'A', cmd: 'x', danger: 'yes' }] } },
    ]
    for (const payload of bad) {
      const r = await api(server, '/cmd-pad/api/library', { method: 'PUT', body: payload })
      assert.strictEqual(r.status, 400)
    }

    // 非 JSON content-type
    const res2 = await fetch(`${server.origin}/cmd-pad/api/library`, {
      method: 'PUT',
      headers: { 'content-type': 'text/plain' },
      body: 'hello',
    })
    assert.strictEqual(res2.status, 415)

    // 文件与 .bak 均未被破坏
    assert.strictEqual(readFileSync(join(dir, 'commands.yml'), 'utf8'), before)
    const afterBak = existsSync(join(dir, 'commands.yml.bak')) ? readFileSync(join(dir, 'commands.yml.bak'), 'utf8') : null
    assert.strictEqual(afterBak, beforeBak)
  })
})

test('commands.yml 损坏：无 .bak → 500；有合法 .bak → 回退读回（完成定义 2）', async () => {
  await withApiServer(async ({ server, dir }) => {
    const first = { commands: [{ id: 'a', title: 'A', cmd: 'echo a', groups: ['g'] }] }
    const second = { commands: [{ id: 'b', title: 'B', cmd: 'echo b', groups: ['g'] }] }
    await api(server, '/cmd-pad/api/library', { method: 'PUT', body: { library: first } })
    await api(server, '/cmd-pad/api/library', { method: 'PUT', body: { library: second } })
    // 此时 .bak = first

    // 破坏主文件（保留合法 .bak）
    writeFileSync(join(dir, 'commands.yml'), 'commands:\n  - id: "broken\n    cmd: [unclosed\n', 'utf8')
    const r = await api(server, '/cmd-pad/api/library')
    assert.strictEqual(r.status, 200)
    assert.strictEqual(r.json.recovered, true)
    assert.deepStrictEqual(r.json.library, first)
    assert.match(r.json.warning, /\.bak/)

    // 主文件与 .bak 都损坏 → 500，且不写入任何东西
    writeFileSync(join(dir, 'commands.yml'), 'key: "unclosed\n', 'utf8')
    writeFileSync(join(dir, 'commands.yml.bak'), '[1, 2\n', 'utf8')
    const r2 = await api(server, '/cmd-pad/api/library')
    assert.strictEqual(r2.status, 500)
  })
})

test('state 增量合并（含嵌套 viewLastUsedAt）', async () => {
  await withApiServer(async ({ server, dir }) => {
    await api(server, '/cmd-pad/api/state', { method: 'PUT', body: { pinnedGroups: ['常用'], viewLastUsedAt: { 'g:a': 1 } } })
    await api(server, '/cmd-pad/api/state', { method: 'PUT', body: { lastUsedViewId: 'g:常用', viewLastUsedAt: { 'g:b': 2 } } })
    const r = await api(server, '/cmd-pad/api/library')
    assert.deepStrictEqual(r.json.state, {
      pinnedGroups: ['常用'],
      lastUsedViewId: 'g:常用',
      viewLastUsedAt: { 'g:a': 1, 'g:b': 2 },
    })
    // state.json 人读友好
    const raw = readFileSync(join(dir, 'state.json'), 'utf8')
    assert.match(raw, /\n  "/)
  })
})

test('state 非法输入 → 400 且不落盘', async () => {
  await withApiServer(async ({ server, dir }) => {
    await api(server, '/cmd-pad/api/state', { method: 'PUT', body: { pinnedGroups: ['x'] } })
    const before = readFileSync(join(dir, 'state.json'), 'utf8')
    for (const payload of [null, [1, 2], 'str']) {
      const r = await api(server, '/cmd-pad/api/state', { method: 'PUT', body: payload })
      assert.strictEqual(r.status, 400)
    }
    assert.strictEqual(readFileSync(join(dir, 'state.json'), 'utf8'), before)
  })
})

test('并发 20 个 PUT library 不交错损坏（完成定义 3）', async () => {
  await withApiServer(async ({ server, dir }) => {
    const payloads = []
    for (let k = 0; k < 20; k++) {
      payloads.push({
        library: {
          commands: [
            { id: `c${k}`, title: `T${k}`, cmd: `echo ${k}`.repeat(k + 1), groups: [`g${k}`], tags: [`t${k}`] },
          ],
        },
      })
    }
    const results = await Promise.all(payloads.map((p) => api(server, '/cmd-pad/api/library', { method: 'PUT', body: p })))
    for (const r of results) assert.strictEqual(r.status, 200)

    // 最终文件必须恰好等于某个 payload 的完整序列化（无交错）
    const finalText = readFileSync(join(dir, 'commands.yml'), 'utf8')
    const serialized = payloads.map((p) => internals.miniYamlStringify(p.library))
    assert.ok(serialized.includes(finalText), 'final file must be exactly one complete payload')
    // 且可解析、与 GET 一致
    const r = await api(server, '/cmd-pad/api/library')
    assert.strictEqual(r.status, 200)
    assert.strictEqual(r.json.library.commands.length, 1)
  })
})

test('并发 20 个 PUT state：所有键最终都在（不丢键）', async () => {
  await withApiServer(async ({ server }) => {
    await Promise.all(Array.from({ length: 20 }, (_, k) => api(server, '/cmd-pad/api/state', { method: 'PUT', body: { [`key${k}`]: k } })))
    const r = await api(server, '/cmd-pad/api/library')
    const state = r.json.state
    for (let k = 0; k < 20; k++) assert.strictEqual(state[`key${k}`], k)
    assert.strictEqual(Object.keys(state).length, 20)
  })
})

test('未知字段在 PUT 往返中保留（schema 无关）', async () => {
  await withApiServer(async ({ server }) => {
    const lib = { commands: [{ id: 'a', title: 'A', cmd: 'x', groups: ['g'], customNote: '保留' }], meta: { source: 'hand' } }
    await api(server, '/cmd-pad/api/library', { method: 'PUT', body: { library: lib } })
    const r = await api(server, '/cmd-pad/api/library')
    assert.deepStrictEqual(r.json.library, lib)
  })
})

test('路由：404 / 405 / 超大 body', async () => {
  await withApiServer(async ({ server }) => {
    let r = await api(server, '/cmd-pad/api/nope')
    assert.strictEqual(r.status, 404)
    r = await api(server, '/cmd-pad/api/library', { method: 'DELETE' })
    assert.strictEqual(r.status, 405)
    r = await api(server, '/cmd-pad/api/state') // GET state → 405
    assert.strictEqual(r.status, 405)
    r = await api(server, '/cmd-pad')
    assert.strictEqual(r.status, 404)

    const res = await fetch(`${server.origin}/cmd-pad/api/library`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ library: { commands: [{ id: 'x', title: 'x', cmd: 'x', groups: [], padding: 'a'.repeat(1024 * 1024 + 10) }] } }),
    })
    assert.strictEqual(res.status, 413)
  })
})

test('GET ?sessionId= → 软探测 sessions 回填 cwd', async () => {
  const sessions = {
    get(id) {
      if (id === 's1') return { header: { cwd: 'D:\\work\\car_media' } }
      if (id === 's2') return { header: {} }
      return undefined
    },
  }
  await withApiServer(async ({ server }) => {
    let r = await api(server, '/cmd-pad/api/library?sessionId=s1')
    assert.strictEqual(r.json.cwd, 'D:\\work\\car_media')
    r = await api(server, '/cmd-pad/api/library?sessionId=s2')
    assert.strictEqual(r.json.cwd, null)
    r = await api(server, '/cmd-pad/api/library?sessionId=missing')
    assert.strictEqual(r.json.cwd, null)
    r = await api(server, '/cmd-pad/api/library')
    assert.strictEqual(r.json.cwd, null)
  }, { env: { sessions } })
})

// ──────────────────────────────────────────────────────────────────────────
// D. Host 头信任围栏
// ──────────────────────────────────────────────────────────────────────────
console.log('\n[D] Host header trust fence')

/** 裸 HTTP GET：可控任意请求头（fetch/undici 会忽略自定义 Host）。 */
function rawGet(server, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      host: '127.0.0.1',
      port: server.port,
      path,
      method: 'GET',
      headers,
    }, (res) => {
      let body = ''
      res.on('data', (c) => { body += c })
      res.on('end', () => resolve({ status: res.statusCode, body }))
    })
    req.on('error', reject)
    req.end()
  })
}

test('围栏：loopback 放行 / 恶意 Host、cross-site、跨源 Origin 拒绝', async () => {
  await withApiServer(async ({ server }) => {
    // 正常 loopback → 200
    let r = await api(server, '/cmd-pad/api/library')
    assert.strictEqual(r.status, 200)

    // localhost 别名 → 200
    r = await rawGet(server, '/cmd-pad/api/library', { host: `localhost:${server.port}` })
    assert.strictEqual(r.status, 200)

    // 恶意 Host（DNS rebinding 面）→ 403
    r = await rawGet(server, '/cmd-pad/api/library', { host: 'evil.example.com' })
    assert.strictEqual(r.status, 403)

    // cross-site fetch metadata → 403
    r = await rawGet(server, '/cmd-pad/api/library', { host: `127.0.0.1:${server.port}`, 'sec-fetch-site': 'cross-site' })
    assert.strictEqual(r.status, 403)

    // 跨源 Origin → 403
    r = await rawGet(server, '/cmd-pad/api/library', { host: `127.0.0.1:${server.port}`, origin: 'http://evil.example.com' })
    assert.strictEqual(r.status, 403)

    // 同源 Origin → 200
    r = await rawGet(server, '/cmd-pad/api/library', { host: `127.0.0.1:${server.port}`, origin: `http://127.0.0.1:${server.port}` })
    assert.strictEqual(r.status, 200)

    // 同源 Origin（localhost 形态）→ 200
    r = await rawGet(server, '/cmd-pad/api/library', { host: `localhost:${server.port}`, origin: `http://localhost:${server.port}` })
    assert.strictEqual(r.status, 200)
  })
})

test('围栏单元：缺失 / 空 / 不可解析 Host 一律拒绝（HTTP 客户端总会带 Host，此处直测判定函数）', () => {
  const ctx = makeMockCtx({ webRuntime: { trustedHosts: [] } })
  assert.strictEqual(internals.isTrustedRequest({ headers: {} }, ctx), false)
  assert.strictEqual(internals.isTrustedRequest({ headers: { host: '' } }, ctx), false)
  assert.strictEqual(internals.isTrustedRequest({ headers: { host: 'not a host::' } }, ctx), false)
  assert.strictEqual(internals.isTrustedRequest({ headers: { host: 'evil.example.com' } }, ctx), false)
  assert.strictEqual(internals.isTrustedRequest({ headers: { host: '127.0.0.1:3080' } }, ctx), true)
  assert.strictEqual(internals.isTrustedRequest({ headers: { host: '[::1]:3080' } }, ctx), true)
  assert.strictEqual(internals.isTrustedRequest({ headers: { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080' } }, ctx), true)
  assert.strictEqual(internals.isTrustedRequest({ headers: { host: '127.0.0.1:3080', origin: 'http://evil.com' } }, ctx), false)
  assert.strictEqual(internals.isTrustedRequest({ headers: { host: '127.0.0.1:3080', 'sec-fetch-site': 'cross-site' } }, ctx), false)
  // LAN：trustedHosts 命中才放行
  const lan = makeMockCtx({ webRuntime: { trustedHosts: ['192.168.1.5'] } })
  assert.strictEqual(internals.isTrustedRequest({ headers: { host: '192.168.1.5:3080' } }, lan), true)
  assert.strictEqual(internals.isTrustedRequest({ headers: { host: '192.168.1.6:3080' } }, lan), false)
})

test('围栏：LAN 绑定场景 webRuntime.trustedHosts 命中才放行', async () => {
  // 无 trustedHosts：LAN IP 拒绝
  await withApiServer(async ({ server }) => {
    const res = await rawGet(server, '/cmd-pad/api/library', { host: `192.168.1.5:${server.port}` })
    assert.strictEqual(res.status, 403)
  }, { env: { webRuntime: { trustedHosts: [] } } })

  // 命中 trustedHosts（port-less 匹配任意端口）：放行
  await withApiServer(async ({ server }) => {
    const res = await rawGet(server, '/cmd-pad/api/library', { host: `192.168.1.5:${server.port}` })
    assert.strictEqual(res.status, 200)
  }, { env: { webRuntime: { trustedHosts: ['192.168.1.5'] } } })

  // 精确端口条目：端口不同 → 拒绝
  await withApiServer(async ({ server }) => {
    const res = await rawGet(server, '/cmd-pad/api/library', { host: `192.168.1.5:${server.port}` })
    assert.strictEqual(res.status, 403)
  }, { env: { webRuntime: { trustedHosts: ['192.168.1.5:9999'] } } })
})

// ──────────────────────────────────────────────────────────────────────────
// E. yaml 包动态加载优先 + 迷你回退
// ──────────────────────────────────────────────────────────────────────────
console.log('\n[E] yaml package dynamic load')

test('yaml 包可解析 → engine=yaml；不可解析 → engine=mini', () => {
  const fakeDir = tmpDir()
  mkdirSync(join(fakeDir, 'node_modules', 'yaml'), { recursive: true })
  writeFileSync(join(fakeDir, 'node_modules', 'yaml', 'package.json'), JSON.stringify({ name: 'yaml', version: '0.0.0', main: 'index.js' }))
  writeFileSync(join(fakeDir, 'node_modules', 'yaml', 'index.js'), 'module.exports = { parse: (t) => ({ fromYamlPkg: t }), stringify: (v) => "yaml:" + JSON.stringify(v) }')
  const parser = internals.loadYamlParser({ baseUrl: pathToFileURL(fakeDir + '/').href })
  assert.strictEqual(parser.engine, 'yaml')
  assert.deepStrictEqual(parser.parse('abc'), { fromYamlPkg: 'abc' })
  assert.strictEqual(parser.stringify({ a: 1 }), 'yaml:{"a":1}')

  const mini = internals.loadYamlParser({ baseUrl: pathToFileURL(tmpDir() + '/').href })
  assert.strictEqual(mini.engine, 'mini')
  assert.strictEqual(mini.stringify({ a: 'b' }), 'a: b\n')
})

// ──────────────────────────────────────────────────────────────────────────
;(async () => {
  await Promise.all(pending)
  console.log(`\n===== ${passed} passed, ${failed} failed =====`)
  if (failed > 0) {
    for (const f of failures) console.error(`\nFAILED: ${f.name}\n${f.error.stack}`)
    process.exit(1)
  }
  process.exit(0)
})()
