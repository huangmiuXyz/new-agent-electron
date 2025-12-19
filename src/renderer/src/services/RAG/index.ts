import { createRegistry } from '../chatService/registry'
import { splitTextByType } from './splitter'
import { embedMany, embed, cosineSimilarity, rerank } from 'ai'

export interface RetrieveOptions {
  similarityThreshold?: number
  topK?: number
  rerankScoreThreshold?: number
}
export const RAGService = () => {
  const splitter = async (doc: KnowledgeDocument) => {
    let text = ''
    try {
      text = window.api.fs.readFileSync(window.api.url.fileURLToPath(doc.path), 'utf-8')
    } catch (error) {
      doc.url && (text = base64ToText(doc.url))
    }
    const result = await splitTextByType(text, {
      type: doc.type
    })
    return result
  }
  const embedding = async (
    splitter: Splitter,
    options: {
      apiKey: string
      baseURL: string
      providerType: providerType
      model: string
      name: string
      abortController: AbortController
      onProgress?: (data?: Splitter, current?: number, total?: number) => void
      continueFlag: boolean
      batchSize?: number
    }
  ) => {
    const splitterClone = JSON.parse(JSON.stringify(splitter))
    const total = splitterClone.length
    let processed = 0
    const batchSize = options.batchSize || 1

    options.onProgress?.(undefined, 0, total)

    for (let i = 0; i < total; i += batchSize) {
      const batch: string[] = []
      const batchIndices: number[] = []
      for (let j = i; j < Math.min(i + batchSize, total); j++) {
        const chunk = splitterClone[j]
        if (options.continueFlag && chunk.embedding?.length > 0) {
          processed++
          reportProgress(processed, total, splitterClone, options)
          continue
        }
        batch.push(chunk.content)
        batchIndices.push(j)
      }
      if (batch.length === 0) {
        continue
      }
      try {
        const { embeddings } = await embedMany({
          model: createRegistry(options).embeddingModel(`${options.providerType}:${options.model}`),
          values: batch,
          abortSignal: options.abortController.signal
        })

        embeddings.forEach((embedding, index) => {
          const chunkIndex = batchIndices[index]
          splitterClone[chunkIndex].embedding = embedding
          processed++
        })
      } catch (error) {
        messageApi.error((error as Error).message)
      }

      reportProgress(processed, total, splitterClone, options)
    }

    options.onProgress?.(splitterClone, total, total)
    return splitterClone
  }

  function reportProgress(
    processed: number,
    total: number,
    splitter: Splitter,
    options: {
      onProgress?: (data?: Splitter, current?: number, total?: number) => void
    }
  ) {
    options.onProgress?.(splitter, processed, total)
  }

  const retrieve = async (
    query: string,
    knowledgeBase: KnowledgeBase,
    options: {
      apiKey: string
      baseURL: string
      providerType: providerType
      model: string
      name: string
    },
    retrieveOptions?: RetrieveOptions,
    rerankOptions?: {
      apiKey: string
      baseURL: string
      providerType: providerType
      model: string
      name: string
    }
  ) => {
    const { embedding: queryEmbedding } = await embed({
      model: createRegistry(options).embeddingModel(`${options.providerType}:${options.model}`),
      value: query
    })

    const allChunks = knowledgeBase.documents?.flatMap((doc) => doc.chunks || []) || []

    if (allChunks.length === 0) {
      return []
    }
    const scoredChunks = allChunks
      .map((chunk) => {
        try {
          const result = {
            ...chunk,
            score: cosineSimilarity(queryEmbedding, chunk.embedding)
          }
          return result
        } catch {
          return false
        }
      })
      .filter((e) => !!e)

    const similarityThreshold = retrieveOptions?.similarityThreshold ?? 0.2
    const topK = retrieveOptions?.topK ?? 5
    const rerankScoreThreshold = retrieveOptions?.rerankScoreThreshold ?? 0.3

    const candidates = scoredChunks
      .filter((chunk) => chunk.score > similarityThreshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(topK * 4, 20))

    if (candidates.length === 0) {
      return []
    }

    if (rerankOptions && rerankOptions.model) {
      try {
        const registry = createRegistry(rerankOptions) as any
        const model = registry.textEmbeddingModel
          ? registry.textEmbeddingModel(`${rerankOptions.providerType}:${rerankOptions.model}`)
          : registry.embeddingModel(`${rerankOptions.providerType}:${rerankOptions.model}`)

        const response = await rerank({
          model: model,
          query,
          documents: candidates.map((c) => c.content),
          topN: topK
        })

        const results = (response as any).results

        return results
          .filter((r: any) => r.score > rerankScoreThreshold)
          .map((r: any) => ({
            ...candidates[r.index],
            score: r.score
          }))
      } catch (e) {
        console.error('Rerank failed, falling back to vector search results', e)
        return candidates.slice(0, topK)
      }
    }

    return candidates.slice(0, topK)
  }

  return { embedding, retrieve, splitter }
}
