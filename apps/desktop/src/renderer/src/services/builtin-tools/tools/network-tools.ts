import TurndownService from 'turndown'
import { Readability } from '@mozilla/readability'
import { z } from 'zod'

const USER_AGENT = "Mozilla/5.0"

const fetchInputSchema = z.object({
  url: z.string().url().optional().describe('URL to fetch. Kept for single-address compatibility.'),
  urls: z.array(z.string().url()).min(1).optional().describe('URLs to fetch. Use this for fetching multiple addresses at once.'),
  headers: z.record(z.string(), z.string()).optional().describe('Optional HTTP headers to send with each request'),
  max_length: z.number().int().positive().max(999999).default(5000).describe('Maximum number of characters to return'),
  start_index: z.number().int().min(0).default(0).describe('Character offset to start returning content from'),
  raw: z.boolean().default(false).describe('Return raw page content instead of simplified markdown')
}).refine((input) => input.url || input.urls?.length, {
  message: 'Either url or urls must be provided.'
})

const packetCaptureInputSchema = z.object({
  duration_seconds: z
    .number()
    .int()
    .min(1)
    .max(60)
    .default(10)
    .describe('抓包持续秒数，默认 10 秒，最大 60 秒。'),
  interface: z
    .string()
    .trim()
    .optional()
    .describe('要抓取的网卡名称。留空时自动选择可用的全接口/主网卡。'),
  packet_filter: z
    .string()
    .trim()
    .optional()
    .describe('可选 BPF 过滤表达式，例如 "tcp port 443" 或 "host 1.1.1.1"。留空表示抓取全部可见数据包。'),
  max_lines: z
    .number()
    .int()
    .min(20)
    .max(1000)
    .default(200)
    .describe('最多返回多少行原始抓包输出，默认 200 行。'),
  include_raw: z
    .boolean()
    .default(true)
    .describe('是否在摘要后附带原始抓包输出。默认 true。')
})

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })

type ToolFetchResponse = {
  ok: boolean
  status?: number
  statusText?: string
  headers?: Record<string, string>
  text?: string
  error?: string
}

const getRobotsTxtUrl = (url: string) => {
  const parsed = new URL(url)
  parsed.pathname = '/robots.txt'
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString()
}

const fetchWithFallback = async (
  url: string,
  options?: {
    headers?: Record<string, string>
  }
): Promise<ToolFetchResponse> => {
  try {
    const response = await window.api.net.fetch(url, options)
    if (response?.ok || response?.status || response?.error) {
      return response
    }
  } catch {
    // Fall through to browser fetch when the Electron net bridge is unavailable.
  }

  try {
    const headers = new Headers(options?.headers)
    headers.delete('User-Agent')

    const response = await fetch(url, {
      headers
    })

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      text: await response.text()
    }
  } catch (error) {
    return {
      ok: false,
      error: (error as Error).message
    }
  }
}

const canFetchByRobots = (url: string, robotsTxt: string) => {
  const path = new URL(url).pathname || '/'
  const lines = robotsTxt
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, '').trim())
    .filter(Boolean)

  let applies = false
  let matchedRule: { type: 'allow' | 'disallow'; path: string } | null = null

  for (const line of lines) {
    const [rawKey, ...rest] = line.split(':')
    const key = rawKey?.trim().toLowerCase()
    const value = rest.join(':').trim()
    if (!key) continue

    if (key === 'user-agent') {
      applies = value === '*' || USER_AGENT.toLowerCase().includes(value.toLowerCase())
      continue
    }

    if (!applies || (key !== 'allow' && key !== 'disallow') || !value || !path.startsWith(value)) {
      continue
    }

    if (!matchedRule || value.length >= matchedRule.path.length) {
      matchedRule = { type: key, path: value }
    }
  }

  return matchedRule?.type !== 'disallow'
}

const buildRequestHeaders = (headers?: Record<string, string>) => ({
  'User-Agent': USER_AGENT,
  ...headers
})

