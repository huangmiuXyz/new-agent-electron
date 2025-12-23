import type { LanguageModelV3Middleware } from '@ai-sdk/provider'

interface RagMiddlewareOptions {
  knowledgeBaseIds?: string[]
  ragEnabled?: boolean
  onRagSearchStart?: () => void
  onRagSearchComplete?: (resultCount: number) => void
}

export const createRagMiddleware = (options: RagMiddlewareOptions): LanguageModelV3Middleware => {
  const { knowledgeBaseIds, ragEnabled, onRagSearchStart, onRagSearchComplete } = options

  return {
    specificationVersion: 'v3',
    transformParams: async ({ params }) => {
      if (!ragEnabled || !knowledgeBaseIds || knowledgeBaseIds.length === 0) {
        return params
      }
      const lastUserMessageText = getLastUserMessageText({
        prompt: params.prompt
      })

      if (lastUserMessageText == null) {
        return params
      }

      try {
        onRagSearchStart?.()
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

        onRagSearchComplete?.(allResults.length)
        
        if (allResults.length === 0) {
          return params
        }

        allResults.sort((a, b) => (b.score || 0) - (a.score || 0))
        const uniqueResults = allResults.filter(
          (result, index, self) => index === self.findIndex((r) => r.content === result.content)
        )

        const contextText = uniqueResults.map((r) => r.content).join('\n\n')
        const instruction = `[参考上下文]:\n${contextText}\n\n[用户问题]:\n${lastUserMessageText}`

        return addToLastUserMessage({ params, text: instruction })
      } catch (error) {
        console.error('RAG middleware error:', error)
        return params
      }
    }
  }
}

function getLastUserMessageText({ prompt }: { prompt: any }): string | null {
  if (typeof prompt === 'string') {
    return prompt
  }

  if (Array.isArray(prompt)) {
    for (let i = prompt.length - 1; i >= 0; i--) {
      const message = prompt[i]
      if (message.role === 'user') {
        if (typeof message.content === 'string') {
          return message.content
        }
        if (Array.isArray(message.content)) {
          const textPart = message.content.find((part: any) => part.type === 'text')
          if (textPart && textPart.text) {
            return textPart.text
          }
        }
      }
    }
  }

  return null
}

function addToLastUserMessage({ params, text }: { params: any; text: string }): any {
  if (typeof params.prompt === 'string') {
    return {
      ...params,
      prompt: text
    }
  }

  if (Array.isArray(params.prompt)) {
    const newPrompt = [...params.prompt]

    for (let i = newPrompt.length - 1; i >= 0; i--) {
      const message = newPrompt[i]
      if (message.role === 'user') {
        if (typeof message.content === 'string') {
          newPrompt[i] = {
            ...message,
            content: text
          }
        } else if (Array.isArray(message.content)) {
          const newContent = message.content.map((part: any) => {
            if (part.type === 'text') {
              return {
                ...part,
                text
              }
            }
            return part
          })
          newPrompt[i] = {
            ...message,
            content: newContent
          }
        }
        break
      }
    }

    return {
      ...params,
      prompt: newPrompt
    }
  }

  return params
}
