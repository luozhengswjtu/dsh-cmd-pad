/**
 * dsh-cmd-pad host half（T02：数据层，零运行时依赖）
 *
 * 职责：
 *   - T01：/cmd-pad 前缀路由就绪（占位 404）——已由 T02 替换；
 *   - T02：/cmd-pad/api/library（GET/PUT）+ /cmd-pad/api/state（PUT）数据层：
 *     - commands.yml + state.json 读写（目录 = `config.dataDir` 或
 *       `~/.dsh/profiles/web/cmd-pad/`，DSH_HOME 环境变量可覆盖 .dsh 前缀）；
 *     - 原子写（随机后缀临时文件 + rename）+ commands.yml 写前 `.bak` 备份；
 *     - 串行写队列（同文件写入不交错）；
 *     - Host 头信任围栏（对齐 DSH 官方 /api 围栏：loopback / webRuntime.trustedHosts
 *       / 拒绝 cross-site / Origin 同源校验）；
 *     - YAML 优先动态加载 `yaml` 包（createRequire 从插件真实路径 / ctx.baseUrl 解析，
 *       对应官方规范 R5-3：link 安装回插件真实路径解析依赖），缺省回退内置迷你读写器。
 *
 * 软依赖说明：host 半只依赖 webServer（DSH 核心服务），与 better-sidebar 无关；
 * `sessions` / `webRuntime` 均为可选软探测（ctx.get），缺失时安全降级
 * （cwd=null / trustedHosts=[]）。
 */

import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'

/** Plugin identity（cordis loader 显示名 / 日志前缀）。 */
export const name = 'dsh-cmd-pad'

/** Host 半必需服务：webServer（前缀路由注册）。 */
export const inject = ['webServer']

// ──────────────────────────────────────────────────────────────────────────
// 通用小工具
// ──────────────────────────────────────────────────────────────────────────

/** 展开 `~` / `~/` 前缀为用户主目录（对齐 dsh-home-paths.expandHomePath）。 */
function expandHomePath(path) {
  if (path === '~') return homedir()
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(homedir(), path.slice(2))
  return path
}

/**
 * 数据目录解析：`config.dataDir` 优先（支持 `~`），否则
 * `<DSH_HOME 或 ~/.dsh>/profiles/web/cmd-pad/`。
 */
function resolveDataDir(config = {}) {
  const configured = typeof config?.dataDir === 'string' && config.dataDir.trim() !== '' ? expandHomePath(config.dataDir.trim()) : undefined
  if (configured !== undefined) return resolve(configured)
  const envHome = typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME.trim() !== '' ? expandHomePath(process.env.DSH_HOME.trim()) : undefined
  const home = envHome ?? join(homedir(), '.dsh')
  return join(home, 'profiles', 'web', 'cmd-pad')
}

/** 串行写队列：同一文件的所有写操作链式排队，互不交错。 */
function createWriteQueue() {
  let tail = Promise.resolve()
  return {
    enqueue(task) {
      const run = tail.then(task, task)
      tail = run.then(() => undefined, () => undefined)
      return run
    },
  }
}

/**
 * 原子写（对齐官方 dsh-atomic-write.writeFileAtomic）：
 * 随机后缀同目录临时文件（wx 排他创建，拒绝符号链接）+ rename 提交；
 * 失败时清理临时文件并重抛。读者无锁（rename 提交原子可见）。
 */
async function writeFileAtomic(filename, content, options = {}) {
  await mkdir(dirname(filename), { recursive: true })
  const temp = `${filename}.${randomBytes(6).toString('hex')}.tmp`
  try {
    await writeFile(temp, content, { mode: options.mode ?? 0o644, flag: 'wx' })
    await rename(temp, filename)
  } catch (error) {
    await rm(temp, { force: true })
    throw error
  }
}

