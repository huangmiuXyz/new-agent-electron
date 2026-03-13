export const PLUGIN_NAME = 'codex-proxy'
export const PROVIDER_ID = 'codex-proxy'
export const REGISTRY_ID = 'codex-proxy'
export const STORAGE_KEY = 'codex_proxy_plugin_config'
export const SERVICE_STATUS_ID = 'codex-proxy-account-status'
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
  usage: CodexProxyUsageSnapshot | null
  usageError: string
}

export interface CodexProxyUsageWindow {
  usedPercent: number
  windowSeconds: number
  resetAt: number | null
}

export interface CodexProxyCreditSnapshot {
  hasCredits: boolean
  unlimited: boolean
  balance: string | null
}

export interface CodexProxyUsageSnapshot {
  fetchedAt: number
  planType: string | null
  fiveHour: CodexProxyUsageWindow | null
  oneWeek: CodexProxyUsageWindow | null
  credits: CodexProxyCreditSnapshot | null
}

export type CodexReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh'

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
  reasoningEffort: CodexReasoningEffort
  usage: CodexProxyUsageSnapshot | null
  usageError: string
  creditsDisplay: string
  fiveHourDisplay: string
  fiveHourResetDisplay: string
  oneWeekDisplay: string
  oneWeekResetDisplay: string
  usageUpdatedDisplay: string
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
  defaultModel: 'codex',
  reasoningEffort: 'high',
  usage: null,
  usageError: '',
  creditsDisplay: '--',
  fiveHourDisplay: '--',
  fiveHourResetDisplay: '--',
  oneWeekDisplay: '--',
  oneWeekResetDisplay: '--',
  usageUpdatedDisplay: '--'
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
          lastRefresh: String(item.lastRefresh || '').trim(),
          usage:
            item.usage && typeof item.usage === 'object'
              ? {
                  fetchedAt: Number(item.usage.fetchedAt || 0) || 0,
                  planType:
                    item.usage.planType === null ||
                    item.usage.planType === undefined ||
                    item.usage.planType === ''
                      ? null
                      : String(item.usage.planType),
                  fiveHour:
                    item.usage.fiveHour && typeof item.usage.fiveHour === 'object'
                      ? {
                          usedPercent: Number(item.usage.fiveHour.usedPercent || 0) || 0,
                          windowSeconds:
                            Number(item.usage.fiveHour.windowSeconds || 0) || 0,
                          resetAt:
                            item.usage.fiveHour.resetAt === null ||
                            item.usage.fiveHour.resetAt === undefined
                              ? null
                              : Number(item.usage.fiveHour.resetAt || 0) || null
                        }
                      : null,
                  oneWeek:
                    item.usage.oneWeek && typeof item.usage.oneWeek === 'object'
                      ? {
                          usedPercent: Number(item.usage.oneWeek.usedPercent || 0) || 0,
                          windowSeconds:
                            Number(item.usage.oneWeek.windowSeconds || 0) || 0,
                          resetAt:
                            item.usage.oneWeek.resetAt === null ||
                            item.usage.oneWeek.resetAt === undefined
                              ? null
                              : Number(item.usage.oneWeek.resetAt || 0) || null
                        }
                      : null,
                  credits:
                    item.usage.credits && typeof item.usage.credits === 'object'
                      ? {
                          hasCredits: Boolean(item.usage.credits.hasCredits),
                          unlimited: Boolean(item.usage.credits.unlimited),
                          balance:
                            item.usage.credits.balance === null ||
                            item.usage.credits.balance === undefined ||
                            item.usage.credits.balance === ''
                              ? null
                              : String(item.usage.credits.balance)
                        }
                      : null
                }
              : null,
          usageError: String(item.usageError || '').trim()
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
    DEFAULT_CONFIG.defaultModel,
  reasoningEffort:
    input?.reasoningEffort === 'low' ||
    input?.reasoningEffort === 'medium' ||
    input?.reasoningEffort === 'high' ||
    input?.reasoningEffort === 'xhigh'
      ? input.reasoningEffort
      : DEFAULT_CONFIG.reasoningEffort,
  usage:
    input?.usage && typeof input.usage === 'object'
      ? {
          fetchedAt: Number(input.usage.fetchedAt || 0) || 0,
          planType:
            input.usage.planType === null ||
            input.usage.planType === undefined ||
            input.usage.planType === ''
              ? null
              : String(input.usage.planType),
          fiveHour:
            input.usage.fiveHour && typeof input.usage.fiveHour === 'object'
              ? {
                  usedPercent: Number(input.usage.fiveHour.usedPercent || 0) || 0,
                  windowSeconds:
                    Number(input.usage.fiveHour.windowSeconds || 0) || 0,
                  resetAt:
                    input.usage.fiveHour.resetAt === null ||
                    input.usage.fiveHour.resetAt === undefined
                      ? null
                      : Number(input.usage.fiveHour.resetAt || 0) || null
                }
              : null,
          oneWeek:
            input.usage.oneWeek && typeof input.usage.oneWeek === 'object'
              ? {
                  usedPercent: Number(input.usage.oneWeek.usedPercent || 0) || 0,
                  windowSeconds:
                    Number(input.usage.oneWeek.windowSeconds || 0) || 0,
                  resetAt:
                    input.usage.oneWeek.resetAt === null ||
                    input.usage.oneWeek.resetAt === undefined
                      ? null
                      : Number(input.usage.oneWeek.resetAt || 0) || null
                }
              : null,
          credits:
            input.usage.credits && typeof input.usage.credits === 'object'
              ? {
                  hasCredits: Boolean(input.usage.credits.hasCredits),
                  unlimited: Boolean(input.usage.credits.unlimited),
                  balance:
                    input.usage.credits.balance === null ||
                    input.usage.credits.balance === undefined ||
                    input.usage.credits.balance === ''
                      ? null
                      : String(input.usage.credits.balance)
                }
              : null
        }
      : null,
  usageError: String(input?.usageError || '').trim(),
  creditsDisplay: String(input?.creditsDisplay || '--').trim() || '--',
  fiveHourDisplay: String(input?.fiveHourDisplay || '--').trim() || '--',
  fiveHourResetDisplay: String(input?.fiveHourResetDisplay || '--').trim() || '--',
  oneWeekDisplay: String(input?.oneWeekDisplay || '--').trim() || '--',
  oneWeekResetDisplay: String(input?.oneWeekResetDisplay || '--').trim() || '--',
  usageUpdatedDisplay: String(input?.usageUpdatedDisplay || '--').trim() || '--'
})
