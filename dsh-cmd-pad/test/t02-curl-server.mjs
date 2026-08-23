/**
 * T02 curl 实证用最小服务：加载插件真实 apply() + 模拟 webServer，监听本机端口。
 * 用法：node test/t02-curl-server.mjs <dataDir> [port]
 * 启动后打印 "LISTEN <port>" 并持续服务，Ctrl+C / SIGTERM 退出。
 */
import { createServer } from 'node:http'
import { apply } from '../src/index.js'

const dataDir = process.argv[2]
const port = Number(process.argv[3] ?? 0)

const prefixes = new Map()
const ctx = {
  logger: { warn: (...a) => console.error('[warn]', ...a), error: (...a) => console.error('[error]', ...a) },
  get(name) {
    if (name === 'webRuntime') return { trustedHosts: [] }
    return undefined
  },
  effect(fn) {
    const dispose = fn()
    return typeof dispose === 'function' ? dispose : undefined
  },
}
ctx.webServer = {
  host: '127.0.0.1',
  port: 0,
  register(route) {
    if (route.kind !== 'prefix') throw new Error('only prefix supported')
    prefixes.set(route.path, route)
    return () => { prefixes.delete(route.path) }
  },
}
apply(ctx, { dataDir })

const server = createServer(async (req, res) => {
  let pathname
  try {
    pathname = new URL(req.url ?? '/', 'http://x').pathname
  } catch {
    res.writeHead(400)
    res.end()
    return
  }
  let best
  for (const [prefix, r] of prefixes) {
    if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) continue
    if (best === undefined || prefix.length > best.len) best = { r, len: prefix.length }
  }
  if (best === undefined) {
    res.writeHead(404)
    res.end()
    return
  }
  try {
    await best.r.handler(req, res)
  } catch (error) {
    if (!res.headersSent) {
      res.writeHead(400)
      res.end()
    } else {
      res.destroy()
    }
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`LISTEN ${server.address().port}`)
})

process.on('SIGTERM', () => server.close(() => process.exit(0)))
process.on('SIGINT', () => server.close(() => process.exit(0)))