const checkRobotsTxt = async (url: string, headers?: Record<string, string>) => {
  const robotsUrl = getRobotsTxtUrl(url)
  const response = await fetchWithFallback(robotsUrl, {
    headers: buildRequestHeaders(headers)
  })

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(`When fetching robots.txt (${robotsUrl}), received status ${response.status} so assuming autonomous fetching is not allowed.`)
    }
    if (response.status! >= 400 && response.status! < 500) return
    throw new Error(`Failed to fetch robots.txt ${robotsUrl}: ${response.error || response.statusText || 'Unknown error'}`)
  }

  if (!canFetchByRobots(url, response.text || '')) {
    throw new Error(`The site's robots.txt (${robotsUrl}) disallows autonomous fetching for ${url}.`)
  }
}

const simplifyHtml = (html: string) => {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const article = new Readability(doc, { keepClasses: false }).parse()
  const htmlContent = article?.content || doc.body?.innerHTML || ''
  if (!htmlContent) {
    return '<error>Page failed to be simplified from HTML</error>'
  }
  const markdown = turndown.turndown(htmlContent).trim()
  if (!markdown) {
    return '<error>Page failed to be simplified from HTML</error>'
  }
  const title = article?.title || doc.title
  return title ? `# ${title}\n\n${markdown}` : markdown
}

