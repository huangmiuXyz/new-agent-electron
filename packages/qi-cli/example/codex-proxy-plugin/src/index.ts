import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { Model, Plugin, PluginContext } from '@agent-qi/types'
import { z } from 'zod'
import {
  BRIDGE_API_KEY,
  buildDefaultModels,
  CODEX_PROVIDER_LOGO_URL,
  DEFAULT_CONFIG,
  normalizeConfig,
  PLUGIN_NAME,
  PROVIDER_ID,
  REGISTRY_ID,
  SERVICE_STATUS_ID,
  STORAGE_KEY,
  type CodexProxyAccountProfile,
  type CodexProxyPluginConfig,
  type CodexProxyUsageSnapshot
} from './constants'
import {
  readCodexAuthAccount,
  readCodexAuthConfig,
  resolveDefaultAuthPath,
  writeCodexAuthAccount
} from './auth'
import { createAccountStatusRender } from './status-indicator'

type OpenAICompatibleWithListModels = ReturnType<typeof createOpenAICompatible> & {
  listModels?: () => Promise<Model[]>
  chatCallOptionsSchema?: z.ZodObject<any>
}

type FormActionsLike = {
  setFieldsValue: (data: CodexProxyPluginConfig) => void
  updateFieldProps: (field: string, props: Record<string, unknown>) => void
  getData: () => CodexProxyPluginConfig
}

let runtimeConfig: CodexProxyPluginConfig = { ...DEFAULT_CONFIG }
let isProgrammaticFormUpdate = false
let isStatusPanelOpen = false
let bridgeBusyMessage = ''
let lastBridgeReadyAt = 0
let lastBridgeReadyConfigHash = ''
let bridgeStartPromise: Promise<boolean> | null = null
let lastUsageRefreshAt = 0
let modelsProbePromise: Promise<Model[]> | null = null
let lastModelsProbeAt = 0
let modelsProbeCache: Model[] | null = null
let healthCheckPromise: Promise<any> | null = null
let lastHealthCheckAt = 0
let lastHealthConfigHash = ''
let lastHealthResult: any = null
let lastBeforeUseEnsureAt = 0

const BRIDGE_READY_CACHE_MS = 60_000
const BRIDGE_WAIT_RETRIES = 100
const BRIDGE_WAIT_INTERVAL_MS = 300
const HEALTH_RESULT_CACHE_MS = 10_000
const USAGE_REFRESH_CACHE_MS = 30_000
const MODELS_PROBE_CACHE_MS = 5 * 60_000
const BEFORE_USE_ENSURE_CACHE_MS = 60_000
const DISABLE_MODELS_PROBE = true
const HEALTH_REQUEST_TIMEOUT_MS = 1200
const MODELS_REQUEST_TIMEOUT_MS = 2500
const USAGE_REQUEST_TIMEOUT_MS = 15_000
const withTimeout = (ms: number) => AbortSignal.timeout(ms)

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const getAccountLabel = (account: CodexProxyAccountProfile) =>
  account.email || account.accountId

const clampPercent = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) return null
  return Math.max(0, Math.min(100, value))
}

const formatPercent = (value: number | null | undefined) => {
  const normalized = clampPercent(value)
  return normalized === null ? '--' : `${normalized.toFixed(0)}%`
}

const formatRemaining = (value: number | null | undefined) => {
  const normalized = clampPercent(value)
  return normalized === null ? '--' : `${(100 - normalized).toFixed(0)}%`
}

const formatCountdown = (epochSeconds: number | null | undefined) => {
  if (!epochSeconds) return '--'
  const diff = epochSeconds - Math.floor(Date.now() / 1000)
  if (diff <= 0) return '已重置'

  const days = Math.floor(diff / 86400)
  const hours = Math.floor((diff % 86400) / 3600)
  const minutes = Math.floor((diff % 3600) / 60)
  const seconds = diff % 60

  if (days > 0) return `${days}天${hours}小时后`
  if (hours > 0) return `${hours}小时${minutes}分后`
  if (minutes > 0) return `${minutes}分${seconds}秒后`
  return `${seconds}秒后`
}

