declare global {
  // 显示设置接口
  interface DisplaySettings {
    darkMode: boolean
    compactDensity: boolean
    showTimestamps: boolean
    fontSize: number
  }

  // 模型提供商接口
  interface Provider {
    id: string
    name: string
    logo: string
    apiKey?: string
    baseUrl: string
    modelType: ModelType
    models: Model[]
  }

  // 默认模型设置接口
  interface DefaultModelsSettings {
    titleGenerationModelId: string
    titleGenerationProviderId: string
    translationModelId: string
    translationProviderId: string
  }

  // 知识库接口
  interface KnowledgeBase {
    id: string
    name: string
    description?: string
    type: 'local' | 'remote'
    path?: string
    url?: string
    apiKey?: string
    embeddingModel?: string
    chunkSize?: number
    chunkOverlap?: number
    active: boolean
    created: number
    documents?: KnowledgeDocument[]
  }

  // 知识库文档接口
  interface KnowledgeDocument {
    id: string
    name: string
    path: string
    type: string
    size: number
    created: number
    processed: boolean
  }

  // 设置状态接口
  interface SettingsState {
    display: DisplaySettings
    providers: Provider[]
    activeProviderId: string
    mcpServers: ClientConfig
    defaultModels: DefaultModelsSettings
    knowledgeBases: KnowledgeBase[]
  }
}

export {}