const fetchPage = async (url: string, raw: boolean, headers?: Record<string, string>) => {
  const response = await fetchWithFallback(url, {
    headers: buildRequestHeaders(headers)
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} - status code ${response.status ?? 'unknown'}`)
  }

  const text = response.text || ''
  const contentType = String(response.headers?.['content-type'] || '')
  const isHtml = text.slice(0, 200).toLowerCase().includes('<html') || contentType.includes('text/html') || !contentType

  if (isHtml && !raw) {
    return { prefix: '', content: simplifyHtml(text) }
  }

  return {
    prefix: `Content type ${contentType || 'unknown'} cannot be simplified to markdown, but here is the raw content:\n`,
    content: text
  }
}

const getInputUrls = (input: z.infer<typeof fetchInputSchema>) => {
  const urls = input.urls?.length ? input.urls : input.url ? [input.url] : []
  return Array.from(new Set(urls))
}

const buildSingleResultText = async (
  url: string,
  input: Pick<z.infer<typeof fetchInputSchema>, 'headers' | 'max_length' | 'start_index' | 'raw'>
) => {
  await checkRobotsTxt(url, input.headers)

  const { prefix, content } = await fetchPage(url, input.raw, input.headers)
  const chunk = content.slice(input.start_index, input.start_index + input.max_length)

  if (!chunk) {
    return `${prefix}Contents of ${url}:\n<error>No more content available.</error>`
  }

  const nextStart = input.start_index + chunk.length
  const suffix =
    nextStart < content.length
      ? `\n\n<error>Content truncated. Call the fetch tool with a start_index of ${nextStart} to get more content.</error>`
      : ''

  return `${prefix}Contents of ${url}:\n${chunk}${suffix}`
}

const buildResultText = async (args: unknown) => {
  const input = fetchInputSchema.parse(args)
  const urls = getInputUrls(input)

  if (urls.length === 1) {
    return buildSingleResultText(urls[0], input)
  }

  const results = await Promise.all(
    urls.map(async (url) => {
      try {
        return await buildSingleResultText(url, input)
      } catch (error) {
        return `Contents of ${url}:\n<error>fetch failed: ${(error as Error).message}</error>`
      }
    })
  )

  return results.map((result, index) => `## Result ${index + 1}\n\n${result}`).join('\n\n---\n\n')
}

type PacketCaptureResult = {
  ok: boolean
  platform: string
  command?: string
  args?: string[]
  interface?: string
  durationSeconds: number
  stdout?: string
  stderr?: string
  code?: number | null
  timedOut?: boolean
  error?: string
  warning?: string
}

const packetCaptureRunnerCode = String.raw`
const { spawn } = require('node:child_process')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const input = args[0] || {}
const platform = process.platform
const durationSeconds = Math.max(1, Math.min(60, Number(input.duration_seconds || 10)))
const durationMs = durationSeconds * 1000
const maxBuffer = 1024 * 1024

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const shellCommand = (command) => {
  try {
    return execFileSync(platform === 'win32' ? 'cmd.exe' : '/bin/sh', platform === 'win32'
      ? ['/d', '/s', '/c', command]
      : ['-lc', command], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

const findCommand = (name) => {
  const found = shellCommand(platform === 'win32' ? 'where ' + name : 'command -v ' + name)
  return found.split(/\r?\n/).find(Boolean) || ''
}

const shellQuote = (value) => "'" + String(value).replace(/'/g, "'\\''") + "'"

const appleScriptString = (value) => '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'

const splitFilter = (value) => {
  const input = String(value || '').trim()
  if (!input) return []
  const result = []
  let current = ''
  let quote = ''
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    if (quote) {
      if (char === quote) {
        quote = ''
      } else {
        current += char
      }
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (/\s/.test(char)) {
      if (current) {
        result.push(current)
        current = ''
      }
      continue
    }
    current += char
  }
  if (current) result.push(current)
  return result
}

const runProcess = (command, commandArgs, options = {}) => {
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    let timedOut = false

    const append = (target, chunk) => {
      const text = chunk.toString('utf8')
      if (target === 'stdout') stdout += text
      else stderr += text
      if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > maxBuffer) {
        stdout = stdout.slice(-maxBuffer / 2)
        stderr = stderr.slice(-maxBuffer / 2)
      }
    }

    const finish = (result) => {
      if (settled) return
      settled = true
      resolve(result)
    }

    child.stdout.on('data', (chunk) => append('stdout', chunk))
    child.stderr.on('data', (chunk) => append('stderr', chunk))
    child.on('error', (error) => {
      finish({
        ok: false,
        command,
        args: commandArgs,
        stdout,
        stderr,
        error: error.message,
        code: null,
        timedOut
      })
    })
    child.on('close', (code) => {
      finish({
        ok: code === 0 || Boolean(options.allowNonZero),
        command,
        args: commandArgs,
        stdout,
        stderr,
        code,
        timedOut
      })
    })

    if (options.timeoutMs) {
      setTimeout(() => {
        timedOut = true
        try {
          child.kill(options.signal || 'SIGINT')
        } catch {}
        setTimeout(() => {
          if (!settled) {
            try {
              child.kill('SIGKILL')
            } catch {}
          }
        }, 800)
      }, options.timeoutMs)
    }
  })
}

const runPrivilegedMacTcpdump = (tcpdumpPath, commandArgs, durationSeconds) => {
  const tcpdumpCommand = [tcpdumpPath, ...commandArgs].map(shellQuote).join(' ')
  const script = [
    'out=$(mktemp -t agent-qi-tcpdump)',
    '(' + tcpdumpCommand + ' > "$out" 2>&1 &',
    'pid=$!',
    'sleep ' + Number(durationSeconds),
    'kill -INT "$pid" 2>/dev/null || true',
    'wait "$pid" 2>/dev/null || true',
    'cat "$out"',
    'rm -f "$out"',
    ')'
  ].join('; ')

  return runProcess('osascript', [
    '-e',
    'do shell script ' + appleScriptString(script) + ' with administrator privileges'
  ], {
    timeoutMs: durationSeconds * 1000 + 30_000,
    allowNonZero: false
  })
}

const listTcpdumpInterfaces = (tcpdumpPath) => {
  try {
    const output = execFileSync(tcpdumpPath, ['-D'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    return output
      .split(/\r?\n/)
      .map((line) => {
        const match = line.match(/^\d+\.([^\s(]+)/)
        return match ? match[1] : ''
      })
      .filter(Boolean)
  } catch {
    return []
  }
}

const chooseTcpdumpInterfaces = (tcpdumpPath) => {
  if (input.interface) return [String(input.interface)]
  const interfaces = listTcpdumpInterfaces(tcpdumpPath)
  if (platform === 'linux') return ['any']
  if (platform === 'darwin') {
    const candidates = [
      'any',
      'pktap',
      'en0',
      'en1',
      ...interfaces.filter((name) => !/^lo/.test(name) && !['any', 'pktap', 'en0', 'en1'].includes(name))
    ]
    return Array.from(new Set(candidates))
  }
  return [interfaces.find((name) => !/^lo/.test(name)) || interfaces[0] || 'en0']
}

const captureWithTcpdump = async () => {
  const tcpdumpPath = findCommand('tcpdump')
  if (!tcpdumpPath) return null
  const interfaces = chooseTcpdumpInterfaces(tcpdumpPath)
  let lastResult = null

  for (const iface of interfaces) {
    const commandArgs = ['-i', iface, '-nn', '-tttt', '-l', '-s', '0', ...splitFilter(input.packet_filter)]
    const result = await runProcess(tcpdumpPath, commandArgs, {
      timeoutMs: durationMs,
      signal: 'SIGINT',
      allowNonZero: true
    })
    const stderr = String(result.stderr || '')
    const hasPermissionError = /permission|permitted|denied|Operation not permitted/i.test(stderr + result.error)
    const elevatedResult =
      platform === 'darwin' && hasPermissionError
        ? await runPrivilegedMacTcpdump(tcpdumpPath, commandArgs, durationSeconds)
        : null
    const finalResult = elevatedResult || result
    const ok = finalResult.code === 0 || finalResult.timedOut
    lastResult = {
      ...finalResult,
      ok,
      platform,
      interface: iface,
      durationSeconds,
      command: elevatedResult ? 'osascript' : finalResult.command,
      args: elevatedResult ? ['with administrator privileges'] : finalResult.args,
      warning: !input.interface && platform === 'darwin' && !['any', 'pktap'].includes(iface)
        ? (elevatedResult
            ? '已通过管理员授权抓包；当前系统未能使用全接口抓包，已退回到主网卡，结果可能不是全部接口。'
            : '当前系统未能使用全接口抓包，已退回到主网卡；结果可能不是全部接口。')
        : elevatedResult
          ? '已通过管理员授权抓包。'
        : undefined
    }

    if (ok || !/No such device|does not exist|不存在/i.test(String(finalResult.stderr || ''))) {
      return lastResult
    }
  }

  return lastResult
}

const captureWithTshark = async () => {
  const tsharkPath = findCommand('tshark')
  if (!tsharkPath) return null
  const commandArgs = ['-a', 'duration:' + durationSeconds, '-n', '-l']
  if (input.interface) commandArgs.push('-i', String(input.interface))
  if (input.packet_filter) commandArgs.push('-f', String(input.packet_filter))
  const result = await runProcess(tsharkPath, commandArgs, {
    timeoutMs: durationMs + 3000,
    signal: platform === 'win32' ? undefined : 'SIGINT',
    allowNonZero: false
  })
  return {
    ...result,
    platform,
    interface: input.interface ? String(input.interface) : undefined,
    durationSeconds
  }
}

const runPktmon = (commandArgs) => runProcess('pktmon.exe', commandArgs, {
  timeoutMs: 10_000,
  allowNonZero: false
})

const captureWithPktmon = async () => {
  if (platform !== 'win32' || !findCommand('pktmon.exe')) return null
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-qi-pktmon-'))
  const etlPath = path.join(tempDir, 'capture.etl')
  const textPath = path.join(tempDir, 'capture.txt')
  try {
    await runPktmon(['filter', 'remove'])
    const start = await runPktmon(['start', '--capture', '--comp', 'nics', '--pkt-size', '0', '--file-name', etlPath])
    if (!start.ok) {
      return {
        ...start,
        platform,
        durationSeconds,
        error: start.error || start.stderr || 'pktmon start failed'
      }
    }
    await sleep(durationMs)
    await runPktmon(['stop'])
    const format = await runPktmon(['format', etlPath, '-o', textPath])
    const stdout = fs.existsSync(textPath) ? fs.readFileSync(textPath, 'utf8') : format.stdout
    return {
      ok: format.ok,
      platform,
      command: 'pktmon.exe',
      args: ['start', '--capture', '--comp', 'nics', '--pkt-size', '0'],
      stdout,
      stderr: [start.stderr, format.stderr].filter(Boolean).join('\n'),
      code: format.code,
      durationSeconds
    }
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {}
  }
}

const main = async () => {
  if (platform === 'win32') {
    const tsharkResult = await captureWithTshark()
    if (tsharkResult) return tsharkResult
    const pktmonResult = await captureWithPktmon()
    if (pktmonResult) return pktmonResult
    return {
      ok: false,
      platform,
      durationSeconds,
      error: '未找到可用抓包命令。Windows 需要安装 Wireshark/tshark，或使用系统 pktmon。pktmon 通常需要管理员权限。'
    }
  }

  const tcpdumpResult = await captureWithTcpdump()
  if (tcpdumpResult) return tcpdumpResult
  const tsharkResult = await captureWithTshark()
  if (tsharkResult) return tsharkResult
  return {
    ok: false,
    platform,
    durationSeconds,
    error: '未找到可用抓包命令。请安装 tcpdump 或 Wireshark/tshark。'
  }
}

return await main()
`

const cleanCaptureLines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !/^listening on /i.test(line) &&
        !/^tcpdump: verbose output suppressed/i.test(line) &&
        !/packets (captured|received|dropped)/i.test(line)
    )

