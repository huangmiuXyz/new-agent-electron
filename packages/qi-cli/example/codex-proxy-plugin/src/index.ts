import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { Model, Plugin, PluginContext } from '@agent-qi/types'
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
  type CodexProxyPluginConfig
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
}

type FormActionsLike = {
  setFieldsValue: (data: CodexProxyPluginConfig) => void
  updateFieldProps: (field: string, props: Record<string, unknown>) => void
  getData: () => CodexProxyPluginConfig
}

let runtimeConfig: CodexProxyPluginConfig = { ...DEFAULT_CONFIG }
let isProgrammaticFormUpdate = false
let isStatusPanelOpen = false

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const getAccountLabel = (account: CodexProxyAccountProfile) =>
  account.email || account.accountId

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
      lastRefresh: normalized.lastRefresh
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
    lastRefresh: activeAccount?.lastRefresh || ''
  }
}

const getAccountOptions = (config: CodexProxyPluginConfig) =>
  config.accounts.map((account) => ({
    label: getAccountLabel(account),
    value: account.id
  }))

const updateAccountSelectorProps = (
  actions: { updateFieldProps: (field: string, props: Record<string, unknown>) => void },
  config: CodexProxyPluginConfig
) => {
  actions.updateFieldProps('activeAccountId', {
    options: getAccountOptions(config)
  })
}

const getBridgeBaseURL = (config = runtimeConfig) =>
  `http://${config.bridgeHost}:${config.bridgePort}`

const getHealthURL = (config = runtimeConfig) =>
  `${getBridgeBaseURL(config)}/health`

const getProviderBaseURL = (config = runtimeConfig) =>
  `${getBridgeBaseURL(config)}/v1`

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

const waitForBridge = async (
  config: CodexProxyPluginConfig,
  maxRetries = 20
) => {
  for (let index = 0; index < maxRetries; index += 1) {
    const health = await tryJson(getHealthURL(config))
    if (health?.ok && health.configHash === getConfigHash(config)) {
      return true
    }
    await sleep(500)
  }
  return false
}

const stopBridge = async (config: CodexProxyPluginConfig) => {
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
  const health = await tryJson(getHealthURL(config))
  if (health?.ok && health.configHash === getConfigHash(config)) {
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
      CODEX_PROXY_PLUGIN_API_KEY: BRIDGE_API_KEY,
      ...(isElectron ? { ELECTRON_RUN_AS_NODE: '1' } : {})
    }
  })

  if (child && typeof child.unref === 'function') {
    child.unref()
  }

  return await waitForBridge(config)
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

  const ready = await startBridge(context, runtimeConfig)
  if (!ready) {
    throw new Error(
      `启动 Codex bridge 失败: ${getBridgeBaseURL(runtimeConfig)}`
    )
  }
}

