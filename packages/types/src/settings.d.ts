declare global {
  // 显示设置接口
  interface DisplaySettings {
    darkMode: boolean
    compactDensity: boolean
    showTimestamps: boolean
    fontSize: number
    expandToolsByDefault: boolean
    expandThoughtByDefault: boolean
  }

  // 终端设置接口
  interface TerminalSettings {
    fontSize: number
    fontFamily: string
    cursorBlink: boolean
  }

  interface ollamaSettings {
    autoStart?: boolean
  }

  interface ApiKeyInfo {
    id: string
    name: string
    key: string
  }

  // 模型提供商接口
  interface Provider extends ollamaSettings {
    id: string
    name: string
    logo: string
    apiKey?: string
    apiKeys?: ApiKeyInfo[]
    activeApiKeyId?: string
    baseUrl: string
    providerType: providerType
    models: Model[]
    pluginName?: string // 标记是否由插件注册
  }
  // 默认模型设置接口
  interface DefaultModelsSettings {
    titleGenerationModelId: string
    titleGenerationProviderId: string
    translationModelId: string
    translationProviderId: string
    searchModelId: string
    searchProviderId: string
    speechModelId: string | string[]
    speechProviderId: string | string[]
    speechVoice: string
    speechMode: 'sentence' | 'paragraph' | 'full'
    speechSpeed?: number
    speechLanguage?: string
  }

  interface RegisteredProvider {
    id: string
    name: string
    providerId: string
    providerType: string
    pluginName: string
    form?: any
    models?: Model[]
    baseUrl?: string
    apiKey?: string
  }

  // 设置状态接口
  interface SettingsState {
    display: DisplaySettings
    terminal: TerminalSettings
    providers: Provider[]
    activeProviderId: string
    mcpServers: ClientConfig
    defaultModels: DefaultModelsSettings
    registeredProviders: RegisteredProvider[]
  }

  // 加载的插件配置
  interface LoadedPluginConfig {
    name: string
    notificationsDisabled?: boolean
  }
}

export {}