const incrementCount = (counts: Map<string, number>, key: string) => {
  counts.set(key, (counts.get(key) || 0) + 1)
}

const topCounts = (counts: Map<string, number>, limit: number) =>
  Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, count]) => `${value} (${count})`)

const summarizeCapture = (rawText: string) => {
  const lines = cleanCaptureLines(rawText)
  const protocols = new Map<string, number>()
  const endpoints = new Map<string, number>()
  const dnsQueries = new Map<string, number>()

  for (const line of lines) {
    const upper = line.toUpperCase()
    if (upper.includes(' TCP ')) incrementCount(protocols, 'TCP')
    else if (upper.includes(' UDP ')) incrementCount(protocols, 'UDP')
    else if (upper.includes(' ICMP')) incrementCount(protocols, 'ICMP')
    else if (upper.includes(' ARP')) incrementCount(protocols, 'ARP')
    else if (upper.includes(' IP6 ')) incrementCount(protocols, 'IPv6')
    else if (upper.includes(' IP ')) incrementCount(protocols, 'IPv4')
    else incrementCount(protocols, '其他')

    const endpointMatch = line.match(/\b(?:IP6?|IPv6)\s+([^ ]+)\s+>\s+([^:]+):/)
    if (endpointMatch) {
      incrementCount(endpoints, `${endpointMatch[1]} > ${endpointMatch[2]}`)
    }

    const dnsMatch = line.match(/\b(?:A|AAAA|HTTPS|SVCB|PTR|CNAME|MX|TXT)\?\s+([^\s]+)/)
    if (dnsMatch) {
      incrementCount(dnsQueries, dnsMatch[1].replace(/\.$/, ''))
    }
  }

  return {
    packetCount: lines.length,
    protocols: topCounts(protocols, 8),
    endpoints: topCounts(endpoints, 12),
    dnsQueries: topCounts(dnsQueries, 12),
    lines
  }
}

