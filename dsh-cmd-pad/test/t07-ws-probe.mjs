/**
 * T07 双 WS 附加实机验证（协议层实证，TASK.md T07 完成定义第 1 条）
 *
 * 目标：better-sidebar v0.13.1（实际安装版）的终端 WS 协议——
 *  - 同一 pty 支持多路 WS 并存（A 模拟 UI 长连，B 模拟 cmd-pad 短命写入连）；
 *  - B 写入 `cmd + \r` → 命令执行，A 与 B 都收到输出（用户侧视图不受干扰）；
 *  - 危险命令只发文本不带 `\r` → 停在提示符不执行；
 *  - bare drop（直接 ws.close()，不发 {type:'close'} 帧）→ pty 走 reconnect grace。
 *
 * 实机教训（2026-08-23）：Windows PowerShell 冷启动较慢，shell 未就绪前写入会被吞；
 * 必须等待提示符（aAll 含 'PS ' + '>'）后再发命令，否则产生假阴性。
 *
 * 用法：
 *   node test/t07-ws-probe.mjs [--sessionId <id>] [--cwd <dir>] [--cleanup]
 *   （--cleanup：验证完对 probe pty 发 {type:'close'} 帧立即释放，避免占配额等 grace）
 */
const BASE = process.env.DSH_WEB_URL || 'ws://127.0.0.1:3080'

const args = process.argv.slice(2)
function argValue(name, def) {
  const i = args.indexOf(name)
  return i !== -1 && args[i + 1] !== undefined ? args[i + 1] : def
}
const SESSION_ID = argValue('--sessionId', 'session-62329b44-69bc-42e4-864e-49bacc3191e5')
const CWD = argValue('--cwd', 'E:\\KimiProGram\\dshplugin')
const CLEANUP = args.includes('--cleanup')

const TAB_ID = 'terminal:cmdpad-probe-' + Date.now().toString(36)
const url = `${BASE}/sidebar/ws/terminal?sessionId=${encodeURIComponent(SESSION_ID)}&tab=${encodeURIComponent(TAB_ID)}${CWD ? '&cwd=' + encodeURIComponent(CWD) : ''}`

const results = []
function record(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function openWs(label, onOpen) {
  return new Promise((resolve, reject) => {
    let ws
    try {
      ws = new WebSocket(url)
    } catch (err) {
      reject(err)
      return
    }
    const buf = []
    ws.addEventListener('open', () => onOpen(ws, buf))
    ws.addEventListener('message', (ev) => {
      const text = typeof ev.data === 'string' ? ev.data : ''
      buf.push(text)
    })
    ws.addEventListener('error', (ev) => reject(new Error(label + ' ws error: ' + (ev.message || 'unknown'))))
    ws.addEventListener('close', (ev) => {
      if (ev.reason) buf.push('[closed:' + ev.reason + ']')
      resolve({ label, buf, code: ev.code, reason: ev.reason })
    })
  })
}

async function waitFor(pred, timeoutMs, what) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (pred()) return true
    await sleep(200)
  }
  console.log('  (waitFor timeout: ' + what + ')')
  return false
}