const listModels = async (context: PluginContext) => {
  try {
    await ensureBridgeRunning(context)
    const response = await fetch(`${getProviderBaseURL(runtimeConfig)}/models`, {
      headers: {
        Authorization: `Bearer ${BRIDGE_API_KEY}`
      }
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const json = (await response.json()) as { data?: Model[] }
    return json.data?.length
      ? json.data
      : buildDefaultModels(runtimeConfig.defaultModel)
  } catch {
    return buildDefaultModels(runtimeConfig.defaultModel)
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

    const syncFormActions = (config: CodexProxyPluginConfig) => {
      if (!formActions) return
      isProgrammaticFormUpdate = true
      formActions.setFieldsValue(config)
      updateAccountSelectorProps(formActions, config)
      isProgrammaticFormUpdate = false
    }

    const doSwitchAccount = async (accountId: string) => {
      const current = formActions?.getData() || runtimeConfig
      if (!accountId || accountId === current.activeAccountId) return
      const previous = runtimeConfig
      const next = buildRuntimeConfig(context, {
        ...current,
        activeAccountId: accountId
      })
      await saveConfig(context, next)
      runtimeConfig = next
      syncFormActions(next)
      if (next.accessToken) {
        await startBridge(context, next).catch(() => undefined)
      } else if (previous.accessToken) {
        await stopBridge(previous)
      }
      await syncProvider(context, FormComp)
      updateStatusIndicator()
      context.notification.success('已切换账号。', 'Codex 代理')
    }

    const doSaveCurrentLogin = async () => {
      const currentAuthPath = formActions?.getData().authPath || runtimeConfig.authPath
      const detected = readCodexAuthAccount(context, currentAuthPath)
      const merged = buildRuntimeConfig(context, {
        ...(formActions?.getData() || runtimeConfig),
        accounts: [
          ...runtimeConfig.accounts.filter((item) => item.id !== detected.id),
          detected
        ],
        activeAccountId: detected.id
      })
      await saveConfig(context, merged)
      runtimeConfig = merged
      syncFormActions(merged)
      await startBridge(context, merged).catch(() => undefined)
      await syncProvider(context, FormComp)
      updateStatusIndicator()
      context.notification.success('已将当前登录保存到账号列表。', 'Codex 代理')
    }

    const doWriteBackAuth = async () => {
      const current = formActions?.getData() || runtimeConfig
      const activeAccount = current.accounts.find(
        (account) => account.id === current.activeAccountId
      )
      if (!activeAccount) {
        throw new Error('未找到当前激活账号')
      }

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

    const doRemoveCurrentAccount = async () => {
      const current = formActions?.getData() || runtimeConfig
      if (!current.activeAccountId) {
        throw new Error('未选择当前账号。')
      }
      const previous = runtimeConfig
      const accounts = current.accounts.filter(
        (account) => account.id !== current.activeAccountId
      )
      const next = buildRuntimeConfig(context, {
        ...current,
        accounts,
        activeAccountId: accounts[0]?.id || ''
      })
      await saveConfig(context, next)
      runtimeConfig = next
      syncFormActions(next)
      if (next.accessToken) {
        await startBridge(context, next).catch(() => undefined)
      } else {
        await stopBridge(previous)
      }
      await syncProvider(context, FormComp)
      updateStatusIndicator()
      context.notification.success('已移除当前账号。', 'Codex 代理')
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
              onClick: () => safeCall(doRemoveCurrentAccount)
            },
            { default: () => '移除当前账号' }
          )
        ]
      )
    }

    const updateStatusIndicator = () => {
      isStatusPanelOpen = false
      const activeAccount = runtimeConfig.accounts.find(
        (item) => item.id === runtimeConfig.activeAccountId
      )
      const accountLabel = activeAccount
        ? getAccountLabel(activeAccount)
        : DEFAULT_CONFIG.status

      const tooltip = runtimeConfig.accessToken
        ? `Codex 账号: ${accountLabel}`
        : 'Codex 未检测到可用登录'

      const statusRender = createAccountStatusRender({
        context,
        runtimeConfig,
        isStatusPanelOpen,
        tooltip,
        onPanelOpenChange: (open) => {
          isStatusPanelOpen = open
        },
        onSwitchAccount: async (accountId: string) => {
          await doSwitchAccount(accountId)
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
          clearable: false
        },
        {
          name: 'accountActions',
          type: 'custom',
          label: '账号操作',
          render: () => renderAccountActions()
        },
        {
          name: 'status',
          type: 'text',
          label: '已选登录',
          readonly: true
        },
        {
          name: 'email',
          type: 'text',
          label: '邮箱',
          readonly: true
        },
        {
          name: 'accountId',
          type: 'text',
          label: 'ChatGPT 账号 ID',
          readonly: true
        },
        {
          name: 'planType',
          type: 'text',
          label: '套餐类型',
          readonly: true
        },
        {
          name: 'authMode',
          type: 'text',
          label: '认证模式',
          readonly: true
        },
        {
          name: 'lastRefresh',
          type: 'text',
          label: '最近刷新',
          readonly: true
        },
        {
          name: 'authPath',
          type: 'path',
          label: '认证文件',
          readonly: true,
          dialogOptions: {
            properties: ['openFile'],
            filters: [{ name: 'JSON', extensions: ['json'] }]
          },
          hint: '默认路径：~/.codex/auth.json'
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
      onChange: async (_field, _value, data) => {
        if (isProgrammaticFormUpdate) return
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
      return provider
    })

    context.registerHook('ai:before-use', async (params: unknown) => {
      const input = (params || {}) as { providerType?: string }
      if (input.providerType !== REGISTRY_ID) return
      await ensureBridgeRunning(context, formActions)
      updateStatusIndicator()
    })

    await startBridge(context, runtimeConfig).catch(() => undefined)
    await syncProvider(context, FormComp)
    updateStatusIndicator()
  },
  uninstall: async (context: PluginContext) => {
    await stopBridge(runtimeConfig)
    context.unregisterProvider(PROVIDER_ID)
    context.unregisterRegistry(REGISTRY_ID)
    context.notification.removeStatus(SERVICE_STATUS_ID)
  }
}

export default plugin