const formatPacketCaptureResult = (result: PacketCaptureResult, input: z.infer<typeof packetCaptureInputSchema>) => {
  const rawText = [result.stdout || '', result.stderr || ''].filter(Boolean).join('\n').trim()
  const summary = summarizeCapture(rawText)
  const rawLines = summary.lines.slice(0, input.max_lines)
  const truncated = summary.lines.length > rawLines.length

  const lines = [
    result.ok ? '抓包完成' : '抓包失败',
    `platform: ${result.platform}`,
    `duration_seconds: ${result.durationSeconds}`,
    result.command ? `command: ${[result.command, ...(result.args || [])].join(' ')}` : '',
    result.interface ? `interface: ${result.interface}` : '',
    result.code !== undefined && result.code !== null ? `exit_code: ${result.code}` : '',
    result.warning ? `warning: ${result.warning}` : '',
    result.error ? `error: ${result.error}` : '',
    '',
    `captured_lines: ${summary.packetCount}`,
    `protocols: ${summary.protocols.length ? summary.protocols.join(', ') : '无'}`,
    '',
    'top_endpoints:',
    ...(summary.endpoints.length ? summary.endpoints.map((item) => `- ${item}`) : ['- 无']),
    '',
    'dns_queries:',
    ...(summary.dnsQueries.length ? summary.dnsQueries.map((item) => `- ${item}`) : ['- 无'])
  ].filter((line) => line !== '')

  if (!result.ok && rawText) {
    lines.push('', 'diagnostics:', rawText.slice(0, 4000))
  }

  if (result.ok && input.include_raw) {
    lines.push(
      '',
      `raw_capture${truncated ? ` (first ${rawLines.length} of ${summary.lines.length} lines)` : ''}:`,
      rawLines.length ? rawLines.join('\n') : '<no packets captured>'
    )
  }

  if (!result.ok && /permission|permitted|denied|权限|admin|administrator|root/i.test(rawText + result.error)) {
    lines.push(
      '',
      '提示：抓包通常需要管理员/root 权限。macOS/Linux 可用 sudo 运行应用或为 tcpdump 配置抓包权限；Windows 可用管理员权限运行并安装 Npcap/Wireshark。'
    )
  }

  return lines.join('\n')
}

