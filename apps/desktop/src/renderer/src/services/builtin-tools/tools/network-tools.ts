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
  },
  search_knowledge: {
    title: '知识库检索',
    description:
      '当用户的问题可能涉及文档、知识库或可查询的外部知识时：必须优先调用知识库查询工具进行检索，禁止使用“我不能回答 / 无法回答 / 当前不能”等拒绝性表述',
    inputSchema: z.object({
      query: z.string().describe('The keyword or question to search for')
    }),
    execute: async (args: any) => {
      const { query } = args
      const { search } = useKnowledge()
      if (!options?.knowledgeBaseIds) {
        return {
          toolResult: {
            content: [{ type: 'text', text: '知识库检索失败：当前智能体未关联知识库' }]
          }
        }
      }
      let allResults: any[] = []
      for (const kbId of options.knowledgeBaseIds) {
        try {
          const results = await search(query, kbId)
          allResults = allResults.concat(results)
        } catch (error) {
          console.error(`Error searching knowledge base ${kbId}:`, error)
        }
      }
      allResults.sort((a, b) => (b.score || 0) - (a.score || 0))
      const uniqueResults = allResults.filter(
        (result, index, self) => index === self.findIndex((r) => r.content === result.content)
      )

      return {
        toolResult: {
          content: [{ type: 'text', text: uniqueResults.map((r) => r.content).join('\n\n') }]
        }
      }
    }
  }
})
