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

const buildRequestHeaders = (headers?: Record<string, string>) => ({
  'User-Agent': USER_AGENT,
  ...headers
})

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
