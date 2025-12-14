import { createRegistry } from '../chatService/registry'
import { splitTextByType } from './splitter'
import { embed, embedMany, cosineSimilarity } from 'ai'

export const RAGService = () => {
  const embedding = async (
    doc: KnowledgeDocument,
    options: {
      apiKey: string
      baseURL: string
      providerType: providerType
      model: string
      name: string
    }
  ) => {
    const result = await splitTextByType(window.api.fs.readFileSync(doc.path, 'utf-8'), {
      type: doc.type
    })
    const { embeddings } = await embedMany({
      model: createRegistry(options).embeddingModel(`${options.providerType}:${options.model}`),
      values: result
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
    }
  ) => {
    const { embedding: queryEmbedding } = await embed({
      model: createRegistry(options).embeddingModel(`${options.providerType}:${options.model}`),
      value: query
    })

    const allChunks = knowledgeBase.documents?.flatMap((doc) => doc.chunks || []) || []

    // Check if chunks exist
    if (allChunks.length === 0) {
      return []
    }

    const scoredChunks = allChunks.map((chunk) => ({
      ...chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding)
    }))

    return scoredChunks.filter((chunk) => chunk.score > 0.2).slice(0, 5)
  }

  return { embedding, retrieve }
}
