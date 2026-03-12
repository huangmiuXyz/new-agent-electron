import TurndownService from 'turndown'
import { Readability } from '@mozilla/readability'
import { z } from 'zod'

const USER_AGENT = "Mozilla/5.0"

const fetchInputSchema = z.object({
  url: z.string().url().describe('URL to fetch'),
  max_length: z.number().int().positive().max(999999).default(5000).describe('Maximum number of characters to return'),
  start_index: z.number().int().min(0).default(0).describe('Character offset to start returning content from'),
  raw: z.boolean().default(false).describe('Return raw page content instead of simplified markdown')
})

const browserInputSchema = z.object({
  session_id: z
    .string()
    .min(1)
    .optional()
    .default('default')
    .describe(
      'Browser session identifier. Reuse the same session_id within a conversation when you want to keep page state, but never run concurrent browser_use calls that navigate within the same session because later navigations will abort earlier ones.'
    ),
  timeout_ms: z.number().int().positive().max(300000).optional().default(30000),
  max_result_length: z.number().int().positive().max(50000).optional().default(8000),
  headless: z
    .boolean()
    .optional()
    .default(true)
    .describe('Whether to run headless. Prefer headless=false unless the user or environment explicitly requires headless mode.'),
  code: z.string().min(1).describe(
    'JavaScript code executed directly inside the page via webContents.executeJavaScript. Use browser globals like window, document, location, fetch, localStorage, and DOM APIs directly. For reliable navigation, return an object like { __browser_goto: "https://example.com" } so the main process performs loadURL(). Important: browser_use calls that navigate must be executed serially per session_id. Do not issue multiple parallel navigations in the same session.'
  )
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

const checkRobotsTxt = async (url: string) => {
  const robotsUrl = getRobotsTxtUrl(url)
  const response = await fetchWithFallback(robotsUrl, {
    headers: { 'User-Agent': USER_AGENT }
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

const fetchPage = async (url: string, raw: boolean) => {
  const response = await fetchWithFallback(url, {
    headers: { 'User-Agent': USER_AGENT }
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

const buildResultText = async (args: unknown) => {
  const input = fetchInputSchema.parse(args)
  await checkRobotsTxt(input.url)

  const { prefix, content } = await fetchPage(input.url, input.raw)
  const chunk = content.slice(input.start_index, input.start_index + input.max_length)

  if (!chunk) {
    return `${prefix}Contents of ${input.url}:\n<error>No more content available.</error>`
  }

  const nextStart = input.start_index + chunk.length
  const suffix =
    nextStart < content.length
      ? `\n\n<error>Content truncated. Call the fetch tool with a start_index of ${nextStart} to get more content.</error>`
      : ''

  return `${prefix}Contents of ${input.url}:\n${chunk}${suffix}`
}

const toPrettyJson = (value: unknown) => {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const isProbablyHtml = (value: string) => {
  const sample = value.slice(0, 500).toLowerCase()
  return sample.includes('<html') || sample.includes('<body') || sample.includes('<div') || sample.includes('<!doctype')
}

const truncateText = (value: string, maxLength: number) => {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength)}\n\n<result truncated: ${value.length - maxLength} more characters>`
}

const formatBrowserResult = (result: unknown, maxLength: number) => {
  if (typeof result === 'string') {
    if (isProbablyHtml(result)) {
      const simplified = simplifyHtml(result)
      return `result_format: simplified_html\n${truncateText(simplified, maxLength)}`
    }

    return `result_format: text\n${truncateText(result, maxLength)}`
  }

  const serialized = toPrettyJson(result)
  return `result_format: json\n${truncateText(serialized, maxLength)}`
}

const formatPageSnapshot = (snapshot: unknown, maxLength: number) => {
  if (!snapshot || typeof snapshot !== 'object') {
    return 'page_snapshot: unavailable'
  }

  const data = snapshot as {
    title?: string
    url?: string
    hash?: string
    state?: string
    readyState?: string
    activeElement?: { tag?: string; selector?: string; text?: string } | null
    mainText?: string
    textSample?: string
    searchResults?: Array<{ title?: string; url?: string; snippet?: string }>
    buttons?: Array<{ id?: string; text?: string; selector?: string; disabled?: boolean; priority?: number; region?: string }>
    inputs?: Array<{
      id?: string
      tag?: string
      type?: string
      name?: string
      selector?: string
      placeholder?: string
      value?: string
      disabled?: boolean
      priority?: number
      region?: string
    }>
    links?: Array<{ id?: string; text?: string; href?: string; selector?: string; priority?: number; region?: string }>
    iframes?: Array<{
      id?: string
      selector?: string
      src?: string
      visible?: boolean
      active?: boolean
      sameOrigin?: boolean
      accessible?: boolean
      title?: string
      url?: string
      mainText?: string
      buttons?: Array<{ id?: string; text?: string; selector?: string }>
      inputs?: Array<{ id?: string; tag?: string; type?: string; name?: string; selector?: string }>
      links?: Array<{ id?: string; text?: string; href?: string; selector?: string }>
    }>
  }

  const lines: string[] = [
    'page_snapshot:',
    `title: ${data.title || ''}`,
    `url: ${data.url || ''}`,
    `hash: ${data.hash || ''}`,
    `state: ${data.state || 'unknown'}`,
    `ready_state: ${data.readyState || 'unknown'}`
  ]

  if (data.activeElement) {
    lines.push(
      `active_element: ${[data.activeElement.tag, data.activeElement.selector, data.activeElement.text].filter(Boolean).join(' | ')}`
    )
  }

  if (data.mainText) {
    lines.push('main_text:')
    lines.push(data.mainText)
  } else if (data.textSample) {
    lines.push('text_sample:')
    lines.push(data.textSample)
  }

  const searchResults = (data.searchResults || []).slice(0, 10)
  lines.push(`search_results (${data.searchResults?.length || 0}):`)
  if (searchResults.length === 0) {
    lines.push('- none')
  } else {
    for (const item of searchResults) {
      lines.push(`- ${item.title || ''} -> ${item.url || ''}`.trim())
      if (item.snippet) lines.push(`  snippet: ${item.snippet}`)
    }
  }

  const buttons = (data.buttons || []).slice(0, 20)
  lines.push(`buttons (${data.buttons?.length || 0}):`)
  if (buttons.length === 0) {
    lines.push('- none')
  } else {
    for (const button of buttons) {
      lines.push(
        `- ${button.id || ''} text=${JSON.stringify(button.text || '')} disabled=${button.disabled ? 'true' : 'false'} selector=${button.selector || ''}${typeof button.priority === 'number' ? ` priority=${button.priority}` : ''}${button.region ? ` region=${button.region}` : ''}`.trim()
      )
    }
  }

  const inputs = (data.inputs || []).slice(0, 20)
  lines.push(`inputs (${data.inputs?.length || 0}):`)
  if (inputs.length === 0) {
    lines.push('- none')
  } else {
    for (const input of inputs) {
      lines.push(
        `- ${input.id || ''} tag=${input.tag || 'input'} type=${input.type || ''} name=${input.name || ''} disabled=${input.disabled ? 'true' : 'false'} selector=${input.selector || ''} placeholder=${JSON.stringify(input.placeholder || '')}${typeof input.priority === 'number' ? ` priority=${input.priority}` : ''}${input.region ? ` region=${input.region}` : ''}`.trim()
      )
    }
  }

  const links = (data.links || []).slice(0, 20)
  lines.push(`links (${data.links?.length || 0}):`)
  if (links.length === 0) {
    lines.push('- none')
  } else {
    for (const link of links) {
      lines.push(
        `- ${link.id || ''} text=${JSON.stringify(link.text || '')} selector=${link.selector || ''}${typeof link.priority === 'number' ? ` priority=${link.priority}` : ''}${link.region ? ` region=${link.region}` : ''} -> ${link.href || ''}`.trim()
      )
    }
  }

  const iframes = (data.iframes || []).slice(0, 10)
  lines.push(`iframes (${data.iframes?.length || 0}):`)
  if (iframes.length === 0) {
    lines.push('- none')
  } else {
    for (const frame of iframes) {
      lines.push(
        `- ${frame.id || ''} selector=${frame.selector || ''} visible=${frame.visible ? 'true' : 'false'} active=${frame.active ? 'true' : 'false'} same_origin=${frame.sameOrigin ? 'true' : 'false'} accessible=${frame.accessible ? 'true' : 'false'} src=${JSON.stringify(frame.src || '')}`.trim()
      )
      if (frame.title || frame.url) {
        lines.push(`  title=${JSON.stringify(frame.title || '')} url=${frame.url || ''}`)
      }
      if (frame.mainText) {
        lines.push(`  main_text=${JSON.stringify(frame.mainText.slice(0, 240))}`)
      }
      if (frame.buttons?.length || frame.inputs?.length || frame.links?.length) {
        lines.push(
          `  content: buttons=${frame.buttons?.length || 0} inputs=${frame.inputs?.length || 0} links=${frame.links?.length || 0}`
        )
      }
    }
  }

  return truncateText(lines.join('\n'), maxLength)
}

const waitForBrowserRun = async (input: z.infer<typeof browserInputSchema>) => {
  const runPromise = window.api.browser.run({
    sessionId: input.session_id,
    action: 'execute_code',
    code: input.code,
    timeoutMs: input.timeout_ms,
    headless: input.headless
  })

  const hungProbeDelayMs = input.timeout_ms + 2000

  const probePromise = new Promise<never>((_, reject) => {
    window.setTimeout(async () => {
      try {
        const state = await window.api.browser.getState(input.session_id)
        if (state?.running || state?.lastError) {
          reject(
            new Error(
              [
                state?.lastError ? 'browser_use failed in main process' : 'browser_use appears stuck',
                `last_step: ${state?.lastStep || 'unknown'}`,
                state?.lastError ? `last_error: ${state.lastError}` : '',
                state.logs?.length ? `logs:\n${state.logs.join('\n')}` : ''
              ]
                .filter(Boolean)
                .join('\n\n')
            )
          )
          return
        }
      } catch {
        // Ignore probe failures and continue waiting for the original run result.
      }
    }, hungProbeDelayMs)
  })

  return Promise.race([runPromise, probePromise])
}

export const getNetworkBuiltinTools = (): Partial<Tools> => ({
  fetch: {
    title: '网页抓取',
    description: 'Fetch a URL from the internet and optionally extract its contents as markdown.',
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
  browser_use: {
    title: '浏览器操作',
    description:
      '在 Electron BrowserWindow 页面中直接执行 JavaScript，并返回精简执行结果以及页面快照，包括按钮、输入框和链接。若需要更可靠的页面跳转，可在 JS 中返回 { __browser_goto: url }。需要保留页面状态时请复用同一个 session_id，建议优先使用 headless=false，并且同一个 session 中不要并发执行多个会导航的调用，否则后发起的导航会中断先前的导航。',
    inputSchema: browserInputSchema,
    execute: async (args: unknown) => {
      try {
        const input = browserInputSchema.parse(args)
        const result = await waitForBrowserRun(input)

        if (!result?.ok) {
          throw new Error(result?.error || 'browser code execution failed')
        }

        const data = result.data as {
          sessionId: string
          execution?: {
            mode?: string
            requestedUrl?: string
            returnedValue?: unknown
          }
          navigation?: {
            detected?: boolean
            type?: string
            fromUrl?: string
            toUrl?: string
            requestedUrl?: string
          }
          page?: {
            finalUrl?: string
            loading?: boolean
            title?: string
            timing?: {
              startedAt?: number | null
              finishedAt?: number | null
              durationMs?: number | null
            }
          }
          logs?: string[]
          pageSnapshot?: unknown
          screenshot?: {
            imageDataUrl: string
            width: number
            height: number
          } | null
        }

        const executionBlock = [
          `execution_mode: ${data.execution?.mode || 'unknown'}`,
          data.execution?.requestedUrl ? `execution_requested_url: ${data.execution.requestedUrl}` : '',
          formatBrowserResult(data.execution?.returnedValue ?? null, input.max_result_length)
        ]
          .filter(Boolean)
          .join('\n')

        const navigationBlock = [
          'navigation:',
          `detected: ${data.navigation?.detected ? 'true' : 'false'}`,
          `type: ${data.navigation?.type || 'unknown'}`,
          `from_url: ${data.navigation?.fromUrl || ''}`,
          `to_url: ${data.navigation?.toUrl || ''}`,
          data.navigation?.requestedUrl ? `requested_url: ${data.navigation.requestedUrl}` : ''
        ]
          .filter(Boolean)
          .join('\n')

        const pageBlock = [
          'page:',
          `final_url: ${data.page?.finalUrl || ''}`,
          `title: ${data.page?.title || ''}`,
          `loading: ${data.page?.loading ? 'true' : 'false'}`,
          `duration_ms: ${data.page?.timing?.durationMs ?? ''}`
        ]
          .filter(Boolean)
          .join('\n')

        const content: Array<{ type: 'text'; text: string } | { type: 'image-url'; url: string }> = [
          {
            type: 'text',
            text: `action: execute_code\nsession_id: ${data.sessionId}\n\n${executionBlock}\n\n${navigationBlock}\n\n${pageBlock}\n\n${formatPageSnapshot(data.pageSnapshot, Math.max(1500, Math.floor(input.max_result_length / 2)))}${data.logs?.length ? `\n\nlogs:\n${data.logs.join('\n')}` : ''}`
          }
        ]

        return {
          toolResult: {
            content
          }
        }
      } catch (error) {
        return {
          toolResult: {
            content: [{ type: 'text', text: `browser_use failed: ${(error as Error).message}` }]
          }
        }
      }
    }
  }
})
