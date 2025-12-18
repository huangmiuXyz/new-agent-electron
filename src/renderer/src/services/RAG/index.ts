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
    const result = await splitTextByType(
      window.api.fs.readFileSync(window.api.url.fileURLToPath(doc.path), 'utf-8'),
      {
        type: doc.type
      }
    )
    return result
  }
  const embedding = async (
    splitter: Splitter,
    options: {
      kbId: string
      docId: string
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

    // Clear existing chunks for this doc if not continuing
    if (!options.continueFlag) {
      try {
        await window.api.sqlite.deleteChunksByDoc(options.docId)
      } catch (e) {
        console.error('Failed to clear existing chunks from SQLite', e)
      }
    }

    let vssInitialized = false

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

        if (!vssInitialized && embeddings.length > 0) {
          try {
            await window.api.sqlite.initVssTable(embeddings[0].length)
            vssInitialized = true
          } catch (e) {
            console.error('Failed to init VSS table', e)
          }
        }

        const chunksToInsert = embeddings.map((embedding, index) => {
          const chunkIndex = batchIndices[index]
          splitterClone[chunkIndex].embedding = embedding
          processed++
          return {
            kb_id: options.kbId,
            doc_id: options.docId,
            content: splitterClone[chunkIndex].content,
            embedding: embedding,
            metadata: splitterClone[chunkIndex].metadata
          }
        })

        if (vssInitialized) {
          try {
            await window.api.sqlite.insertChunks(chunksToInsert)
          } catch (e) {
            console.error('Failed to insert chunks into SQLite', e)
          }
        }
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

    const similarityThreshold = retrieveOptions?.similarityThreshold ?? 0.2
    const topK = retrieveOptions?.topK ?? 5
    const rerankScoreThreshold = retrieveOptions?.rerankScoreThreshold ?? 0.3

    let candidates: any[] = []

    // Try SQLite-VSS search first
    try {
      candidates = await window.api.sqlite.searchChunks(knowledgeBase.id, queryEmbedding, topK * 4)

      // searchChunks returns score as similarity (1 - distance)
    } catch (e) {
      console.error('SQLite-VSS search failed, falling back to manual search', e)
      const allChunks = knowledgeBase.documents?.flatMap((doc) => doc.chunks || []) || []

      if (allChunks.length === 0) {
        return []
      }
      candidates = allChunks
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
        .filter((e) => !!e) as any[]
    }

    candidates = candidates
      .filter((chunk) => chunk.score > similarityThreshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(topK * 4, 10))

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
