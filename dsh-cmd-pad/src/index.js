/**
 * dsh-cmd-pad host half（T01 最小骨架）
 *
 * 职责（随任务推进逐步填充）：
 *   - T01：/cmd-pad 前缀路由就绪（空实现，占位 404）；
 *   - T02：/cmd-pad/api/library（GET/PUT）+ /cmd-pad/api/state（PUT）数据层。
 *
 * 软依赖说明：host 半只依赖 webServer（DSH 核心服务），与 better-sidebar
 * 无关——better-sidebar 只在 client 半探测（接入规范 §1.3）。client 半由
 * `dsh.client` 声明 + `exports["./client"]` 走 client-modules 通道供应，
 * 不经本文件。
 */

/** Plugin identity（cordis loader 显示名 / 日志前缀）。 */
export const name = 'dsh-cmd-pad'

/** Host 半必需服务：webServer（前缀路由注册）。 */
export const inject = ['webServer']

/**
 * 插件主体。
 * @param ctx - host plugin context（webServer 等）。
 */
export function apply(ctx) {
  // /cmd-pad 前缀路由（T01 空骨架：占位 404，T02 起实现具体 API）
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/cmd-pad',
    handler: async (req, res) => {
      // T02 将在此按 pathname 分发 /cmd-pad/api/*，并套 Host 头信任围栏。
      res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({
        ok: false,
        error: { code: 'not-implemented', message: 'cmd-pad API arrives in T02' },
      }))
    },
  }), 'dsh-cmd-pad: /cmd-pad routes')
}