const capturePackets = async (args: unknown) => {
  const input = packetCaptureInputSchema.parse(args)
  const result = await window.api.execNodejs<PacketCaptureResult>({
    code: packetCaptureRunnerCode,
    args: [input],
    timeoutMs: input.duration_seconds * 1000 + 15_000,
    maxBuffer: 2 * 1024 * 1024
  })

  if (!result.ok || !result.result) {
    return [
      '抓包失败',
      result.error?.message ? `error: ${result.error.message}` : '',
      result.errorMessage ? `error_message: ${result.errorMessage}` : '',
      result.stderr ? `stderr: ${result.stderr.slice(0, 4000)}` : '',
      result.stdout ? `stdout: ${result.stdout.slice(0, 4000)}` : ''
    ].filter(Boolean).join('\n')
  }

  return formatPacketCaptureResult(result.result, input)
}

export const getNetworkBuiltinTools = (): Partial<Tools> => ({
  fetch: {
    title: '网页抓取',
    description: '从互联网抓取一个或多个 URL 的内容，并可按需将网页正文提取为 Markdown 文本。',
    inputSchema: fetchInputSchema,
    execute: async (args: unknown) => {
      try {
        return {
          toolResult: {
            content: [{ type: 'text', text: await buildResultText(args) }]
          }
        }
      } catch (error) {
        return {
          toolResult: {
            content: [{ type: 'text', text: `fetch failed: ${(error as Error).message}` }]
          }
        }
      }
    }
  },
  capture_network_packets: {
    title: '本机网络抓包',
    description:
      '启动一次短时本机网络抓包，捕获固定秒数内所有可见网络数据包/请求并返回协议、端点、DNS 与原始输出摘要。可能需要管理员权限；不会持续后台监听。',
    inputSchema: packetCaptureInputSchema,
    execute: async (args: unknown) => {
      try {
        return {
          toolResult: {
            content: [{ type: 'text', text: await capturePackets(args) }]
          }
        }
      } catch (error) {
        return {
          toolResult: {
            content: [{ type: 'text', text: `capture_network_packets failed: ${(error as Error).message}` }]
          }
        }
      }
    }
  }
})