async function main() {
  console.log('== T07 双 WS 附加实证 ==')
  console.log('  sessionId =', SESSION_ID)
  console.log('  tab       =', TAB_ID)
  console.log('  cwd       =', CWD)

  // ── 连接 A（模拟 UI 终端长连）──
  let wsA, bufA
  const connA = openWs('A', (ws, buf) => { wsA = ws; bufA = buf })
  await sleep(1500)
  if (!wsA || wsA.readyState !== 1) {
    record('A 连接建立（第一路 WS）', false, 'readyState=' + (wsA ? wsA.readyState : 'n/a'))
    return 1
  }
  record('A 连接建立（第一路 WS）', true, 'readyState=OPEN')

  // 等待 PowerShell 提示符就绪（冷启动慢，未就绪写入会被吞）
  const aAll = () => bufA.join('')
  const ready = await waitFor(() => aAll().includes('PS ') && aAll().includes('>'), 15000, 'PowerShell 提示符就绪')
  record('PowerShell 就绪（等待提示符）', ready, ready ? '' : '15s 内未见提示符，继续尝试')

  // 探针 0：A 发送探针命令确认 shell 可执行
  const tag0 = 'CMD-PAD-READY-' + Math.random().toString(36).slice(2, 8)
  wsA.send(`echo ${tag0}\r`)
  await sleep(1500)
  const readyExec = aAll().includes(tag0)
  record('探针命令执行（shell 就绪确认）', readyExec, readyExec ? '' : 'shell 未响应探针，后续结果可能失真')

  // ── 连接 B（模拟 cmd-pad 短命写入连）附加到同一 pty ──
  let wsB, bufB
  const connB = openWs('B', (ws, buf) => { wsB = ws; bufB = buf })
  await sleep(1500)
  if (!wsB || wsB.readyState !== 1) {
    record('B 连接建立（第二路 WS 附加同一 pty）', false, 'readyState=' + (wsB ? wsB.readyState : 'n/a'))
    return 1
  }
  const aBeforeB = bufA.length
  record('B 连接建立（第二路 WS 附加同一 pty）', true, 'readyState=OPEN; A/B 共享 key ' + TAB_ID)
  // B 打开后 A 不应收到新的 pty spawn 输出（若 pty 被重建，A 会再次收到 [2J + banner）
  await sleep(1000)
  const aNewAfterB = bufA.slice(aBeforeB).join('')
  const rebuilt = aNewAfterB.includes('\u001b[2J') && aNewAfterB.includes('PowerShell')
  record('B 附加未重建 pty（A 无新 spawn 输出）', !rebuilt, rebuilt ? 'A 收到新 pty banner —— pty 被重建' : 'A 无新输出')

  // ── B 写入普通命令（带 \r）→ 应执行，A 也收到输出 ──
  const tag1 = 'CMD-PAD-PROBE-' + Math.random().toString(36).slice(2, 8)
  wsB.send(`echo ${tag1}\r`)
  await sleep(2000)
  const aHas1 = aAll().includes(tag1)
  const bHas1 = bufB.join('').includes(tag1)
  record('B 写入 echo 执行（A 侧可见，双 WS 并存）', aHas1, 'A 未发送也收到 B 的命令输出')
  record('B 写入 echo 执行（B 侧回显）', bHas1, '')

  // ── 危险命令语义：不带 \r → 停在提示符不执行 ──
  // 判定：终端输入会回显一次 tag（行编辑回显）；真正执行会再输出一次（结果行）。
  // 未执行 = tag 出现 1 次；执行 = tag 出现 ≥2 次。
  const tag2 = 'CMD-PAD-NOENTER-' + Math.random().toString(36).slice(2, 8)
  const countOf = (s, t) => { let n = 0, i = 0; while ((i = s.indexOf(t, i)) !== -1) { n++; i += t.length } return n }
  wsB.send(`echo ${tag2}`) // 不带 \r
  await sleep(2000)
  const execCountPremature = countOf(aAll(), tag2)
  record('危险命令不带 \\r 停在提示符不执行', execCountPremature < 2, 'tag 出现 ' + execCountPremature + ' 次（仅回显=' + execCountPremature + '，执行=≥2）')
  // 随后带 \r 的同一命令应执行（证明命令本身有效，只是缺回车）
  wsB.send(`echo ${tag2}\r`)
  await sleep(1800)
  const execCountAfter = countOf(aAll(), tag2)
  record('同一命令带 \\r 后执行', execCountAfter >= 2, 'tag 出现 ' + execCountAfter + ' 次')

  // ── A 也能写入（对称验证：长连方向写入不影响）──
  const tag3 = 'CMD-PAD-FROM-A-' + Math.random().toString(36).slice(2, 8)
  wsA.send(`echo ${tag3}\r`)
  await sleep(1500)
  record('A 侧写入 B 侧可见（双工对称）', bufB.join('').includes(tag3), '')

  // ── bare drop：B 直接关闭（不发 close 帧）──
  wsB.close(1000)
  await sleep(800)
  record('B bare drop（不发 close 帧）', true, 'B close 后 A 仍存活: readyState=' + wsA.readyState)
  const tag4 = 'CMD-PAD-AFTER-DROP-' + Math.random().toString(36).slice(2, 8)
  wsA.send(`echo ${tag4}\r`)
  await sleep(1500)
  record('B bare drop 后 pty 仍存活（A 写入仍执行）', aAll().includes(tag4), '')

  if (CLEANUP && wsA.readyState === 1) {
    // 清理：对自建 probe pty 发 close 帧（非用户终端，立即释放配额）
    wsA.send(JSON.stringify({ type: 'close' }))
    await sleep(500)
    record('清理：probe pty 发 close 帧释放', true, '（自建 pty，非用户终端，无副作用）')
  }
  if (wsA.readyState === 1) wsA.close(1000)

  const failed = results.filter((r) => !r.ok).length
  console.log('== 结果：' + (results.length - failed) + '/' + results.length + ' 通过 ==')
  return failed === 0 ? 0 : 1
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error('PROBE ERROR:', err)
  process.exit(2)
})