const formatElapsed = (epochSeconds: number | null | undefined) => {
  if (!epochSeconds) return '--'
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - epochSeconds)
  if (diff < 10) return '刚刚'
  if (diff < 60) return `${diff}秒前`
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`
  return `${Math.floor(diff / 86400)}天前`
}

const formatTimestampText = (value: string | null | undefined) => {
  const text = String(value || '').trim()
  if (!text) return '--'
  const time = Date.parse(text)
  if (Number.isNaN(time)) return text

  const epochSeconds = Math.floor(time / 1000)
  const relative = formatElapsed(epochSeconds)
  const absolute = new Date(time).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
  return `${relative} (${absolute})`
}

const formatBalance = (config: Pick<CodexProxyPluginConfig, 'usage' | 'usageError'>) => {
  if (config.usage?.credits?.unlimited) return '无限'
  if (config.usage?.credits?.balance) return config.usage.credits.balance
  if (config.usageError) return '读取失败'
  return '--'
}

const deriveUsageDisplay = (config: Pick<CodexProxyPluginConfig, 'usage' | 'usageError'>) => ({
  creditsDisplay: formatBalance(config),
  fiveHourDisplay: config.usage?.fiveHour
    ? `${formatPercent(config.usage.fiveHour.usedPercent)} / ${formatRemaining(config.usage.fiveHour.usedPercent)}`
    : '--',
  fiveHourResetDisplay: formatCountdown(config.usage?.fiveHour?.resetAt),
  oneWeekDisplay: config.usage?.oneWeek
    ? `${formatPercent(config.usage.oneWeek.usedPercent)} / ${formatRemaining(config.usage.oneWeek.usedPercent)}`
    : '--',
  oneWeekResetDisplay: formatCountdown(config.usage?.oneWeek?.resetAt),
  usageUpdatedDisplay: formatElapsed(config.usage?.fetchedAt)
})

const buildRuntimeConfig = (
  context: PluginContext,
  input?: Partial<CodexProxyPluginConfig> | null
): CodexProxyPluginConfig => {
  const normalized = normalizeConfig(input)
  const authPath = normalized.authPath || resolveDefaultAuthPath(context)
  const accounts = [...normalized.accounts]
  if (
    accounts.length === 0 &&
    normalized.accountId &&
    normalized.accessToken
  ) {
    accounts.push({
      id: normalized.accountId,
      authPath,
      accessToken: normalized.accessToken,
      idToken: '',
      accountId: normalized.accountId,
      email: normalized.email,
      planType: normalized.planType,
      authMode: normalized.authMode,
      lastRefresh: normalized.lastRefresh,
      usage: normalized.usage,
      usageError: normalized.usageError
    })
  }

  const activeAccountId =
    normalized.activeAccountId && accounts.some((item) => item.id === normalized.activeAccountId)
      ? normalized.activeAccountId
      : (accounts[0]?.id ?? '')
  const activeAccount = accounts.find((item) => item.id === activeAccountId)
  const status = activeAccount
    ? getAccountLabel(activeAccount)
    : normalized.status || DEFAULT_CONFIG.status
  const usage = normalized.usage || activeAccount?.usage || null
  const usageError = normalized.usageError || activeAccount?.usageError || ''
  const usageDisplay = deriveUsageDisplay({ usage, usageError })

  return {
    ...DEFAULT_CONFIG,
    ...normalized,
    accounts,
    activeAccountId,
    authPath,
    status,
    accessToken: activeAccount?.accessToken || '',
    accountId: activeAccount?.accountId || '',
    email: activeAccount?.email || '',
    planType: activeAccount?.planType || '',
    authMode: activeAccount?.authMode || '',
    lastRefresh: activeAccount?.lastRefresh || '',
    usage,
    usageError,
    ...usageDisplay
  }
}

const getCurrentConfigSnapshot = (
  context: PluginContext,
  formActions?: FormActionsLike
): CodexProxyPluginConfig =>
  buildRuntimeConfig(context, {
    ...runtimeConfig,
    ...formActions?.getData()
  })

const getAccountOptions = (config: CodexProxyPluginConfig) =>
  config.accounts.map((account) => ({
    label: getAccountLabel(account),
    value: account.id
  }))

const updateAccountUsageCache = (
  config: CodexProxyPluginConfig,
  accountId: string,
  usage: CodexProxyUsageSnapshot | null,
  usageError: string
) => ({
  ...config,
  accounts: config.accounts.map((account) =>
    account.id === accountId
      ? {
          ...account,
          usage,
          usageError
        }
      : account
  )
})

const updateAccountSelectorProps = (
  actions: { updateFieldProps: (field: string, props: Record<string, unknown>) => void },
  config: CodexProxyPluginConfig
) => {
  actions.updateFieldProps('activeAccountId', {
    options: getAccountOptions(config),
    disabled: isBridgeBusy() || config.accounts.length === 0
  })
}

const getBridgeBaseURL = (config = runtimeConfig) =>
  `http://${config.bridgeHost}:${config.bridgePort}`

const getHealthURL = (config = runtimeConfig) =>
  `${getBridgeBaseURL(config)}/health`

const getProviderBaseURL = (config = runtimeConfig) =>
  `${getBridgeBaseURL(config)}/v1`

const getUsageURL = (config = runtimeConfig) =>
  `${getBridgeBaseURL(config)}/codex/usage`

const isBridgeBusy = () => Boolean(bridgeBusyMessage)

const getConfigHash = (config = runtimeConfig) =>
  JSON.stringify({
    accessToken: config.accessToken,
    accountId: config.accountId,
    sessionCookie: '',
    defaultModel: config.defaultModel
  })

const tryJson = async (url: string, options?: RequestInit) => {
  try {
    const response = await fetch(url, options)
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

const getHealth = async (config: CodexProxyPluginConfig) => {
  const now = Date.now()
  const configHash = getConfigHash(config)

  if (
    lastHealthResult &&
    configHash === lastHealthConfigHash &&
    now - lastHealthCheckAt < HEALTH_RESULT_CACHE_MS
  ) {
    return lastHealthResult
  }

  if (healthCheckPromise) {
    return await healthCheckPromise
  }

  healthCheckPromise = tryJson(getHealthURL(config), {
    signal: withTimeout(HEALTH_REQUEST_TIMEOUT_MS)
  }).finally(() => {
    healthCheckPromise = null
  })

  const result = await healthCheckPromise
  lastHealthResult = result
  lastHealthConfigHash = configHash
  lastHealthCheckAt = Date.now()
  return result
}

const waitForBridge = async (
  config: CodexProxyPluginConfig,
  maxRetries = BRIDGE_WAIT_RETRIES
) => {
  for (let index = 0; index < maxRetries; index += 1) {
    const health = await getHealth(config)
    if (health?.ok && health.configHash === getConfigHash(config)) {
      lastBridgeReadyAt = Date.now()
      lastBridgeReadyConfigHash = getConfigHash(config)
      return true
    }
    await sleep(BRIDGE_WAIT_INTERVAL_MS)
  }
  return false
}

const stopBridge = async (config: CodexProxyPluginConfig) => {
  lastBridgeReadyAt = 0
  lastBridgeReadyConfigHash = ''
  await tryJson(`${getBridgeBaseURL(config)}/shutdown`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: BRIDGE_API_KEY })
  })
}

const startBridge = async (
  context: PluginContext,
  config: CodexProxyPluginConfig
) => {
  const configHash = getConfigHash(config)
  if (
    configHash === lastBridgeReadyConfigHash &&
    Date.now() - lastBridgeReadyAt < BRIDGE_READY_CACHE_MS
  ) {
    return true
  }

  const health = await getHealth(config)
  if (health?.ok && health.configHash === configHash) {
    lastBridgeReadyAt = Date.now()
    lastBridgeReadyConfigHash = configHash
    return true
  }

  if (health?.ok) {
    await stopBridge(config)
    await sleep(300)
  }

  const serverPath = context.api.path.join(context.basePath, 'server.cjs')
  if (!context.api.fs.existsSync(serverPath)) {
    throw new Error(`未找到 bridge 服务文件: ${serverPath}`)
  }

  const execPath = context.api.process?.execPath || 'node'
  const isElectron = Boolean(context.api.process?.execPath)
  const child = context.api.spawn(execPath, [serverPath], {
    detached: true,
    windowsHide: true,
    stdio: 'ignore',
    env: {
      ...context.api.process?.env,
      CODEX_PROXY_PLUGIN_PORT: String(config.bridgePort),
      CODEX_PROXY_PLUGIN_HOST: config.bridgeHost,
      CODEX_PROXY_PLUGIN_ACCESS_TOKEN: config.accessToken,
      CODEX_PROXY_PLUGIN_ACCOUNT_ID: config.accountId,
      CODEX_PROXY_PLUGIN_DEFAULT_MODEL: config.defaultModel,
      CODEX_PROXY_PLUGIN_REASONING_EFFORT: config.reasoningEffort,
      CODEX_PROXY_PLUGIN_API_KEY: BRIDGE_API_KEY,
      ...(isElectron ? { ELECTRON_RUN_AS_NODE: '1' } : {})
    }
  })

  if (child && typeof child.unref === 'function') {
    child.unref()
  }

  return await waitForBridge(config)
}

