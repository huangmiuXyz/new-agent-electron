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
    providerType: providerType
    models: Model[]
  }

  // 默认模型设置接口
  interface DefaultModelsSettings {
    titleGenerationModelId: string
    titleGenerationProviderId: string
    translationModelId: string
    translationProviderId: string
  }

  // 设置状态接口
  interface SettingsState {
    display: DisplaySettings
    providers: Provider[]
    activeProviderId: string
    mcpServers: ClientConfig
    defaultModels: DefaultModelsSettings
  }
}

export {}
