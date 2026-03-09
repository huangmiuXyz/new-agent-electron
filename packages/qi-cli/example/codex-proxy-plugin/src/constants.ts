export const PLUGIN_NAME = 'codex-proxy-plugin'
export const PROVIDER_ID = 'codex-proxy'
export const REGISTRY_ID = 'codex-proxy'
export const STORAGE_KEY = 'codex_proxy_plugin_config'
export const BRIDGE_API_KEY = 'codex-proxy-plugin-local'
import codexColorPng from '../codex-color.png'

export const CODEX_PROVIDER_LOGO_URL = codexColorPng

export interface CodexProxyPluginConfig {
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
  authPath: '',
  status: 'Not detected',
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

export const MODELS = [
  {
    id: 'gpt-5.4',
    alias: 'codex',
    description: 'latest flagship coding model'
  },
  {
    id: 'gpt-5.3-codex',
    description: 'previous flagship agentic coding model'
  },
  {
    id: 'gpt-5.3-codex-spark',
    description: 'ultra-light coding model'
  },
  {
    id: 'gpt-5.2-codex',
    description: 'agentic coding model'
  },
  {
    id: 'gpt-5.1-codex-max',
    alias: 'codex-max',
    description: 'deep reasoning coding model'
  },
  {
    id: 'gpt-5.1-codex-mini',
    alias: 'codex-mini',
    description: 'lightweight fast coding model'
  }
] as const

export const buildDefaultModels = (defaultModel: string) =>
  MODELS.map(({ id, alias, description }) => ({
    id,
    name:
      id === (defaultModel || 'gpt-5.4') || alias === defaultModel
        ? `${alias || id} (default)`
        : alias || id,
    description,
    category: 'text' as const,
    active: true,
    object: 'model',
    created: Date.now(),
    owned_by: 'codex-proxy'
  }))

export const normalizeConfig = (
  input: Partial<CodexProxyPluginConfig> | null | undefined
): CodexProxyPluginConfig => ({
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

