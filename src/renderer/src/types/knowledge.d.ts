import { Embedding } from 'ai'
declare global {
  // 知识库接口
  interface KnowledgeBase {
    id: string
    name: string
    description?: string
    embeddingModel: { modelId: string; providerId: string }
    rerankModel?: { modelId: string; providerId: string }
    active: boolean
    created: number
    documents?: KnowledgeDocument[]
    retrieveConfig?: {
      similarityThreshold?: number
      topK?: number
      rerankScoreThreshold?: number
    }
  }
  type KnowledgeDocumentStatus = 'processing' | 'processed' | 'error' | 'aborted'
  interface KnowledgeDocument {
    id: string
    name: string
    path: string
    type: SplitType
    size: number
    created: number
    status: KnowledgeDocumentStatus
    chunks?: KnowledgeChunk[]
    abortController?: AbortController
    progress?: number
    isSplitting?: boolean
    metadata?: {
      modelId: string
      providerId: string
    }
  }

  interface KnowledgeChunk {
    content: string
    embedding: number[]
  }
  type Splitter = { content: string; embedding: number[] }[]
}

export {}
