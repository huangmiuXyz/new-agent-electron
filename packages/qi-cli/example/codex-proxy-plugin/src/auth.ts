import type { PluginContext } from '@agent-qi/types'
import {
  DEFAULT_CONFIG,
  normalizeConfig,
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
    throw new Error('Invalid id_token payload')
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
    return {
      ...nextConfig,
      status: 'Not logged in',
      accessToken: '',
      accountId: '',
      email: '',
      planType: '',
      authMode: '',
      lastRefresh: ''
    }
  }

  const raw = context.api.fs.readFileSync(authPath, 'utf-8')
  const authJson = JSON.parse(raw) as AuthJson
  const tokens = getTokenObject(authJson)
  if (!tokens) {
    throw new Error(`No ChatGPT tokens found in ${authPath}`)
  }

  const accessToken = String(tokens.access_token || '').trim()
  const idToken = String(tokens.id_token || '').trim()
  if (!accessToken || !idToken) {
    throw new Error(`Missing access_token or id_token in ${authPath}`)
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
    throw new Error(`Failed to resolve chatgpt_account_id from ${authPath}`)
  }

  const email = String(payload.email || '').trim()
  const planType = String(authClaim?.chatgpt_plan_type || '').trim()
  const authMode = String(authJson.auth_mode || '').trim()
  const lastRefresh = String(authJson.last_refresh || '').trim()

  return {
    ...nextConfig,
    accessToken,
    accountId,
    email,
    planType,
    authMode,
    lastRefresh,
    status: email || accountId
  }
}
