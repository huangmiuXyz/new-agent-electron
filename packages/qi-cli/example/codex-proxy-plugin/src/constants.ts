export const PLUGIN_NAME = 'codex-proxy'
export const PROVIDER_ID = 'codex-proxy'
export const REGISTRY_ID = 'codex-proxy'
export const STORAGE_KEY = 'codex_proxy_plugin_config'
export const BRIDGE_API_KEY = 'codex-proxy-local'
import type { Model } from '@agent-qi/types'
import codexColorPng from '../codex-color.png'

export const CODEX_PROVIDER_LOGO_URL = codexColorPng

export interface CodexProxyAccountProfile {
  id: string
  authPath: string
  accessToken: string
  idToken: string
  accountId: string
  email: string
  planType: string
  authMode: string
  lastRefresh: string
}

export interface CodexProxyPluginConfig {
  accounts: CodexProxyAccountProfile[]
  activeAccountId: string
  authPath: string
  status: string
  email: string
  accountId: string
  planType: string
  authMode: string
  lastRefresh: string
  accessToken: string
  bridgeHost: string
  bridgePort: number
  defaultModel: string
}

export const DEFAULT_CONFIG: CodexProxyPluginConfig = {
  accounts: [],
  activeAccountId: '',
  authPath: '',
  status: '未检测到登录',
  email: '',
  accountId: '',
  planType: '',
  authMode: '',
  lastRefresh: '',
  accessToken: '',
  bridgeHost: '127.0.0.1',
  bridgePort: 18123,
  defaultModel: 'codex'
}

type BuiltinModel = {
  id: string
  alias?: string
  description: string
}

export const MODELS: ReadonlyArray<BuiltinModel> = [
  {
    id: 'gpt-5.4',
    alias: 'codex',
    description: '最新旗舰编程模型'
  },
  {
    id: 'gpt-5.3-codex',
    description: '上一代旗舰智能体编程模型'
  },
  {
    id: 'gpt-5.3-codex-spark',
    description: '超轻量编程模型'
  },
  {
    id: 'gpt-5.2-codex',
    description: '智能体编程模型'
  },
  {
    id: 'gpt-5.1-codex-max',
    alias: 'codex-max',
    description: '深度推理编程模型'
  },
  {
    id: 'gpt-5.1-codex-mini',
    alias: 'codex-mini',
    description: '轻量高速编程模型'
  }
] as const

export const buildDefaultModels = (defaultModel: string): Model[] =>
  MODELS.map(({ id, alias, description }) => ({
    id,
    name:
      id === (defaultModel || 'gpt-5.4') || alias === defaultModel
        ? `${alias || id} (default)`
        : alias || id,
    description,
    category: 'text' as const,
    active: true,
    object: 'model' as const,
    created: Date.now(),
    owned_by: 'codex-proxy'
  }))

export const normalizeConfig = (
  input: Partial<CodexProxyPluginConfig> | null | undefined
): CodexProxyPluginConfig => ({
  accounts: Array.isArray(input?.accounts)
    ? input.accounts
        .filter((item): item is CodexProxyAccountProfile => Boolean(item))
        .map((item) => ({
          id: String(item.id || item.accountId || '').trim(),
          authPath: String(item.authPath || '').trim(),
          accessToken: String(item.accessToken || '').trim(),
          idToken: String(item.idToken || '').trim(),
          accountId: String(item.accountId || '').trim(),
          email: String(item.email || '').trim(),
          planType: String(item.planType || '').trim(),
          authMode: String(item.authMode || '').trim(),
          lastRefresh: String(item.lastRefresh || '').trim()
        }))
        .filter((item) => item.id && item.accountId && item.accessToken)
    : [],
  activeAccountId: String(input?.activeAccountId || '').trim(),
  authPath: String(input?.authPath || '').trim(),
  status: String(input?.status || DEFAULT_CONFIG.status).trim() || DEFAULT_CONFIG.status,
  email: String(input?.email || '').trim(),
  accessToken: String(input?.accessToken || '').trim(),
  accountId: String(input?.accountId || '').trim(),
  planType: String(input?.planType || '').trim(),
  authMode: String(input?.authMode || '').trim(),
  lastRefresh: String(input?.lastRefresh || '').trim(),
  bridgeHost:
    String(input?.bridgeHost || DEFAULT_CONFIG.bridgeHost).trim() ||
    DEFAULT_CONFIG.bridgeHost,
  bridgePort:
    Number(input?.bridgePort || DEFAULT_CONFIG.bridgePort) ||
    DEFAULT_CONFIG.bridgePort,
  defaultModel:
    String(input?.defaultModel || DEFAULT_CONFIG.defaultModel).trim() ||
    DEFAULT_CONFIG.defaultModel
})
