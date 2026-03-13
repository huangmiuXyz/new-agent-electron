import type { PluginContext } from '@agent-qi/types'
import {
  DEFAULT_CONFIG,
  normalizeConfig,
  type CodexProxyAccountProfile,
  type CodexProxyPluginConfig
} from './constants'

type TokenMap = Record<string, unknown>
type AuthJson = Record<string, unknown>

const decodeBase64UrlJson = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded =
    normalized.length % 4 === 0
      ? normalized
      : normalized + '='.repeat(4 - (normalized.length % 4))
  return JSON.parse(atob(padded)) as Record<string, unknown>
}

const decodeJwtPayload = (token: string) => {
  const payload = String(token || '').split('.')[1]
  if (!payload) {
    throw new Error('id_token payload 无效')
  }
  return decodeBase64UrlJson(payload)
}

const getTokenObject = (authJson: AuthJson): TokenMap | null => {
  const tokens = authJson.tokens
  if (tokens && typeof tokens === 'object' && !Array.isArray(tokens)) {
    return tokens as TokenMap
  }

  if (typeof authJson.access_token === 'string' && typeof authJson.id_token === 'string') {
    return authJson
  }

  return null
}

export const resolveDefaultAuthPath = (context: PluginContext) =>
  context.api.path.join(context.api.os.homedir(), '.codex', 'auth.json')

const upsertAccount = (
  list: CodexProxyAccountProfile[],
  account: CodexProxyAccountProfile
) => {
  const index = list.findIndex((item) => item.id === account.id)
  if (index < 0) {
    return [...list, account]
  }

  const next = [...list]
  next[index] = account
  return next
}

export const readCodexAuthAccount = (
  context: PluginContext,
  authPath: string
): CodexProxyAccountProfile => {
  if (!context.api.fs.existsSync(authPath)) {
    throw new Error(`未找到认证文件: ${authPath}`)
  }

  const raw = context.api.fs.readFileSync(authPath, 'utf-8')
  const authJson = JSON.parse(raw) as AuthJson
  const tokens = getTokenObject(authJson)
  if (!tokens) {
    throw new Error(`在 ${authPath} 中未找到 ChatGPT tokens`)
  }

  const accessToken = String(tokens.access_token || '').trim()
  const idToken = String(tokens.id_token || '').trim()
  if (!accessToken || !idToken) {
    throw new Error(`${authPath} 缺少 access_token 或 id_token`)
  }

  const payload = decodeJwtPayload(idToken)
  const authClaim =
    payload['https://api.openai.com/auth'] &&
    typeof payload['https://api.openai.com/auth'] === 'object'
      ? (payload['https://api.openai.com/auth'] as Record<string, unknown>)
      : null

  const accountId = String(
    tokens.account_id ||
      authClaim?.chatgpt_account_id ||
      authClaim?.account_id ||
      ''
  ).trim()

  if (!accountId) {
    throw new Error(`无法从 ${authPath} 解析 chatgpt_account_id`)
  }

  const email = String(payload.email || '').trim()
  const planType = String(authClaim?.chatgpt_plan_type || '').trim()
  const authMode = String(authJson.auth_mode || '').trim()
  const lastRefresh = String(authJson.last_refresh || '').trim()

  return {
    id: accountId,
    authPath,
    accessToken,
    idToken,
    accountId,
    email,
    planType,
    authMode,
    lastRefresh,
    usage: null,
    usageError: ''
  }
}

export const writeCodexAuthAccount = (
  context: PluginContext,
  authPath: string,
  account: CodexProxyAccountProfile
) => {
  if (!account.accessToken || !account.idToken) {
    throw new Error('当前账号缺少 access_token 或 id_token，无法写回认证文件')
  }

  let authJson: AuthJson = {}
  if (context.api.fs.existsSync(authPath)) {
    const raw = context.api.fs.readFileSync(authPath, 'utf-8')
    authJson = JSON.parse(raw) as AuthJson
  }

  const targetTokens =
    authJson.tokens &&
    typeof authJson.tokens === 'object' &&
    !Array.isArray(authJson.tokens)
      ? (authJson.tokens as TokenMap)
      : authJson

  targetTokens.access_token = account.accessToken
  targetTokens.id_token = account.idToken
  targetTokens.account_id = account.accountId

  if (targetTokens === authJson) {
    delete authJson.tokens
  } else {
    authJson.tokens = targetTokens
  }

  authJson.auth_mode = account.authMode || authJson.auth_mode || ''
  authJson.last_refresh = new Date().toISOString()
  context.api.fs.writeFileSync(authPath, `${JSON.stringify(authJson, null, 2)}\n`, 'utf-8')
}

export const readCodexAuthConfig = (
  context: PluginContext,
  input?: Partial<CodexProxyPluginConfig> | null
): CodexProxyPluginConfig => {
  const config = normalizeConfig(input)
  const authPath = config.authPath || resolveDefaultAuthPath(context)
  const nextConfig: CodexProxyPluginConfig = {
    ...DEFAULT_CONFIG,
    ...config,
    authPath
  }

  if (!context.api.fs.existsSync(authPath)) {
    const activeAccount =
      nextConfig.accounts.find((item) => item.id === nextConfig.activeAccountId) ||
      nextConfig.accounts[0]
    return {
      ...nextConfig,
      activeAccountId: activeAccount?.id || '',
      status: activeAccount
        ? activeAccount.email || activeAccount.accountId
        : '未登录',
      accessToken: activeAccount?.accessToken || '',
      accountId: activeAccount?.accountId || '',
      email: activeAccount?.email || '',
      planType: activeAccount?.planType || '',
      authMode: activeAccount?.authMode || '',
      lastRefresh: activeAccount?.lastRefresh || ''
    }
  }

  const current = readCodexAuthAccount(context, authPath)
  const accounts = upsertAccount(nextConfig.accounts, current)
  const activeAccountId = nextConfig.activeAccountId || current.id
  const activeAccount =
    accounts.find((item) => item.id === activeAccountId) || current

  return {
    ...nextConfig,
    accounts,
    activeAccountId: activeAccount.id,
    accessToken: activeAccount.accessToken,
    accountId: activeAccount.accountId,
    email: activeAccount.email,
    planType: activeAccount.planType,
    authMode: activeAccount.authMode,
    lastRefresh: activeAccount.lastRefresh,
    status: activeAccount.email || activeAccount.accountId
  }
}
