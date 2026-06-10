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

const cleanCaptureLines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !/^time,,interface,state,/i.test(line) &&
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
})
