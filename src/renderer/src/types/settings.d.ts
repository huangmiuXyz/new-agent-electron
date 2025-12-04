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
    modelType: 'anthropic' | 'openai' | 'deepseek' | 'google' | 'xai'
    models: Model[]
  }

  // 设置状态接口
  interface SettingsState {
    display: DisplaySettings
    providers: Provider[]
    activeProviderId: string
    mcpServers: ClientConfig
  }
}

export {}