async function readFileSafe(filename) {
  try {
    return await readFile(filename, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

// ──────────────────────────────────────────────────────────────────────────
// 迷你 YAML 读写器（commands.yml 面向的 YAML 子集；yaml 包在场时由调用方优先使用）
//
// 支持：块映射 / 块序列（含 `- key: v` 内联首键 + 续键）/ 流序列 [a, b] /
// 流映射 {a: b} / 单双引号字符串（含转义）/ 块标量 | 与折叠 > / 注释 /
// 布尔与 null 推断。数字不做推断（统一保持字符串——commands.yml 无数字字段，
// 避免 "123" 分组名在往返中被改型）。
// 解析失败必须抛错（调用方保证不落盘），绝不静默产出残缺数据。
// ──────────────────────────────────────────────────────────────────────────

function splitLines(text) {
  return text.replace(/^\uFEFF/, '').split(/\r?\n/)
}

function isBlankOrComment(line) {
  const t = line.trim()
  return t === '' || t.startsWith('#')
}

function leadingSpaces(line) {
  let n = 0
  while (n < line.length && (line[n] === ' ' || line[n] === '\t')) n++
  return n
}

function isSeqItemLine(line) {
  const rest = line.slice(leadingSpaces(line))
  return rest === '-' || rest.startsWith('- ')
}

/** 在 key 段（不含值）内查找终止冒号：冒号后为空白或行尾，且不在引号内。 */
function findKeyColon(rest) {
  let inSingle = false
  let inDouble = false
  for (let k = 0; k < rest.length; k++) {
    const ch = rest[k]
    if (inDouble) {
      if (ch === '\\') { k++; continue }
      if (ch === '"') inDouble = false
      continue
    }
    if (inSingle) {
      if (ch === "'") inSingle = false
      continue
    }
    if (ch === '"') { inDouble = true; continue }
    if (ch === "'") { inSingle = true; continue }
    if (ch === ':' && (k + 1 >= rest.length || rest[k + 1] === ' ' || rest[k + 1] === '\t')) return k
  }
  return -1
}

/** 剥离行尾注释（# 前置空白或行首才生效；引号内的 # 不受影响）。 */
function stripComment(text) {
  let inSingle = false
  let inDouble = false
  for (let k = 0; k < text.length; k++) {
    const ch = text[k]
    if (inDouble) {
      if (ch === '\\') { k++; continue }
      if (ch === '"') inDouble = false
      continue
    }
    if (inSingle) {
      if (ch === "'") inSingle = false
      continue
    }
    if (ch === '"') { inDouble = true; continue }
    if (ch === "'") { inSingle = true; continue }
    if (ch === '#' && (k === 0 || text[k - 1] === ' ' || text[k - 1] === '\t')) return text.slice(0, k).trimEnd()
  }
  return text
}

function inferScalar(s) {
  if (s === 'true' || s === 'True' || s === 'TRUE') return true
  if (s === 'false' || s === 'False' || s === 'FALSE') return false
  if (s === 'null' || s === 'Null' || s === 'NULL' || s === '~') return null
  return s
}

/** 流集合切分：按深度 0 的逗号切分，尊重引号与嵌套括号。 */
function splitFlow(inner) {
  const parts = []
  let depth = 0
  let inSingle = false
  let inDouble = false
  let cur = ''
  for (let k = 0; k < inner.length; k++) {
    const ch = inner[k]
    if (inDouble) {
      if (ch === '\\') { cur += ch; if (k + 1 < inner.length) { cur += inner[k + 1]; k++ } continue }
      if (ch === '"') inDouble = false
      cur += ch
      continue
    }
    if (inSingle) {
      if (ch === "'") {
        if (inner[k + 1] === "'") { cur += "''"; k++ } else inSingle = false
      }
      cur += ch
      continue
    }
    if (ch === '"') { inDouble = true; cur += ch; continue }
    if (ch === "'") { inSingle = true; cur += ch; continue }
    if (ch === '[' || ch === '{') depth++
    if (ch === ']' || ch === '}') depth--
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue }
    cur += ch
  }
  parts.push(cur)
  return parts
}

function miniYamlParse(text) {
  if (typeof text !== 'string') throw new Error('yaml: input must be a string')
  const lines = splitLines(text)
  let i = 0

  function errorAt(lineNo, message) {
    throw new Error(`yaml: line ${lineNo + 1}: ${message}`)
  }

  function peekNextContent(from) {
    let j = from
    while (j < lines.length && isBlankOrComment(lines[j])) j++
    return j
  }

  function parseNode(indent) {
    const start = peekNextContent(i)
    if (start >= lines.length) return null
    const line = lines[start]
    const cur = leadingSpaces(line)
    if (cur < indent) return null
    if (cur > indent) errorAt(start, `unexpected indentation (expected at most ${indent})`)
    if (isSeqItemLine(line)) return parseSeq(cur)
    if (findKeyColon(line.slice(cur)) !== -1) return parseMap(cur)
    // 裸标量：取首行；流/引号开头走对应解析器（未闭合即抛错，损坏可检出）
    const rest = stripComment(line.slice(cur)).trim()
    if (rest.startsWith('[')) return parseFlowSeq(rest, start)
    if (rest.startsWith('{')) return parseFlowMap(rest, start)
    if (rest.startsWith('"')) return parseDoubleQuoted(rest, start)
    if (rest.startsWith("'")) return parseSingleQuoted(rest, start)
    i = start + 1
    return inferScalar(rest)
  }

  function parseMap(indent) {
    const map = {}
    for (;;) {
      const start = peekNextContent(i)
      if (start >= lines.length) break
      const line = lines[start]
      const cur = leadingSpaces(line)
      if (cur < indent) break
      if (cur > indent) errorAt(start, `unexpected indentation in mapping (expected at most ${indent})`)
      const rest = line.slice(cur)
      const colon = findKeyColon(rest)
      if (colon === -1) break
      i = start + 1
      const key = rest.slice(0, colon).trim()
      if (key === '') errorAt(start, 'empty mapping key')
      if (Object.prototype.hasOwnProperty.call(map, key)) errorAt(start, `duplicate key "${key}"`)
      map[key] = parseValue(rest.slice(colon + 1), cur, start)
    }
    return map
  }

  function parseSeq(indent) {
    const arr = []
    for (;;) {
      const start = peekNextContent(i)
      if (start >= lines.length) break
      const line = lines[start]
      const cur = leadingSpaces(line)
      if (cur < indent) break
      if (cur > indent) errorAt(start, `unexpected indentation in sequence (expected at most ${indent})`)
      if (!isSeqItemLine(line)) break
      i = start + 1
      const rest = line.slice(cur)
      const content = rest.length > 1 ? rest.slice(1).trim() : ''
      if (content === '') {
        const next = peekNextContent(i)
        if (next < lines.length && leadingSpaces(lines[next]) > indent) {
          arr.push(parseNode(leadingSpaces(lines[next])))
        } else {
          arr.push(null)
        }
      } else if (findKeyColon(content) !== -1) {
        arr.push(parseInlineMap(content, indent, start))
      } else {
        arr.push(parseValue(content, indent, start))
      }
    }
    return arr
  }

  function parseInlineMap(firstContent, seqIndent, lineNo) {
    const map = {}
    const colon = findKeyColon(firstContent)
    const key = firstContent.slice(0, colon).trim()
    if (key === '') errorAt(lineNo, 'empty mapping key in sequence item')
    map[key] = parseValue(firstContent.slice(colon + 1), leadingSpaces(lines[lineNo]), lineNo)
    // 续键：缩进深于序列项、非序列项、且为 key 行
    for (;;) {
      const start = peekNextContent(i)
      if (start >= lines.length) break
      const line = lines[start]
      const cur = leadingSpaces(line)
      if (cur <= seqIndent) break
      if (isSeqItemLine(line)) break
      const rest = line.slice(cur)
      const colon2 = findKeyColon(rest)
      if (colon2 === -1) errorAt(start, `expected mapping key, got "${rest.trim()}"`)
      i = start + 1
      const key2 = rest.slice(0, colon2).trim()
      if (key2 === '') errorAt(start, 'empty mapping key')
      if (Object.prototype.hasOwnProperty.call(map, key2)) errorAt(start, `duplicate key "${key2}"`)
      map[key2] = parseValue(rest.slice(colon2 + 1), cur, start)
    }
    return map
  }

  function parseValue(text, indent, lineNo) {
    let t = stripComment(text.trim()).trim()
    if (t === '') {
      const next = peekNextContent(i)
      if (next < lines.length) {
        const ncur = leadingSpaces(lines[next])
        if (ncur > indent) {
          return isSeqItemLine(lines[next]) ? parseSeq(ncur) : parseNode(ncur)
        }
        if (ncur === indent && isSeqItemLine(lines[next])) {
          return parseSeq(ncur) // 无缩进序列（合法 YAML）
        }
      }
      return null
    }
    if (t === '|' || /^\|[-+]?\d*$/.test(t)) return parseBlockScalar(indent, lineNo, t.slice(1))
    if (t === '>' || /^>[-+]?\d*$/.test(t)) return parseFoldedScalar(indent, lineNo, t.slice(1))
    if (t.startsWith('[')) return parseFlowSeq(t, lineNo)
    if (t.startsWith('{')) return parseFlowMap(t, lineNo)
    if (t.startsWith('"')) return parseDoubleQuoted(t, lineNo)
    if (t.startsWith("'")) return parseSingleQuoted(t, lineNo)
    return inferScalar(t)
  }

  function parseDoubleQuoted(text, lineNo) {
    let out = ''
    let k = 1
    for (; k < text.length; k++) {
      const ch = text[k]
      if (ch === '\\') {
        k++
        if (k >= text.length) errorAt(lineNo, 'unterminated escape in double-quoted string')
        const e = text[k]
        if (e === 'n') out += '\n'
        else if (e === 't') out += '\t'
        else if (e === 'r') out += '\r'
        else if (e === '0') out += '\0'
        else if (e === 'u') {
          const hex = text.slice(k + 1, k + 5)
          if (hex.length < 4 || !/^[0-9a-fA-F]{4}$/.test(hex)) errorAt(lineNo, 'invalid \\u escape')
          out += String.fromCharCode(parseInt(hex, 16))
          k += 4
        } else {
          out += e // \" \\ \/ \a 等按字面
        }
        continue
      }
      if (ch === '"') {
        const rest = text.slice(k + 1).trim()
        if (rest !== '' && !rest.startsWith('#')) errorAt(lineNo, `trailing content after quoted string: "${rest}"`)
        return out
      }
      out += ch
    }
    errorAt(lineNo, 'unterminated double-quoted string')
  }

  function parseSingleQuoted(text, lineNo) {
    let out = ''
    for (let k = 1; k < text.length; k++) {
      const ch = text[k]
      if (ch === "'") {
        if (text[k + 1] === "'") { out += "'"; k++; continue }
        const rest = text.slice(k + 1).trim()
        if (rest !== '' && !rest.startsWith('#')) errorAt(lineNo, 'trailing content after quoted string')
        return out
      }
      out += ch
    }
    errorAt(lineNo, 'unterminated single-quoted string')
  }

  function parseFlowSeq(text, lineNo) {
    if (!text.endsWith(']')) errorAt(lineNo, 'unterminated flow sequence')
    const inner = text.slice(1, -1).trim()
    if (inner === '') return []
    return splitFlow(inner).map((item) => {
      const s = item.trim()
      if (s === '') return null
      if (s.startsWith('"')) return parseDoubleQuoted(s, lineNo)
      if (s.startsWith("'")) return parseSingleQuoted(s, lineNo)
      return inferScalar(stripComment(s).trim())
    })
  }

  function parseFlowMap(text, lineNo) {
    if (!text.endsWith('}')) errorAt(lineNo, 'unterminated flow mapping')
    const inner = text.slice(1, -1).trim()
    const map = {}
    if (inner === '') return map
    for (const part of splitFlow(inner)) {
      const s = part.trim()
      const colon = findKeyColon(s)
      if (colon === -1) errorAt(lineNo, `invalid flow mapping entry "${s}"`)
      const key = s.slice(0, colon).trim()
      const val = s.slice(colon + 1).trim()
      map[key] = val.startsWith('"') ? parseDoubleQuoted(val, lineNo) : val.startsWith("'") ? parseSingleQuoted(val, lineNo) : inferScalar(stripComment(val).trim())
    }
    return map
  }

  function collectBlockLines(keyIndent, lineNo) {
    const raw = []
    for (;;) {
      if (i >= lines.length) break
      const line = lines[i]
      if (line.trim() === '') { raw.push(''); i++; continue }
      const cur = leadingSpaces(line)
      if (cur <= keyIndent) break
      if (line.slice(cur).startsWith('#')) { i++; continue }
      raw.push(line.slice(cur))
      i++
    }
    return raw
  }

  function chompBlock(raw, mode) {
    let end = raw.length
    while (end > 0 && raw[end - 1] === '') end--
    const core = raw.slice(0, end).join('\n')
    if (mode === '+') return raw.join('\n')
    if (mode === '-') return core
    return core === '' ? '' : core + '\n'
  }

  function parseBlockScalar(keyIndent, lineNo, header) {
    const mode = header.includes('-') ? '-' : header.includes('+') ? '+' : ''
    return chompBlock(collectBlockLines(keyIndent, lineNo), mode)
  }

  function parseFoldedScalar(keyIndent, lineNo, header) {
    const mode = header.includes('-') ? '-' : header.includes('+') ? '+' : ''
    const raw = collectBlockLines(keyIndent, lineNo)
    let end = raw.length
    while (end > 0 && raw[end - 1] === '') end--
    const folded = []
    let prevBlank = false
    for (let k = 0; k < end; k++) {
      const line = raw[k]
      if (line === '') { folded.push(''); prevBlank = true; continue }
      if (folded.length > 0 && !prevBlank && folded[folded.length - 1] !== '') {
        folded[folded.length - 1] += ' ' + line
      } else {
        folded.push(line)
      }
      prevBlank = false
    }
    const core = folded.join('\n')
    if (mode === '+') return core + (end < raw.length ? '\n'.repeat(raw.length - end) : '')
    if (mode === '-') return core
    return core === '' ? '' : core + '\n'
  }

  const root = parseNode(0)
  const after = peekNextContent(i)
  if (after < lines.length) errorAt(after, `unexpected trailing content: "${lines[after].trim()}"`)
  return root
}

function needsQuoting(s, flow) {
  if (s === '') return true
  if (s !== s.trim()) return true
  if (inferScalar(s) !== s) return true // true/false/null/~
  if (/^[-+]?[0-9]/.test(s)) return true // 数字开头 → 引号保持字符串型
  if (/^(y|Y|n|N|yes|Yes|YES|no|No|NO|on|On|ON|off|Off|OFF)$/.test(s)) return true
  if (/[\r\n\t]/.test(s)) return true
  if (s.includes(': ') || s.includes(' #') || s.endsWith(':')) return true
  if (/^[!&*?|>%@`"'#\[\]{},]/.test(s)) return true
  if (s.startsWith('- ') || s === '-' || s === '?') return true
  if (flow && /[,\[\]{}]/.test(s)) return true // 流集合上下文：逗号/括号会破坏切分
  return false
}

function quoteDouble(s) {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"'
}

function scalarText(value, flow) {
  if (value === null) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return String(value)
  const s = String(value)
  return needsQuoting(s, flow) ? quoteDouble(s) : s
}

function flowList(arr) {
  return '[' + arr.map((item) => scalarText(item, true)).join(', ') + ']'
}

function pad(indent) {
  return '  '.repeat(indent)
}

function miniYamlStringify(root) {
  if (root === null || typeof root !== 'object') return scalarText(root) + '\n'
  const out = []
  writeNode(root, 0, out)
  return out.join('\n') + '\n'
}

function writeNode(value, indent, out) {
  if (Array.isArray(value)) {
    for (const item of value) writeSeqItem(item, indent, out)
    return
  }
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) writeMapValue(key, value[key], indent, out)
    return
  }
  out.push(pad(indent) + scalarText(value))
}

function writeMapValue(key, value, indent, out) {
  const p = pad(indent)
  if (value === null || typeof value !== 'object') {
    out.push(p + key + ': ' + scalarText(value))
  } else if (Array.isArray(value)) {
    if (value.every((item) => item === null || typeof item !== 'object')) {
      out.push(p + key + ': ' + flowList(value))
    } else {
      out.push(p + key + ':')
      for (const item of value) writeSeqItem(item, indent + 1, out)
    }
  } else {
    out.push(p + key + ':')
    writeNode(value, indent + 1, out)
  }
}

function writeSeqItem(item, indent, out) {
  const p = pad(indent)
  if (item === null || typeof item !== 'object') {
    out.push(p + '- ' + scalarText(item))
    return
  }
  if (Array.isArray(item)) {
    out.push(p + '-')
    writeNode(item, indent + 1, out)
    return
  }
  const keys = Object.keys(item)
  if (keys.length === 0) {
    out.push(p + '- {}')
    return
  }
  const first = keys[0]
  const firstVal = item[first]
  if (firstVal === null || typeof firstVal !== 'object') {
    out.push(p + '- ' + first + ': ' + scalarText(firstVal))
  } else if (Array.isArray(firstVal) && firstVal.every((v) => v === null || typeof v !== 'object')) {
    out.push(p + '- ' + first + ': ' + flowList(firstVal))
  } else {
    out.push(p + '- ' + first + ':')
    if (Array.isArray(firstVal)) {
      for (const v of firstVal) writeSeqItem(v, indent + 2, out)
    } else {
      writeNode(firstVal, indent + 2, out)
    }
  }
  for (let k = 1; k < keys.length; k++) writeMapValue(keys[k], item[keys[k]], indent + 1, out)
}

// ──────────────────────────────────────────────────────────────────────────
// YAML 引擎选择：优先动态加载 `yaml` 包，缺省回退迷你读写器
// ──────────────────────────────────────────────────────────────────────────

function loadYamlParser(ctx, anchorsOverride) {
  const anchors = anchorsOverride ?? []
  if (anchors.length === 0) {
    try {
      anchors.push(new URL('.', import.meta.url).href)
    } catch { /* import.meta.url 不可用时跳过 */ }
    if (typeof ctx?.baseUrl === 'string') anchors.push(ctx.baseUrl)
  }
  for (const anchor of anchors) {
    try {
      const req = createRequire(anchor)
      const mod = req('yaml')
      if (mod !== null && typeof mod === 'object' && typeof mod.parse === 'function' && typeof mod.stringify === 'function') {
        return {
          engine: 'yaml',
          parse: (text) => mod.parse(text),
          stringify: (value) => mod.stringify(value, { indent: 2 }),
        }
      }
    } catch { /* 该锚点不可解析，尝试下一个 */ }
  }
  return { engine: 'mini', parse: miniYamlParse, stringify: miniYamlStringify }
}

// ──────────────────────────────────────────────────────────────────────────
// 数据层：commands.yml + state.json
// ──────────────────────────────────────────────────────────────────────────

const DEFAULT_LIBRARY = { commands: [] }

function createDataLayer({ dir, logger, yaml }) {
  const ymlPath = join(dir, 'commands.yml')
  const statePath = join(dir, 'state.json')
  const libraryQueue = createWriteQueue()
  const stateQueue = createWriteQueue()

  async function readLibrary() {
    const [yml, bak] = await Promise.all([readFileSafe(ymlPath), readFileSafe(ymlPath + '.bak')])
    let mtime = null
    try {
      const st = await stat(ymlPath)
      mtime = st.mtimeMs
    } catch { /* 文件缺失时 mtime 为 null */ }
    if (yml !== null) {
      try {
        return { library: miniOrYamlParse(yaml, yml) ?? DEFAULT_LIBRARY, mtime, recovered: false }
      } catch (primaryError) {
        // 主文件解析失败：回退 .bak（只读回退，不自动覆盖主文件）
        if (bak !== null) {
          try {
            logger?.warn?.('dsh-cmd-pad: commands.yml 解析失败，回退 .bak: %s', primaryError.message)
            return { library: miniOrYamlParse(yaml, bak) ?? DEFAULT_LIBRARY, mtime, recovered: true, warning: 'commands.yml 解析失败，已回退到 .bak 内容' }
          } catch { /* .bak 也失败 → 上报主文件错误 */ }
        }
        throw primaryError
      }
    }
    if (bak !== null) {
      // 主文件缺失但 .bak 存在：这是异常状态（.bak 不应独立于主文件存活），仍可回退
      try {
        return { library: miniOrYamlParse(yaml, bak) ?? DEFAULT_LIBRARY, mtime, recovered: true, warning: 'commands.yml 缺失，已回退到 .bak 内容' }
      } catch { /* 落到默认空库 */ }
    }
    return { library: DEFAULT_LIBRARY, mtime, recovered: false }
  }

  async function writeLibrary(library) {
    const text = yaml.stringify(library) // 序列化失败在入队前抛出 → 400，不落盘
    return libraryQueue.enqueue(async () => {
      await mkdir(dir, { recursive: true })
      const existing = await readFileSafe(ymlPath)
      if (existing !== null) {
        // 写前备份；备份失败则中止本次写，主文件保持原样
        await writeFileAtomic(ymlPath + '.bak', existing)
      }
      await writeFileAtomic(ymlPath, text)
      const st = await stat(ymlPath)
      return { mtime: st.mtimeMs }
    })
  }

  async function readState() {
    const raw = await readFileSafe(statePath)
    if (raw === null) return {}
    try {
      const parsed = JSON.parse(raw)
      return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch (error) {
      logger?.warn?.('dsh-cmd-pad: state.json 解析失败，按空状态处理: %s', error.message)
      return {}
    }
  }

  async function writeState(partial) {
    return stateQueue.enqueue(async () => {
      await mkdir(dir, { recursive: true })
      const current = await readState()
      const next = deepMerge(current, partial)
      await writeFileAtomic(statePath, JSON.stringify(next, null, 2) + '\n')
    })
  }

  return {
    ymlPath,
    statePath,
    dir,
    readLibrary,
    writeLibrary,
    readState,
    writeState,
    libraryQueue,
    stateQueue,
  }
}

function miniOrYamlParse(yaml, text) {
  return yaml.parse(text)
}

/** 浅层结构深合并：对象逐键递归合并，数组/标量整体替换。 */
function deepMerge(base, patch) {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch
  const out = { ...(base !== null && typeof base === 'object' && !Array.isArray(base) ? base : {}) }
  for (const key of Object.keys(patch)) {
    const pv = patch[key]
    const bv = out[key]
    if (pv !== null && typeof pv === 'object' && !Array.isArray(pv) && bv !== null && typeof bv === 'object' && !Array.isArray(bv)) {
      out[key] = deepMerge(bv, pv)
    } else {
      out[key] = pv
    }
  }
  return out
}

// ──────────────────────────────────────────────────────────────────────────
// 请求校验 / 信任围栏 / 路由
// ──────────────────────────────────────────────────────────────────────────

function isIpv4Loopback(hostname) {
  const parts = hostname.split('.')
  return parts.length === 4 && parts[0] === '127' && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

/** 对齐 DSH isTrustedAuthority：带端口的条目精确匹配 host:port，无端口条目匹配任意端口。 */
function isTrustedAuthority(hostUrl, trustedHosts) {
  if (!Array.isArray(trustedHosts)) return false
  return trustedHosts.some((entry) => {
    if (typeof entry !== 'string' || entry === '') return false
    let u
    try {
      u = new URL(`http://${entry}`)
    } catch {
      return false
    }
    if (u.pathname !== '/' || u.username !== '' || u.password !== '' || u.search !== '' || u.hash !== '') return false
    if (u.port === '') return u.hostname === hostUrl.hostname
    return u.host === hostUrl.host
  })
}

/**
 * Host 头信任围栏（对齐官方 /api 围栏，dsh-client-connection）：
 * 1) Host 缺失/不可解析 → 拒绝；2) hostname 须为 loopback（localhost / [::1] /
 * 127.x.x.x）或命中 webRuntime.trustedHosts；3) sec-fetch-site: cross-site → 拒绝；
 * 4) Origin 在场时须与 Host 同源。
 */
function isTrustedRequest(req, ctx) {
  const host = req?.headers?.host
  if (typeof host !== 'string' || host === '') return false
  let hostUrl
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return false
  }
  const hostname = hostUrl.hostname
  const loopback = hostname === 'localhost' || hostname === '[::1]' || isIpv4Loopback(hostname)
  if (!loopback) {
    const webRuntime = typeof ctx?.get === 'function' ? ctx.get('webRuntime') : undefined
    if (!isTrustedAuthority(hostUrl, webRuntime?.trustedHosts)) return false
  }
  if (req.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = req.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

/** 会话 cwd 软探测（T03 起前端主要靠 scope.cwd / 会话 header.cwd，此字段为兜底供给）。 */
function resolveSessionCwd(ctx, sessionId) {
  if (typeof sessionId !== 'string' || sessionId === '') return null
  try {
    const sessions = typeof ctx?.get === 'function' ? ctx.get('sessions') : undefined
    const session = typeof sessions?.get === 'function' ? sessions.get(sessionId) : undefined
    const cwd = session?.header?.cwd
    return typeof cwd === 'string' && cwd !== '' ? cwd : null
  } catch {
    return null
  }
}

const MAX_LIBRARY_BYTES = 1024 * 1024
const MAX_STATE_BYTES = 256 * 1024

function readJsonBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let settled = false
    const fail = (error) => {
      if (settled) return
      settled = true
      req.resume() // 排空余下 body，让客户端能收到响应而非连接重置
      reject(error)
    }
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      if (settled) return
      size += chunk.length
      if (size > maxBytes) {
        fail(Object.assign(new Error('body too large'), { status: 413 }))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (settled) return
      settled = true
      if (size === 0) {
        reject(Object.assign(new Error('empty body'), { status: 400 }))
        return
      }
      const text = Buffer.concat(chunks).toString('utf8')
      try {
        resolve(JSON.parse(text))
      } catch {
        reject(Object.assign(new Error('body is not valid JSON'), { status: 400 }))
      }
    })
    req.on('error', (error) => {
      if (!settled) {
        settled = true
        reject(error)
      }
    })
  })
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status })
}

