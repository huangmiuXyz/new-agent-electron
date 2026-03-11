import { z } from 'zod'

export const getNetworkBuiltinTools = (options?: {
  knowledgeBaseIds?: string[]
}): Partial<Tools> => ({
  fetch: {
    title: '网络请求',
    description: 'fetch工具，可以获取网页内容或调用API',
    inputSchema: z.object({
      url: z.string().describe('要请求的URL'),
      method: z
        .enum(['GET', 'POST', 'PUT', 'DELETE'])
        .optional()
        .default('GET')
        .describe('请求方法'),
      headers: z.record(z.string(), z.string()).optional().describe('请求头'),
      body: z.string().optional().describe('请求体(POST/PUT时使用)')
    }),
    execute: async (args: any) => {
      const { url, method, headers, body } = args
      try {
        const response = await window.api.net.fetch(url, { method, headers, body })
        if (!response.ok) {
          return {
            toolResult: {
              content: [
                {
                  type: 'text',
                  text: `请求失败: ${response.status} ${response.statusText}\n${response.error || response.text}`
                }
              ]
            }
          }
        }
        return { toolResult: { content: [{ type: 'text', text: response.text }] } }
      } catch (error) {
        return {
          toolResult: { content: [{ type: 'text', text: `请求出错: ${(error as Error).message}` }] }
        }
      }
    }
  }
})
