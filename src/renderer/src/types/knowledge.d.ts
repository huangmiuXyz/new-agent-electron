import { Embedding } from 'ai'
declare global {
  // 知识库接口
  interface KnowledgeBase {
    id: string
    name: string
    description?: string
    embeddingModel: { modelId: string; providerId: string }
    active: boolean
    created: number
    documents?: KnowledgeDocument[]
    retrieveConfig?: {
      similarityThreshold?: number
      topK?: number
    }
  }
  type KnowledgeDocumentStatus = 'processing' | 'processed' | 'error'
  interface KnowledgeDocument {
    id: string
    name: string
    path: string
    type: SplitType
    size: number
    created: number
    status: KnowledgeDocumentStatus
    chunks?: KnowledgeChunk[]
  }

  interface KnowledgeChunk {
    content: string
    embedding: number[]
  }
}

export {}