function validateLibraryPayload(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw httpError(400, 'PUT /api/library body must be a JSON object: { "library": { "commands": [...] } }')
  }
  const library = body.library
  if (library === null || typeof library !== 'object' || Array.isArray(library)) {
    throw httpError(400, 'body.library must be an object like { "commands": [...] }')
  }
  const commands = library.commands
  if (commands !== undefined && !Array.isArray(commands)) {
    throw httpError(400, 'library.commands must be an array')
  }
  const cleaned = { ...library, commands: commands ?? [] }
  for (let idx = 0; idx < cleaned.commands.length; idx++) {
    const cmd = cleaned.commands[idx]
    if (cmd === null || typeof cmd !== 'object' || Array.isArray(cmd)) {
      throw httpError(400, `commands[${idx}] must be an object`)
    }
    for (const field of ['id', 'title', 'cmd']) {
      if (typeof cmd[field] !== 'string' || cmd[field].trim() === '') {
        throw httpError(400, `commands[${idx}].${field} must be a non-empty string`)
      }
    }
    if (cmd.groups !== undefined) {
      if (!Array.isArray(cmd.groups) || cmd.groups.some((g) => typeof g !== 'string' || g.trim() === '' || /[\r\n]/.test(g))) {
        throw httpError(400, `commands[${idx}].groups must be an array of non-empty strings without newlines`)
      }
    }
    if (cmd.tags !== undefined && (!Array.isArray(cmd.tags) || cmd.tags.some((t) => typeof t !== 'string'))) {
      throw httpError(400, `commands[${idx}].tags must be an array of strings`)
    }
    if (cmd.danger !== undefined && typeof cmd.danger !== 'boolean') {
      throw httpError(400, `commands[${idx}].danger must be a boolean`)
    }
    if (/[\r\n]/.test(cmd.title)) throw httpError(400, `commands[${idx}].title must not contain newlines`)
  }
  return cleaned
}

