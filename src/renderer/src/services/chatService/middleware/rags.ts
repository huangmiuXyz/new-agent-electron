import type { LanguageModelV3Middleware } from '@ai-sdk/provider'

interface RagMiddlewareOptions {
  knowledgeBaseIds?: string[]
  ragEnabled?: boolean
}

export const createRagMiddleware = (options: RagMiddlewareOptions): LanguageModelV3Middleware => {
  const { knowledgeBaseIds, ragEnabled } = options

  return {
    specificationVersion: 'v3',
    transformParams: async ({ params }) => {
      if (!ragEnabled || !knowledgeBaseIds || knowledgeBaseIds.length === 0) {
        return params
      }
      const lastUserMessageText = getMessageText({
        prompt: params.prompt
      })

      if (lastUserMessageText == null) {
        return params
      }

      try {
        const { search } = useKnowledge()
        const { knowledgeBases } = useKnowledgeStore()

        let allResults: any[] = []

        for (const kbId of knowledgeBaseIds) {
          const knowledge = knowledgeBases.find((k) => k.id === kbId)
          if (!knowledge) continue

          try {
            const results = await search(lastUserMessageText, kbId)
            allResults = allResults.concat(results)
          } catch (error) {
            console.error(`Error searching knowledge base ${kbId}:`, error)
          }
        }

        if (allResults.length === 0) {
          return params
        }

        allResults.sort((a, b) => (b.score || 0) - (a.score || 0))
        const uniqueResults = allResults.filter(
          (result, index, self) => index === self.findIndex((r) => r.content === result.content)
        )

        const contextText = uniqueResults.map((r) => r.content).join('\n\n')
        const instruction = `[参考上下文]:\n${contextText}\n\n[用户问题]:\n${lastUserMessageText}`

        return addMessageText({ params, text: instruction })
      } catch (error) {
        console.error('RAG middleware error:', error)
        return params
      }
    }
  }
}
