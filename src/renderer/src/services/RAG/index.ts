import { createRegistry } from '../chatService/registry'
import { splitTextByType } from './splitter'
import { embed, cosineSimilarity, rerank } from 'ai'

export interface RetrieveOptions {
  similarityThreshold?: number
  topK?: number
  rerankScoreThreshold?: number
}
export const RAGService = () => {
  const splitter = async (doc: KnowledgeDocument) => {
    const result = await splitTextByType(window.api.fs.readFileSync(doc.path, 'utf-8'), {
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
      onProgress?: (progress: number, data?: Splitter) => void
      continueFlag: boolean
    }
  ) => {
    const splitterClone = JSON.parse(JSON.stringify(splitter))
    const total = splitterClone.length
    let processed = 0
    options.onProgress?.(1)
    for (let i = 0; i < total; i++) {
      if (options.abortController.signal.aborted) {
        throw new Error('Embedding aborted')
      }
      const chunk = splitterClone[i]
      if (options.continueFlag && chunk.embedding?.length > 0) {
        processed++
        reportProgress(processed, total, options)
        continue
      }
      const { embedding } = await embed({
        model: createRegistry(options).embeddingModel(`${options.providerType}:${options.model}`),
        value: chunk.content,
        abortSignal: options.abortController.signal
      })
      chunk.embedding = embedding
      processed++
      reportProgress(processed, total, options)
    }

    options.onProgress?.(100, splitterClone)
    return splitterClone
  }

  function reportProgress(
    processed: number,
    total: number,
    options: {
      onProgress?: (progress: number, data?: Splitter) => void
    }
  ) {
    const progress = Math.min(20 + 80 * (processed / total), 100)
    options.onProgress?.(Math.round(progress))
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

    const scoredChunks = allChunks.map((chunk) => ({
      ...chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding)
    }))

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
