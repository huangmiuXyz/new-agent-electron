declare global {
  // 知识库接口
  interface KnowledgeBase {
    id: string
    name: string
    description?: string
    embeddingModel?: {}
    active: boolean
    created: number
    documents?: KnowledgeDocument[]
  }

  // 知识库文档接口
  interface KnowledgeDocument {
    id: string
    name: string
    path: string
    type: SplitType
    size: number
    created: number
    processed?: boolean
  }
}

export {}
