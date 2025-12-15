import { createRegistry } from '../chatService/registry'
import { splitTextByType } from './splitter'
import { embed, embedMany, cosineSimilarity, rerank } from 'ai'

export interface RetrieveOptions {
  similarityThreshold?: number
  topK?: number
  rerankScoreThreshold?: number
}

export const RAGService = () => {
  const embedding = async (
    doc: KnowledgeDocument,
    options: {
      apiKey: string
      baseURL: string
      providerType: providerType
      model: string
      name: string
      abortController: AbortController
    }
  ) => {
    const result = await splitTextByType(window.api.fs.readFileSync(doc.path, 'utf-8'), {
      type: doc.type
    })
    const { embeddings } = await embedMany({
      model: createRegistry(options).embeddingModel(`${options.providerType}:${options.model}`),
      values: result,
      abortSignal: options.abortController.signal
    })
    return result.map((content, index) => ({
      content,
      embedding: embeddings[index]
    }))
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

  return { embedding, retrieve }
}