const ensureBridgeStartedOnce = async (
  context: PluginContext,
  config: CodexProxyPluginConfig
) => {
  if (bridgeStartPromise) return await bridgeStartPromise

  bridgeStartPromise = (async () => {
    try {
      return await startBridge(context, config)
    } finally {
      bridgeStartPromise = null
    }
  })()

  return await bridgeStartPromise
}

const saveConfig = async (
  context: PluginContext,
  config: Partial<CodexProxyPluginConfig>
) => {
  const persisted = buildRuntimeConfig(context, config)
  await context.localforage.setItem(STORAGE_KEY, persisted)
}

const loadSavedConfig = async (
  context: PluginContext,
  formActions?: FormActionsLike
) => {
  const stored =
    await context.localforage.getItem<CodexProxyPluginConfig>(STORAGE_KEY)
  runtimeConfig = buildRuntimeConfig(context, stored)
  if (formActions) {
    formActions.setFieldsValue(runtimeConfig)
    updateAccountSelectorProps(formActions, runtimeConfig)
  }
  return runtimeConfig
}

const refreshAuthConfig = async (
  context: PluginContext,
  formActions?: FormActionsLike
) => {
  const stored =
    await context.localforage.getItem<CodexProxyPluginConfig>(STORAGE_KEY)
  runtimeConfig = readCodexAuthConfig(context, stored)
  await saveConfig(context, runtimeConfig)
  if (formActions) {
    formActions.setFieldsValue(runtimeConfig)
    updateAccountSelectorProps(formActions, runtimeConfig)
  }
  return runtimeConfig
}

const ensureBridgeRunning = async (
  context: PluginContext,
  formActions?: FormActionsLike
) => {
  runtimeConfig = await loadSavedConfig(context, formActions)
  if (!runtimeConfig.accessToken) {
    runtimeConfig = await refreshAuthConfig(context, formActions)
  }
  if (!runtimeConfig.accessToken) {
    throw new Error(
      `未找到可用的 Codex 登录，请检查认证文件: ${runtimeConfig.authPath}`
    )
  }

  const ready = await ensureBridgeStartedOnce(context, runtimeConfig)
  if (!ready) {
    lastBridgeReadyConfigHash = ''
    throw new Error(
      `启动 Codex bridge 失败: ${getBridgeBaseURL(runtimeConfig)}`
    )
  }
}

