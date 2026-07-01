import type { LanguageModelMiddleware } from 'ai'

interface RagMiddlewareOptions {
  knowledgeBaseIds?: string[]
  ragEnabled?: boolean
  onRagSearchComplete?: (details: RagSearchDetail[]) => void
}

interface RagSearchDetail {
  knowledgeBaseId: string
  documentId: string
  score?: number
}

export const createRagMiddleware = (options: RagMiddlewareOptions): LanguageModelMiddleware => {
  const { knowledgeBaseIds, ragEnabled, onRagSearchComplete } = options
  return {
    specificationVersion: 'v4',
    transformParams: async ({ params }) => {
      const _t1 = createTimeLog('RAG中间件')
      if (!ragEnabled || !knowledgeBaseIds || knowledgeBaseIds.length === 0) {
        syncTimeLog(_t1, 'RAG中间件')
        return params
      }
      const lastUserMessageText = getLastUserMessageText({
        prompt: params.prompt
      })

      if (lastUserMessageText == null) {
        syncTimeLog(_t1, 'RAG中间件')
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

        const searchDetails: RagSearchDetail[] = allResults.map((result) => ({
          knowledgeBaseId: result.knowledgeBaseId || '',
          documentId: result.documentId || '',
          score: result.score
        }))

        onRagSearchComplete?.(searchDetails)

        if (allResults.length === 0) {
          syncTimeLog(_t1, 'RAG中间件')
          return params
        }

        allResults.sort((a, b) => (b.score || 0) - (a.score || 0))
        const uniqueResults = allResults.filter(
          (result, index, self) => index === self.findIndex((r) => r.content === result.content)
        )

        const limitedResults = limitRagResults(uniqueResults, 6, 6000)
        const contextText = limitedResults
          .map((r, index) => `[参考片段 ${index + 1}]\n${r.content}`)
          .join('\n\n')
        const instruction = [
          '请优先基于以下参考上下文回答；若上下文不足以支持结论，请明确说明，不要臆造。',
          '[参考上下文]',
          contextText,
          '',
          '[用户问题]',
          lastUserMessageText
        ].join('\n')

        syncTimeLog(_t1, 'RAG中间件')
        return addToLastUserMessage({ params, text: instruction })
      } catch (error) {
        console.error('RAG middleware error:', error)
        syncTimeLog(_t1, 'RAG中间件')
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

function limitRagResults(results: any[], maxItems: number, maxChars: number) {
  const limited: any[] = []
  let totalChars = 0

  for (const result of results) {
    if (limited.length >= maxItems) break
    const content = String(result.content || '').trim()
    if (!content) continue

    const nextChars = totalChars + content.length
    if (limited.length > 0 && nextChars > maxChars) break

    limited.push({
      ...result,
      content: totalChars + content.length > maxChars ? content.slice(0, Math.max(0, maxChars - totalChars)) : content
    })
    totalChars += limited[limited.length - 1].content.length

    if (totalChars >= maxChars) break
  }

  return limited
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
