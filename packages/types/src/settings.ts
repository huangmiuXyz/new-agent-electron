import { providerType, Model, ClientConfig } from './ai'

// 显示设置接口
export interface DisplaySettings {
  darkMode: boolean
  compactDensity: boolean
  showTimestamps: boolean
  fontSize: number
  expandToolsByDefault: boolean
  expandThoughtByDefault: boolean
}

// 终端设置接口
export interface TerminalSettings {
  fontSize: number
  fontFamily: string
  cursorBlink: boolean
}

export interface ollamaSettings {
  autoStart?: boolean
}

export interface ApiKeyInfo {
  id: string
  name: string
  key: string
}

// 模型提供商接口
export interface Provider extends ollamaSettings {
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
export interface DefaultModelsSettings {
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

export interface RegisteredProvider {
  id: string
  name: string
  providerId: string
  pluginName: string
  form?: any
  models?: Model[]
}

// 设置状态接口
export interface SettingsState {
  display: DisplaySettings
  terminal: TerminalSettings
  providers: Provider[]
  activeProviderId: string
  mcpServers: ClientConfig
  defaultModels: DefaultModelsSettings
  registeredProviders: RegisteredProvider[]
}

// 加载的插件配置
export interface LoadedPluginConfig {
  name: string
  notificationsDisabled?: boolean
}