const listModels = async (context: PluginContext) => {
  if (DISABLE_MODELS_PROBE) {
    return buildDefaultModels(runtimeConfig.defaultModel)
  }

  const now = Date.now()
  if (modelsProbeCache && now - lastModelsProbeAt < MODELS_PROBE_CACHE_MS) {
    return modelsProbeCache
  }

  if (!modelsProbePromise) {
    modelsProbePromise = (async () => {
      try {
        await ensureBridgeRunning(context)
        const response = await fetch(`${getProviderBaseURL(runtimeConfig)}/models`, {
          headers: {
            Authorization: `Bearer ${BRIDGE_API_KEY}`
          },
          signal: withTimeout(MODELS_REQUEST_TIMEOUT_MS)
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const json = (await response.json()) as { data?: Model[] }
        const models = json.data?.length
          ? json.data
          : buildDefaultModels(runtimeConfig.defaultModel)
        modelsProbeCache = models
        lastModelsProbeAt = Date.now()
        return models
      } catch {
        return buildDefaultModels(runtimeConfig.defaultModel)
      } finally {
        modelsProbePromise = null
      }
    })()
  }

  return await modelsProbePromise
}

const fetchUsageSnapshot = async (
  context: PluginContext,
  formActions?: FormActionsLike,
  bridgeReady = false
) => {
  if (!bridgeReady) {
    await ensureBridgeRunning(context, formActions)
  }
  const requestUsage = async () => {
    const response = await fetch(getUsageURL(runtimeConfig), {
      headers: {
        Authorization: `Bearer ${BRIDGE_API_KEY}`
      },
      signal: withTimeout(USAGE_REQUEST_TIMEOUT_MS)
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(text || `HTTP ${response.status}`)
    }

    return (await response.json()) as CodexProxyUsageSnapshot
  }

  try {
    return await requestUsage()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!/timed out|aborted|abort/i.test(message)) {
      throw error
    }
    await sleep(400)
    return await requestUsage()
  }
}

const resolveProviderLogoUrl = (context: PluginContext) => {
  const candidates = [
    context.api.path.join(context.basePath, 'codex-color.png'),
    context.api.path.join(context.basePath, 'src', 'codex-color.png'),
    context.api.path.join(context.basePath, 'dist', 'codex-color.png'),
    context.api.path.resolve(context.basePath, '..', 'codex-color.png')
  ]

  for (const logoPath of candidates) {
    if (!context.api.fs.existsSync(logoPath)) continue
    try {
      const file = context.api.fs.readFileSync(logoPath)
      return URL.createObjectURL(new Blob([file], { type: 'image/png' }))
    } catch {
      continue
    }
  }

  return CODEX_PROVIDER_LOGO_URL
}
const syncProvider = async (context: PluginContext, form: unknown) => {
  const models = await listModels(context)
  try {
    context.unregisterProvider(PROVIDER_ID)
  } catch {
    // ignore
  }

  context.registerProvider(PROVIDER_ID, {
    name: 'Codex 代理',
    logo: resolveProviderLogoUrl(context),
    providerType: REGISTRY_ID,
    form: form as Record<string, unknown>,
    models
  })
}

const codexChatCallOptionsSchema = z.object({
  reasoningEffort: z
    .enum(['low', 'medium', 'high', 'xhigh'])
    .optional()
    .describe('Reasoning effort for this request')
})

const plugin: Plugin = {
  name: PLUGIN_NAME,
  version: '1.0.0',
  description: '在插件内实现的 Codex 反向代理',
  install: async (context: PluginContext) => {
    const stored =
      await context.localforage.getItem<CodexProxyPluginConfig>(STORAGE_KEY)
    let initialConfig = buildRuntimeConfig(context, stored)
    if (!initialConfig.accessToken) {
      try {
        initialConfig = readCodexAuthConfig(context, stored)
        await saveConfig(context, initialConfig)
      } catch {
        // Keep local snapshot as-is when auth file is unavailable.
      }
    }
    runtimeConfig = initialConfig

    let formActions: FormActionsLike | undefined
    let FormComp: unknown
    let updateStatusIndicator = () => undefined
    const bridgeBusyState = context.vue.ref('')
    const modal = context.useModal()
    const runtimeConfigState = context.vue.ref(runtimeConfig)
    const isStatusPanelOpenState = context.vue.ref(false)
    const statusTooltipState = context.vue.ref('')
    let isStatusRegistered = false

    context.vue.watch(isStatusPanelOpenState, (open) => {
      isStatusPanelOpen = open
    })

    const syncFormActions = (config: CodexProxyPluginConfig) => {
      if (!formActions) return
      isProgrammaticFormUpdate = true
      formActions.setFieldsValue(config)
      updateAccountSelectorProps(formActions, config)
      isProgrammaticFormUpdate = false
    }

    const refreshPluginUI = () => {
      runtimeConfigState.value = runtimeConfig
      syncFormActions(runtimeConfig)
      updateStatusIndicator()
    }

    const setBridgeBusy = (message: string) => {
      bridgeBusyMessage = message
      bridgeBusyState.value = message
      refreshPluginUI()
    }

    const assertBridgeIdle = () => {
      if (!bridgeBusyMessage) return
      throw new Error(bridgeBusyMessage)
    }

    const doSwitchAccount = async (accountId: string) => {
      assertBridgeIdle()
      const current = getCurrentConfigSnapshot(context, formActions)
      if (!accountId || accountId === current.activeAccountId) return
      const previous = runtimeConfig
      const next = buildRuntimeConfig(context, {
        ...current,
        activeAccountId: accountId,
        usage: null,
        usageError: ''
      })
      await saveConfig(context, next)
      runtimeConfig = next
      syncFormActions(next)
      setBridgeBusy('Codex bridge 重启中，暂时无法切换账号或刷新额度。')
      try {
        if (next.accessToken) {
          await startBridge(context, next).catch(() => undefined)
        } else if (previous.accessToken) {
          await stopBridge(previous)
        }
        await syncProvider(context, FormComp)
        await refreshUsage(false, true, true, true)
      } finally {
        setBridgeBusy('')
      }
      context.notification.success('已切换账号。', 'Codex 代理')
    }

    const doSaveCurrentLogin = async () => {
      assertBridgeIdle()
      const current = getCurrentConfigSnapshot(context, formActions)
      const currentAuthPath = current.authPath || runtimeConfig.authPath
      const detected = readCodexAuthAccount(context, currentAuthPath)
      const merged = buildRuntimeConfig(context, {
        ...current,
        accounts: [
          ...runtimeConfig.accounts.filter((item) => item.id !== detected.id),
          detected
        ],
        activeAccountId: detected.id,
        usage: null,
        usageError: ''
      })
      await saveConfig(context, merged)
      runtimeConfig = merged
      syncFormActions(merged)
      setBridgeBusy('Codex bridge 重启中，暂时无法切换账号或刷新额度。')
      try {
        await startBridge(context, merged).catch(() => undefined)
        await syncProvider(context, FormComp)
        await refreshUsage(false, true, true, true)
      } finally {
        setBridgeBusy('')
      }
      context.notification.success('已将当前登录保存到账号列表。', 'Codex 代理')
    }

    const doWriteBackAuth = async (targetAccountId?: string) => {
      assertBridgeIdle()
      const current = getCurrentConfigSnapshot(context, formActions)
      const activeAccount = current.accounts.find(
        (account) => account.id === (targetAccountId || current.activeAccountId)
      )
      if (!activeAccount) {
        throw new Error('未找到当前激活账号')
      }
      const confirmed = await modal.confirm({
        title: '写回 auth.json',
        content: `确定要将账号 "${getAccountLabel(activeAccount)}" 写回 ${current.authPath || resolveDefaultAuthPath(context)} 吗？`,
        confirmText: '写回',
        confirmProps: {
          variant: 'primary',
          danger: true
        }
      })
      if (!confirmed) return

      const authPath = current.authPath || resolveDefaultAuthPath(context)
      writeCodexAuthAccount(context, authPath, activeAccount)
      const refreshed = buildRuntimeConfig(context, {
        ...current,
        authPath,
        accounts: current.accounts.map((account) =>
          account.id === activeAccount.id
            ? {
                ...account,
                authPath,
                lastRefresh: new Date().toISOString()
              }
            : account
        )
      })
      await saveConfig(context, refreshed)
      runtimeConfig = refreshed
      syncFormActions(refreshed)
      updateStatusIndicator()
      context.notification.success('已将当前账号写回 auth.json。', 'Codex 代理')
    }

    const doRemoveCurrentAccount = async (targetAccountId?: string) => {
      assertBridgeIdle()
      const current = getCurrentConfigSnapshot(context, formActions)
      const removingAccountId = targetAccountId || current.activeAccountId
      if (!removingAccountId) {
        throw new Error('未选择当前账号。')
      }
      const removingAccount = current.accounts.find((account) => account.id === removingAccountId)
      if (!removingAccount) {
        throw new Error('未找到要移除的账号。')
      }
      const confirmed = await modal.confirm({
        title: '移除账号',
        content: `确定要移除账号 "${getAccountLabel(removingAccount)}" 吗？此操作不会删除 auth.json 文件中的原始登录，但会从插件账号列表中移除。`,
        confirmText: '移除',
        confirmProps: {
          variant: 'primary',
          danger: true
        }
      })
      if (!confirmed) return
      const removingActive = removingAccountId === current.activeAccountId
      const previous = runtimeConfig
      const accounts = current.accounts.filter(
        (account) => account.id !== removingAccountId
      )
      const next = buildRuntimeConfig(context, {
        ...current,
        accounts,
        activeAccountId: removingActive ? accounts[0]?.id || '' : current.activeAccountId,
        usage: null,
        usageError: ''
      })
      await saveConfig(context, next)
      runtimeConfig = next
      syncFormActions(next)
      if (removingActive) {
        setBridgeBusy('Codex bridge 重启中，暂时无法切换账号或刷新额度。')
        try {
          if (next.accessToken) {
            await startBridge(context, next).catch(() => undefined)
          } else {
            await stopBridge(previous)
          }
          await syncProvider(context, FormComp)
          await refreshUsage(false, true, true, true)
        } finally {
          setBridgeBusy('')
        }
      } else {
        await syncProvider(context, FormComp)
      }
      context.notification.success('已移除当前账号。', 'Codex 代理')
    }

    const refreshUsage = async (
      notify = true,
      force = false,
      allowWhileBridgeBusy = false,
      bridgeReady = false
    ) => {
      if (!allowWhileBridgeBusy) {
        assertBridgeIdle()
      }
      if (
        !force &&
        runtimeConfig.usage &&
        !runtimeConfig.usageError &&
        Date.now() - lastUsageRefreshAt < USAGE_REFRESH_CACHE_MS
      ) {
        return
      }

      const current = getCurrentConfigSnapshot(context, formActions)
      if (!current.accessToken || !current.accountId) {
        const next = buildRuntimeConfig(context, {
          ...current,
          usage: null,
          usageError: '当前账号缺少 access_token 或 accountId'
        })
        await saveConfig(context, next)
        runtimeConfig = next
        syncFormActions(next)
        updateStatusIndicator()
        return
      }

      try {
        const usage = await fetchUsageSnapshot(context, formActions, bridgeReady)
        const currentSnapshot = getCurrentConfigSnapshot(context, formActions)
        const next = buildRuntimeConfig(context, {
          ...updateAccountUsageCache(
            currentSnapshot,
            currentSnapshot.activeAccountId,
            usage,
            ''
          ),
          usage,
          usageError: ''
        })
        await saveConfig(context, next)
        runtimeConfig = next
        lastUsageRefreshAt = Date.now()
        syncFormActions(next)
        updateStatusIndicator()
        if (notify) {
          context.notification.success('已刷新额度与用量。', 'Codex 代理')
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const currentSnapshot = getCurrentConfigSnapshot(context, formActions)
        const next = buildRuntimeConfig(context, {
          ...updateAccountUsageCache(
            currentSnapshot,
            currentSnapshot.activeAccountId,
            null,
            message
          ),
          usage: null,
          usageError: message
        })
        await saveConfig(context, next)
        runtimeConfig = next
        syncFormActions(next)
        updateStatusIndicator()
        if (notify) {
          throw error
        }
      }
    }

    const renderAccountActions = () => {
      const Button = context.components?.Button as
        | Record<string, unknown>
        | undefined
      if (!Button) return null

      const safeCall = async (fn: () => Promise<void>) => {
        try {
          await fn()
        } catch (error) {
          context.notification.error(
            error instanceof Error ? error.message : String(error),
            'Codex 代理'
          )
        }
      }

      return context.vue.h(
        'div',
        { style: 'display:flex;gap:8px;flex-wrap:wrap;' },
        [
          context.vue.h(
            Button as never,
            {
              type: 'button',
              size: 'sm',
              disabled: isBridgeBusy(),
              onClick: () => safeCall(doSaveCurrentLogin)
            },
            { default: () => '保存当前登录' }
          ),
          context.vue.h(
            Button as never,
            {
              type: 'button',
              variant: 'secondary',
              size: 'sm',
              disabled: isBridgeBusy(),
              onClick: () => safeCall(doWriteBackAuth)
            },
            { default: () => '写回 auth.json' }
          ),
          context.vue.h(
            Button as never,
            {
              type: 'button',
              variant: 'secondary',
              size: 'sm',
              disabled: isBridgeBusy(),
              onClick: () => safeCall(doRemoveCurrentAccount)
            },
            { default: () => '移除当前账号' }
          )
        ]
      )
    }

    const renderUsageSummary = () => {
      const config = getCurrentConfigSnapshot(context, formActions)
      const usage = config.usage
      const usageError = config.usageError
      const usedFiveHour = clampPercent(usage?.fiveHour?.usedPercent) ?? 0
      const usedOneWeek = clampPercent(usage?.oneWeek?.usedPercent) ?? 0

      return context.vue.h(
        'div',
        { class: 'codex-settings-usage-card' },
        [
          context.vue.h('style', null, `
            .codex-settings-usage-card {
              display: grid;
              gap: 8px;
              padding: 10px;
              border-radius: 10px;
              background: var(--bg-hover);
              border: 1px solid var(--border-subtle);
            }
            .codex-settings-usage-head {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 8px;
              font-size: 12px;
              font-weight: 600;
            }
            .codex-settings-usage-meta {
              display: grid;
              gap: 4px;
              font-size: 12px;
            }
            .codex-settings-usage-row {
              display: flex;
              justify-content: space-between;
              gap: 8px;
            }
            .codex-settings-usage-label {
              color: var(--text-secondary);
            }
            .codex-settings-usage-block {
              display: grid;
              gap: 4px;
            }
            .codex-settings-usage-progress {
              position: relative;
              height: 8px;
              overflow: hidden;
              border-radius: 999px;
              background: rgba(127, 127, 127, 0.18);
            }
            .codex-settings-usage-progress-bar {
              height: 100%;
              border-radius: inherit;
              background: linear-gradient(90deg, #1f7ae0 0%, #41b3ff 100%);
            }
            .codex-settings-usage-error {
              font-size: 12px;
              color: var(--color-danger, #d94b4b);
              word-break: break-word;
            }
          `),
          context.vue.h('div', { class: 'codex-settings-usage-head' }, [
            context.vue.h('span', null, '额度 / 用量'),
            context.vue.h(
              context.components?.Button as never,
              {
                type: 'button',
                variant: 'secondary',
                size: 'sm',
                disabled: isBridgeBusy() || !config.activeAccountId,
                onClick: () =>
                  refreshUsage(true, true).catch((error) => {
                    context.notification.error(
                      error instanceof Error ? error.message : String(error),
                      'Codex 代理'
                    )
                  })
              },
              { default: () => '刷新' }
            )
          ]),
          context.vue.h('div', { class: 'codex-settings-usage-meta' }, [
            context.vue.h('div', { class: 'codex-settings-usage-row' }, [
              context.vue.h('span', { class: 'codex-settings-usage-label' }, '套餐'),
              context.vue.h('span', null, usage?.planType || config.planType || '--')
            ]),
            context.vue.h('div', { class: 'codex-settings-usage-row' }, [
              context.vue.h('span', { class: 'codex-settings-usage-label' }, 'Credits'),
              context.vue.h('span', null, config.creditsDisplay)
            ]),
            context.vue.h('div', { class: 'codex-settings-usage-block' }, [
              context.vue.h('div', { class: 'codex-settings-usage-row' }, [
                context.vue.h('span', { class: 'codex-settings-usage-label' }, '5 小时'),
                context.vue.h('span', null, config.fiveHourDisplay)
              ]),
              context.vue.h('div', { class: 'codex-settings-usage-progress', 'aria-hidden': 'true' }, [
                context.vue.h('div', {
                  class: 'codex-settings-usage-progress-bar',
                  style: {
                    width: `${Math.max(0, 100 - usedFiveHour)}%`,
                    marginLeft: `${usedFiveHour}%`
                  }
                })
              ]),
              context.vue.h('div', { class: 'codex-settings-usage-row' }, [
                context.vue.h('span', { class: 'codex-settings-usage-label' }, '5 小时重置'),
                context.vue.h('span', null, config.fiveHourResetDisplay)
              ])
            ]),
            context.vue.h('div', { class: 'codex-settings-usage-block' }, [
              context.vue.h('div', { class: 'codex-settings-usage-row' }, [
                context.vue.h('span', { class: 'codex-settings-usage-label' }, '1 周'),
                context.vue.h('span', null, config.oneWeekDisplay)
              ]),
              context.vue.h('div', { class: 'codex-settings-usage-progress', 'aria-hidden': 'true' }, [
                context.vue.h('div', {
                  class: 'codex-settings-usage-progress-bar',
                  style: {
                    width: `${Math.max(0, 100 - usedOneWeek)}%`,
                    marginLeft: `${usedOneWeek}%`
                  }
                })
              ]),
              context.vue.h('div', { class: 'codex-settings-usage-row' }, [
                context.vue.h('span', { class: 'codex-settings-usage-label' }, '1 周重置'),
                context.vue.h('span', null, config.oneWeekResetDisplay)
              ])
            ]),
            context.vue.h('div', { class: 'codex-settings-usage-row' }, [
              context.vue.h('span', { class: 'codex-settings-usage-label' }, '最近刷新'),
              context.vue.h('span', null, config.usageUpdatedDisplay)
            ])
          ]),
          usageError
            ? context.vue.h(
                'div',
                { class: 'codex-settings-usage-error', title: usageError },
                usageError
              )
            : null
        ]
      )
    }

    const renderAccountsOverview = () => {
      const config = getCurrentConfigSnapshot(context, formActions)
      const busyMessage = bridgeBusyState.value
      const CheckIcon = context.useIcon('Check')
      const FileIcon = context.useIcon('FileText')
      const TrashIcon = context.useIcon('Trash')

      return context.vue.h(
        'div',
        { class: 'codex-settings-account-list-card' },
        [
          context.vue.h('style', null, `
            .codex-settings-account-list-card {
              display: grid;
              gap: 8px;
              padding: 10px;
              border-radius: 10px;
              background: var(--bg-hover);
              border: 1px solid var(--border-subtle);
            }
            .codex-settings-account-list-title {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 8px;
              font-size: 12px;
              font-weight: 600;
            }
            .codex-settings-account-list {
              display: grid;
              gap: 6px;
            }
            .codex-settings-account-item {
              display: grid;
              gap: 4px;
              padding: 8px 10px;
              border-radius: 8px;
              border: 1px solid var(--border-subtle);
              background: var(--bg-card);
            }
            .codex-settings-account-item.active {
              border-color: rgba(31, 122, 224, 0.45);
              box-shadow: inset 0 0 0 1px rgba(31, 122, 224, 0.12);
            }
            .codex-settings-account-item-head,
            .codex-settings-account-item-meta,
            .codex-settings-account-item-usage {
              display: flex;
              justify-content: space-between;
              gap: 8px;
              font-size: 12px;
            }
            .codex-settings-account-item-quota {
              display: grid;
              gap: 4px;
            }
            .codex-settings-account-item-progress {
              position: relative;
              height: 6px;
              overflow: hidden;
              border-radius: 999px;
              background: rgba(127, 127, 127, 0.18);
            }
            .codex-settings-account-item-progress-bar {
              height: 100%;
              border-radius: inherit;
              background: linear-gradient(90deg, #1f7ae0 0%, #41b3ff 100%);
            }
            .codex-settings-account-item-head {
              font-weight: 600;
            }
            .codex-settings-account-item-head-main {
              display: flex;
              align-items: center;
              gap: 6px;
              min-width: 0;
              flex: 1 1 auto;
            }
            .codex-settings-account-item-left {
              min-width: 0;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }
            .codex-settings-account-item-actions {
              display: flex;
              align-items: center;
              gap: 4px;
              flex: 0 0 auto;
            }
            .codex-settings-account-icon-btn {
              width: 22px;
              height: 22px;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              border: 1px solid var(--border-subtle);
              border-radius: 6px;
              background: var(--bg-hover);
              color: var(--text-secondary);
              font-size: 12px;
              line-height: 1;
              cursor: pointer;
            }
            .codex-settings-account-icon-btn :is(svg, i) {
              width: 13px;
              height: 13px;
            }
            .codex-settings-account-icon-btn:hover:not(:disabled) {
              color: var(--text-primary);
              border-color: rgba(31, 122, 224, 0.35);
            }
            .codex-settings-account-icon-btn:disabled {
              cursor: not-allowed;
              opacity: 0.45;
            }
            .codex-settings-account-item-right {
              flex: 0 0 auto;
              color: var(--text-secondary);
            }
            .codex-settings-account-item-meta,
            .codex-settings-account-item-usage {
              color: var(--text-secondary);
            }
            .codex-settings-account-item-chip {
              flex: 0 0 auto;
              padding: 0 6px;
              border-radius: 999px;
              background: rgba(31, 122, 224, 0.12);
              color: #1f7ae0;
              font-size: 11px;
              line-height: 20px;
            }
            .codex-settings-account-empty {
              font-size: 12px;
              color: var(--text-secondary);
            }
          `),
          context.vue.h('div', { class: 'codex-settings-account-list-title' }, [
            context.vue.h('div', { style: 'display:flex;align-items:center;gap:8px;' }, [
              context.vue.h(
                context.components?.Button as never,
                {
                  type: 'button',
                  variant: 'secondary',
                  size: 'sm',
                  disabled: Boolean(busyMessage) || !config.activeAccountId,
                  onClick: () =>
                    refreshUsage(true, true).catch((error) => {
                      context.notification.error(
                        error instanceof Error ? error.message : String(error),
                        'Codex 代理'
                      )
                    })
                },
                { default: () => '刷新额度' }
              ),
              context.vue.h(
                context.components?.Button as never,
                {
                  type: 'button',
                  variant: 'secondary',
                  size: 'sm',
                  disabled: Boolean(busyMessage),
                  onClick: () =>
                    doSaveCurrentLogin().catch((error) => {
                      context.notification.error(
                        error instanceof Error ? error.message : String(error),
                        'Codex 代理'
                      )
                    })
                },
                { default: () => '保存当前登录' }
              ),
              context.vue.h('span', { class: 'codex-settings-account-item-right' }, `${config.accounts.length} 个账号`)
            ])
          ]),
          config.accounts.length
            ? context.vue.h(
                'div',
                { class: 'codex-settings-account-list' },
                config.accounts.map((account) => {
                  const display = deriveUsageDisplay({
                    usage: account.usage,
                    usageError: account.usageError
                  })
                  const label = getAccountLabel(account)
                  const isActive = account.id === config.activeAccountId
                  const usedFiveHour = clampPercent(account.usage?.fiveHour?.usedPercent) ?? 0
                  const usedOneWeek = clampPercent(account.usage?.oneWeek?.usedPercent) ?? 0
                  return context.vue.h(
                    'div',
                    {
                      class: ['codex-settings-account-item', isActive ? 'active' : '']
                    },
                    [
                      context.vue.h('div', { class: 'codex-settings-account-item-head' }, [
                        context.vue.h('div', { class: 'codex-settings-account-item-head-main' }, [
                          context.vue.h(
                            'span',
                            {
                              class: 'codex-settings-account-item-left',
                              title: label
                            },
                            label
                          ),
                          isActive
                            ? context.vue.h('span', { class: 'codex-settings-account-item-chip' }, '当前')
                            : null
                        ]),
                        context.vue.h('div', { class: 'codex-settings-account-item-actions' }, [
                          context.vue.h(
                            'button',
                            {
                              type: 'button',
                              class: 'codex-settings-account-icon-btn',
                              title: isActive ? '当前账号' : '切换到此账号',
                              disabled: Boolean(busyMessage) || isActive,
                              onClick: (event: Event) => {
                                event.stopPropagation()
                                doSwitchAccount(account.id).catch((error) => {
                                  context.notification.error(
                                    error instanceof Error ? error.message : String(error),
                                    'Codex 代理'
                                  )
                                })
                              }
                            },
                            CheckIcon
                          ),
                          context.vue.h(
                            'button',
                            {
                              type: 'button',
                              class: 'codex-settings-account-icon-btn',
                              title: '写回 auth.json',
                              disabled: Boolean(busyMessage),
                              onClick: (event: Event) => {
                                event.stopPropagation()
                                doWriteBackAuth(account.id).catch((error) => {
                                  context.notification.error(
                                    error instanceof Error ? error.message : String(error),
                                    'Codex 代理'
                                  )
                                })
                              }
                            },
                            FileIcon
                          ),
                          context.vue.h(
                            'button',
                            {
                              type: 'button',
                              class: 'codex-settings-account-icon-btn',
                              title: '移除此账号',
                              disabled: Boolean(busyMessage),
                              onClick: (event: Event) => {
                                event.stopPropagation()
                                doRemoveCurrentAccount(account.id).catch((error) => {
                                  context.notification.error(
                                    error instanceof Error ? error.message : String(error),
                                    'Codex 代理'
                                  )
                                })
                              }
                            },
                            TrashIcon
                          )
                        ])
                      ]),
                      context.vue.h('div', { class: 'codex-settings-account-item-meta' }, [
                        context.vue.h(
                          'span',
                          { class: 'codex-settings-account-item-left' },
                          `${account.planType || '--'} / ${account.authMode || '--'}`
                        ),
                        context.vue.h(
                          'span',
                          { class: 'codex-settings-account-item-right' },
                          formatTimestampText(account.lastRefresh)
                        )
                      ]),
                      context.vue.h('div', { class: 'codex-settings-account-item-usage' }, [
                        context.vue.h(
                          'span',
                          { class: 'codex-settings-account-item-left' },
                          `Credits ${display.creditsDisplay}`
                        ),
                        context.vue.h(
                          'span',
                          { class: 'codex-settings-account-item-right' },
                          display.usageUpdatedDisplay
                        )
                      ]),
                      context.vue.h('div', { class: 'codex-settings-account-item-quota' }, [
                        context.vue.h('div', { class: 'codex-settings-account-item-usage' }, [
                          context.vue.h(
                            'span',
                            { class: 'codex-settings-account-item-left' },
                            `5h ${display.fiveHourDisplay}`
                          ),
                          context.vue.h(
                            'span',
                            { class: 'codex-settings-account-item-right' },
                            display.fiveHourResetDisplay
                          )
                        ]),
                        context.vue.h(
                          'div',
                          { class: 'codex-settings-account-item-progress', 'aria-hidden': 'true' },
                          [
                            context.vue.h('div', {
                              class: 'codex-settings-account-item-progress-bar',
                              style: {
                                width: `${Math.max(0, 100 - usedFiveHour)}%`,
                                marginLeft: `${usedFiveHour}%`
                              }
                            })
                          ]
                        ),
                        context.vue.h('div', { class: 'codex-settings-account-item-usage' }, [
                          context.vue.h(
                            'span',
                            { class: 'codex-settings-account-item-left' },
                            `1w ${display.oneWeekDisplay}`
                          ),
                          context.vue.h(
                            'span',
                            { class: 'codex-settings-account-item-right' },
                            display.oneWeekResetDisplay
                          )
                        ]),
                        context.vue.h(
                          'div',
                          { class: 'codex-settings-account-item-progress', 'aria-hidden': 'true' },
                          [
                            context.vue.h('div', {
                              class: 'codex-settings-account-item-progress-bar',
                              style: {
                                width: `${Math.max(0, 100 - usedOneWeek)}%`,
                                marginLeft: `${usedOneWeek}%`
                              }
                            })
                          ]
                        )
                      ])
                    ]
                  )
                })
              )
            : context.vue.h('div', { class: 'codex-settings-account-empty' }, '暂无已保存账号')
        ]
      )
    }

    updateStatusIndicator = () => {
      const activeAccount = runtimeConfig.accounts.find(
        (item) => item.id === runtimeConfig.activeAccountId
      )
      const accountLabel = activeAccount
        ? getAccountLabel(activeAccount)
        : DEFAULT_CONFIG.status

      const tooltip = runtimeConfig.accessToken
        ? `Codex 账号: ${accountLabel}`
        : 'Codex 未检测到可用登录'

      runtimeConfigState.value = runtimeConfig
      isStatusPanelOpenState.value = isStatusPanelOpen
      statusTooltipState.value = tooltip
      if (isStatusRegistered) return

      const statusRender = createAccountStatusRender({
        context,
        runtimeConfigRef: runtimeConfigState,
        isStatusPanelOpenRef: isStatusPanelOpenState,
        tooltipRef: statusTooltipState,
        busyMessageRef: bridgeBusyState,
        onSwitchAccount: async (accountId: string) => {
          await doSwitchAccount(accountId)
        },
        onRefreshUsage: async () => {
          await refreshUsage(true, true)
        },
        onSaveCurrentLogin: async () => {
          await doSaveCurrentLogin()
        },
        onWriteBackAuth: async () => {
          await doWriteBackAuth()
        },
        onRemoveCurrentAccount: async () => {
          await doRemoveCurrentAccount()
        }
      })

      ;(context.notification.status as unknown as (
        id: string,
        text: string,
        options?: Record<string, unknown>
      ) => void)(SERVICE_STATUS_ID, '', {
        render: statusRender,
        tooltip,
        color: '#fff'
      })
      isStatusRegistered = true
    }

    ;[FormComp, formActions] = context.useForm<CodexProxyPluginConfig>({
      title: 'Codex 代理',
      showHeader: false,
      fields: [
        {
          name: 'activeAccountId',
          type: 'select',
          label: '当前账号',
          options: getAccountOptions(initialConfig),
          placeholder: '请先保存当前登录',
          clearable: false,
          ifShow: false
        },
        {
          name: 'accountActions',
          type: 'custom',
          label: '账号操作',
          render: () => renderAccountActions(),
          ifShow: false
        },
        {
          name: 'usageSummary',
          type: 'custom',
          label: '额度 / 用量',
          render: () => renderUsageSummary(),
          ifShow: false
        },
        {
          name: 'accountsOverview',
          type: 'custom',
          label: '全部账号',
          render: () => renderAccountsOverview()
        },
        {
          name: 'bridgeHost',
          type: 'text',
          label: 'Bridge 主机',
          required: true,
          defaultValue: DEFAULT_CONFIG.bridgeHost
        },
        {
          name: 'bridgePort',
          type: 'number',
          label: 'Bridge 端口',
          required: true,
          defaultValue: DEFAULT_CONFIG.bridgePort
        },
        {
          name: 'defaultModel',
          type: 'text',
          label: '默认模型',
          defaultValue: DEFAULT_CONFIG.defaultModel,
          placeholder: 'codex'
        }
      ],
      initialData: initialConfig,
      onChange: async (field, value, data) => {
        if (isProgrammaticFormUpdate) return
        if (isBridgeBusy()) {
          syncFormActions(runtimeConfig)
          return
        }
        if (field === 'activeAccountId') {
          syncFormActions(runtimeConfig)
          await doSwitchAccount(String(value || ''))
          return
        }
        const previous = runtimeConfig
        runtimeConfig = buildRuntimeConfig(context, {
          ...runtimeConfig,
          ...data
        })
        await saveConfig(context, runtimeConfig)
        syncFormActions(runtimeConfig)
        if (runtimeConfig.accessToken) {
          await startBridge(context, runtimeConfig).catch(() => undefined)
        } else if (previous.accessToken) {
          await stopBridge(previous)
        }
        await syncProvider(context, FormComp)
        updateStatusIndicator()
      }
    })

    context.registerRegistry(REGISTRY_ID, () => {
      const provider = createOpenAICompatible({
        name: 'Codex 代理',
        baseURL: getProviderBaseURL(runtimeConfig),
        apiKey: BRIDGE_API_KEY
      }) as OpenAICompatibleWithListModels

      provider.listModels = async () => await listModels(context)
      provider.chatCallOptionsSchema = codexChatCallOptionsSchema
      return provider
    })

    context.registerHook('ai:before-use', async (params: unknown) => {
      const input = (params || {}) as { providerType?: string }
      if (input.providerType !== REGISTRY_ID) return
      if (Date.now() - lastBeforeUseEnsureAt > BEFORE_USE_ENSURE_CACHE_MS) {
        await ensureBridgeRunning(context, formActions)
        lastBeforeUseEnsureAt = Date.now()
      }
      if (isStatusPanelOpen) {
        await refreshUsage(false).catch(() => undefined)
      }
      updateStatusIndicator()
    })

    await startBridge(context, runtimeConfig).catch(() => undefined)
    await syncProvider(context, FormComp)
    updateStatusIndicator()
    await refreshUsage(false, true).catch(() => undefined)
  },
  uninstall: async (context: PluginContext) => {
    await stopBridge(runtimeConfig)
    context.unregisterProvider(PROVIDER_ID)
    context.unregisterRegistry(REGISTRY_ID)
    context.notification.removeStatus(SERVICE_STATUS_ID)
  }
}

export default plugin
