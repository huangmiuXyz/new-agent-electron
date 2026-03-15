import { Model } from './ai'

// 显示设置接口
export interface DisplaySettings {
  darkMode: boolean
  compactDensity: boolean
  showTimestamps: boolean
  fontSize: number
  expandToolsByDefault: boolean
  expandThoughtByDefault: boolean
  chatCenteredLayout: boolean
  terminalHeight?: number
}

// 终端设置接口
export interface TerminalSettings {
  fontSize: number
  fontFamily: string
  cursorBlink: boolean
  backgroundColor?: string
  foregroundColor?: string
  cursorColor?: string
  selectionBackgroundColor?: string
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
  hide?: boolean
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
  logo?: string
  providerId: string
  providerType: string
  pluginName: string
  form?: Record<string, unknown>
  models?: Model[]
  baseUrl?: string
  apiKey?: string
  hide?: boolean
}

// 设置状态接口
export interface SettingsState {
  display: DisplaySettings
  terminal: TerminalSettings
  providers: Provider[]
  activeProviderId: string
  mcpServers: Record<string, unknown>
  defaultModels: DefaultModelsSettings
  registeredProviders: RegisteredProvider[]
  providerOptions: Record<string, any>
}

// 加载的插件配置
export interface LoadedPluginConfig {
  name: string
  notificationsDisabled?: boolean
  platforms?: string[]
  mobileUnsupportedReason?: string
}

declare global {
  interface DisplaySettings extends _DisplaySettings {}
  interface TerminalSettings extends _TerminalSettings {}
  interface ollamaSettings extends _ollamaSettings {}
  interface ApiKeyInfo extends _ApiKeyInfo {}
  interface Provider extends _Provider {}
  interface DefaultModelsSettings extends _DefaultModelsSettings {}
  interface RegisteredProvider extends _RegisteredProvider {}
  interface SettingsState extends _SettingsState {}
  interface LoadedPluginConfig extends _LoadedPluginConfig {}
}

type _DisplaySettings = DisplaySettings
type _TerminalSettings = TerminalSettings
type _ollamaSettings = ollamaSettings
type _ApiKeyInfo = ApiKeyInfo
type _Provider = Provider
type _DefaultModelsSettings = DefaultModelsSettings
type _RegisteredProvider = RegisteredProvider
type _SettingsState = SettingsState
type _LoadedPluginConfig = LoadedPluginConfig

export {}