function validateStatePayload(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw httpError(400, 'PUT /api/state body must be a JSON object (incremental state patch)')
  }
  try {
    JSON.stringify(body) // 循环引用 / 函数 → 抛错
  } catch {
    throw httpError(400, 'state must be JSON-serializable')
  }
  return body
}

function sendJson(res, status, payload) {
  if (res.headersSent) {
    res.destroy()
    return
  }
  const text = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(text)
}

function makeHandler(ctx, config) {
  const dir = resolveDataDir(config)
  const yaml = loadYamlParser(ctx)
  const logger = typeof ctx?.logger === 'object' && ctx.logger !== null ? ctx.logger : undefined
  const data = createDataLayer({ dir, logger, yaml })

  function sendError(res, error) {
    const status = typeof error?.status === 'number' ? error.status : 500
    const code = status === 400 ? 'bad-request'
      : status === 403 ? 'forbidden'
        : status === 404 ? 'not-found'
          : status === 405 ? 'method-not-allowed'
            : status === 413 ? 'payload-too-large'
              : status === 415 ? 'unsupported-media-type'
                : 'internal'
    if (status >= 500) logger?.warn?.('dsh-cmd-pad: %s %s failed: %s', error?.method ?? 'api', error?.path ?? '', error?.message ?? String(error))
    sendJson(res, status, { ok: false, error: { code, message: error?.message ?? 'internal error' } })
  }

  return async function handler(req, res) {
    let url
    try {
      url = new URL(req.url ?? '/', 'http://x')
    } catch {
      sendJson(res, 400, { ok: false, error: { code: 'bad-request', message: 'invalid request URL' } })
      return
    }
    const pathname = url.pathname
    const method = (req.method ?? 'GET').toUpperCase()

    // 信任围栏：所有 /cmd-pad 请求先过围栏（含 404/405 路径），403 优先于一切
    if (!isTrustedRequest(req, ctx)) {
      sendJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'untrusted Host / Origin' } })
      return
    }

    if (pathname === '/cmd-pad/api/library') {
      if (method === 'GET') {
        try {
          const { library, mtime, recovered, warning } = await data.readLibrary()
          const sessionId = url.searchParams.get('sessionId') ?? undefined
          const cwd = resolveSessionCwd(ctx, sessionId)
          const payload = {
            ok: true,
            library,
            state: await data.readState(),
            cwd,
            mtime,
            ...(recovered ? { recovered, warning } : {}),
          }
          sendJson(res, 200, payload)
        } catch (error) {
          error.method = 'GET'
          error.path = pathname
          sendError(res, error)
        }
        return
      }
      if (method === 'PUT') {
        try {
          const contentType = String(req.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase()
          if (contentType !== 'application/json') {
            sendJson(res, 415, { ok: false, error: { code: 'unsupported-media-type', message: 'content-type must be application/json' } })
            return
          }
          const body = await readJsonBody(req, MAX_LIBRARY_BYTES)
          const library = validateLibraryPayload(body)
          const { mtime } = await data.writeLibrary(library)
          sendJson(res, 200, { ok: true, mtime })
        } catch (error) {
          error.method = 'PUT'
          error.path = pathname
          sendError(res, error)
        }
        return
      }
      sendJson(res, 405, { ok: false, error: { code: 'method-not-allowed', message: 'library supports GET/PUT' } })
      return
    }

    if (pathname === '/cmd-pad/api/state') {
      if (method === 'PUT') {
        try {
          const contentType = String(req.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase()
          if (contentType !== 'application/json') {
            sendJson(res, 415, { ok: false, error: { code: 'unsupported-media-type', message: 'content-type must be application/json' } })
            return
          }
          const body = await readJsonBody(req, MAX_STATE_BYTES)
          const state = validateStatePayload(body)
          await data.writeState(state)
          sendJson(res, 200, { ok: true })
        } catch (error) {
          error.method = 'PUT'
          error.path = pathname
          sendError(res, error)
        }
        return
      }
      sendJson(res, 405, { ok: false, error: { code: 'method-not-allowed', message: 'state supports PUT' } })
      return
    }

    sendJson(res, 404, { ok: false, error: { code: 'not-found', message: `no cmd-pad route for ${method} ${pathname}` } })
  }
}

/**
 * 插件主体。
 * @param ctx - host plugin context（webServer 必需；sessions/webRuntime 可选）。
 * @param config - 可选 `{ dataDir?: string }`。
 */
export function apply(ctx, config = {}) {
  const handler = makeHandler(ctx, config)
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/cmd-pad',
    handler,
  }), 'dsh-cmd-pad: /cmd-pad routes')
}

/** 测试钩子：暴露内部件供独立 harness 验证（不随 files 发布）。 */
export const internals = {
  miniYamlParse,
  miniYamlStringify,
  writeFileAtomic,
  createWriteQueue,
  createDataLayer,
  deepMerge,
  isTrustedRequest,
  isTrustedAuthority,
  resolveDataDir,
  loadYamlParser,
  validateLibraryPayload,
  validateStatePayload,
  readJsonBody,
  makeHandler,
  stripComment,
  inferScalar,
  DEFAULT_LIBRARY,
}
