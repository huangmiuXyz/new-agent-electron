import { useWebWorkerFn } from '@vueuse/core'
import { createRegistry } from '../chatService/registry'
import { splitTextByType } from './splitter'
import { embedMany, embed, cosineSimilarity, rerank as _rerank } from 'ai'
export interface RetrieveOptions {
  similarityThreshold?: number
  topK?: number
  rerankScoreThreshold?: number
}

const rerank = async (
  chunks: Splitter,
  rerankOptions: {
    query: string
    topK?: number
    rerankScoreThreshold?: number
    apiKey: string
    baseURL: string
    providerType: providerType
    model: string
    name: string
  }
) => {
  const topK = rerankOptions?.topK ?? 5
  const rerankScoreThreshold = rerankOptions?.rerankScoreThreshold ?? 0.3
  const registry = createRegistry(rerankOptions) as any
  const model = registry.textEmbeddingModel
    ? registry.textEmbeddingModel(`${rerankOptions.providerType}:${rerankOptions.model}`)
    : registry.embeddingModel(`${rerankOptions.providerType}:${rerankOptions.model}`)

  const response = await _rerank({
    model: model,
    query: rerankOptions.query,
    documents: chunks.map((c) => c.content),
    topN: topK
  })

  const results = (response as any).results

  return results
    .filter((r: any) => r.score > rerankScoreThreshold)
    .map((r: any) => ({
      ...chunks[r.index],
      score: r.score
    }))
}
const vectorSearch = async (
  queryEmbedding: number[],
  chunks: Splitter,
  retrieveOptions?: {
    similarityThreshold?: number
    topK?: number
    rerankScoreThreshold?: number
  }
) => {
  const scoredChunks = chunks
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
  const candidates = scoredChunks
    .filter((chunk) => chunk.score > similarityThreshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(topK * 4, 20))

  if (candidates.length === 0) {
    return []
  }
  return candidates.slice(0, topK)
}
const vectorSearchWorker = useWebWorkerFn(vectorSearch, {
  localDependencies: [cosineSimilarity],
  timeout: 50_000
})
const { workerFn: vectorSearchInWorker } = vectorSearchWorker
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
      currentChunk?: number
      onProgress?: (
        data?: Splitter,
        current?: number,
        total?: number,
        batchChunks?: Splitter
      ) => void
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
      let skippedInBatch = 0

      for (let j = i; j < Math.min(i + batchSize, total); j++) {
        const chunk = splitterClone[j]
        if (options.continueFlag && options.currentChunk && j < options.currentChunk) {
          processed++
          skippedInBatch++
          continue
        }
        batch.push(chunk.content)
        batchIndices.push(j)
      }

      if (batch.length === 0) {
        if (skippedInBatch > 0) {
          reportProgress(processed, total, splitterClone, options)
        }
        continue
      }
      try {
        const { embeddings } = await embedMany({
          model: createRegistry(options).embeddingModel(`${options.providerType}:${options.model}`),
          values: batch,
          abortSignal: options.abortController.signal
        })

        const batchChunks: Splitter = []
        embeddings.forEach((embedding, index) => {
          const chunkIndex = batchIndices[index]
          splitterClone[chunkIndex].embedding = embedding
          batchChunks.push({
            ...splitterClone[chunkIndex],
            id: chunkIndex
          })
          processed++
        })

        reportProgress(processed, total, splitterClone, options, batchChunks)
      } catch (error) {
        const err = error as Error
        if (err.name === 'AbortError') {
          throw error
        }
        messageApi.error(err.message)
        throw error
      }
    }

    options.onProgress?.(splitterClone, total, total)
    return splitterClone
  }
  const syncToSqlite = async (
    kbId: string,
    docId: string,
    chunks: { content: string; embedding: number[] }[]
  ) => {
    if (await window.api.sqlite.isSupported()) {
      const sqliteChunks = chunks.map((c, i) => ({
        id: `${docId}-${i}`,
        doc_id: docId,
        kb_id: kbId,
        content: c.content,
        embedding: Array.from(c.embedding)
      }))
      await window.api.sqlite.upsertChunks(sqliteChunks)
    }
  }

  function reportProgress(
    processed: number,
    total: number,
    splitter: Splitter,
    options: {
      onProgress?: (
        data?: Splitter,
        current?: number,
        total?: number,
        batchChunks?: Splitter
      ) => void
    },
    batchChunks?: Splitter
  ) {
    options.onProgress?.(splitter, processed, total, batchChunks)
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

    const isSqliteSupported = await window.api.sqlite.isSupported()
    let candidates: any[] = []

    if (isSqliteSupported) {
      candidates = await window.api.sqlite.search({
        kb_id: knowledgeBase.id,
        queryEmbedding: Array.from(queryEmbedding),
        topK: retrieveOptions?.topK ?? 5
      })
    } else {
      const allChunks = knowledgeBase.documents?.flatMap((doc) => doc.chunks || []) || []
      if (allChunks.length === 0) {
        return []
      }
      candidates = await vectorSearchInWorker(
        Array.from(queryEmbedding),
        allChunks.map((c) => ({
          content: c.content,
          embedding: Array.from(c.embedding)
        })),
        retrieveOptions
          ? {
              similarityThreshold: retrieveOptions.similarityThreshold,
              topK: retrieveOptions.topK,
              rerankScoreThreshold: retrieveOptions.rerankScoreThreshold
            }
          : undefined
      )
    }

    const topK = retrieveOptions?.topK ?? 5
    if (rerankOptions && rerankOptions.model) {
      return await rerank(candidates, {
        ...rerankOptions,
        query
      })
    }

    return candidates.slice(0, topK)
  }

  return { embedding, retrieve, splitter, syncToSqlite }
}
