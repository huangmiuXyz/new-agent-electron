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
  STORAGE_KEY,
  type CodexProxyPluginConfig
} from './constants'
import { readCodexAuthConfig, resolveDefaultAuthPath } from './auth'

type OpenAICompatibleWithListModels = ReturnType<typeof createOpenAICompatible> & {
  listModels?: () => Promise<Model[]>
}

let runtimeConfig: CodexProxyPluginConfig = { ...DEFAULT_CONFIG }
let isProgrammaticFormUpdate = false

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const getBridgeBaseURL = (config = runtimeConfig) =>
  `http://${config.bridgeHost}:${config.bridgePort}`

const getHealthURL = (config = runtimeConfig) =>
  `${getBridgeBaseURL(config)}/health`

const getProviderBaseURL = (config = runtimeConfig) =>
  `${getBridgeBaseURL(config)}/v1`

const getConfigHash = (config = runtimeConfig) =>
  JSON.stringify({
    authPath: config.authPath,
    accessToken: config.accessToken,
    accountId: config.accountId,
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
    throw new Error(`Bridge server not found: ${serverPath}`)
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
  const normalized = normalizeConfig(config)
  const persisted: CodexProxyPluginConfig = {
    ...DEFAULT_CONFIG,
    ...normalized,
    authPath: normalized.authPath || resolveDefaultAuthPath(context),
    status: DEFAULT_CONFIG.status,
    email: '',
    planType: '',
    authMode: '',
    lastRefresh: '',
    accessToken: '',
    accountId: ''
  }
  await context.localforage.setItem(STORAGE_KEY, persisted)
}

const refreshAuthConfig = async (
  context: PluginContext,
  formActions?: { setFieldsValue: (data: CodexProxyPluginConfig) => void }
) => {
  const stored =
    await context.localforage.getItem<CodexProxyPluginConfig>(STORAGE_KEY)
  runtimeConfig = readCodexAuthConfig(context, stored)
  formActions?.setFieldsValue(runtimeConfig)
  return runtimeConfig
}

const ensureBridgeRunning = async (
  context: PluginContext,
  formActions?: { setFieldsValue: (data: CodexProxyPluginConfig) => void }
) => {
  runtimeConfig = await refreshAuthConfig(context, formActions)
  if (!runtimeConfig.accessToken) {
    throw new Error(
      `No active Codex login found. Expected auth file: ${runtimeConfig.authPath}`
    )
  }

  const ready = await startBridge(context, runtimeConfig)
  if (!ready) {
    throw new Error(
      `Failed to start Codex bridge on ${getBridgeBaseURL(runtimeConfig)}`
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
const syncProvider = (context: PluginContext, form: unknown) => {
  try {
    context.unregisterProvider(PROVIDER_ID)
  } catch {
    // ignore
  }

  context.registerProvider(PROVIDER_ID, {
    name: 'Codex Proxy',
    logo: resolveProviderLogoUrl(context),
    providerType: REGISTRY_ID,
    form: form as Record<string, unknown>,
    models: buildDefaultModels(runtimeConfig.defaultModel)
  })
}

const plugin: Plugin = {
  name: PLUGIN_NAME,
  version: '1.0.0',
  description: 'Codex reverse proxy implemented inside the plugin bundle',
  install: async (context: PluginContext) => {
    const stored =
      await context.localforage.getItem<CodexProxyPluginConfig>(STORAGE_KEY)
    const initialConfig = readCodexAuthConfig(context, stored)
    runtimeConfig = initialConfig

    let formActions:
      | {
          setFieldsValue: (data: CodexProxyPluginConfig) => void
        }
      | undefined

    const renderRefreshButton = () => {
      const Button = context.components?.Button as
        | Record<string, unknown>
        | undefined
      if (!Button) return null

      return context.vue.h(
        Button as never,
        {
          type: 'button',
          variant: 'secondary',
          size: 'sm',
          onClick: async () => {
            try {
              const next = await refreshAuthConfig(context, formActions)
              isProgrammaticFormUpdate = true
              formActions?.setFieldsValue(next)
              isProgrammaticFormUpdate = false
              await startBridge(context, next).catch(() => undefined)
              syncProvider(context, FormComp)
              context.notification.success('Detected current Codex login.', 'Codex Proxy')
            } catch (error) {
              context.notification.error(
                error instanceof Error ? error.message : String(error),
                'Codex Proxy'
              )
            }
          }
        },
        { default: () => 'Refresh current login' }
      )
    }

    const [FormComp, actions] = context.useForm<CodexProxyPluginConfig>({
      title: 'Codex Proxy',
      showHeader: false,
      fields: [
        {
          name: 'status',
          type: 'text',
          label: 'Detected Login',
          readonly: true
        },
        {
          name: 'email',
          type: 'text',
          label: 'Email',
          readonly: true
        },
        {
          name: 'accountId',
          type: 'text',
          label: 'ChatGPT Account ID',
          readonly: true
        },
        {
          name: 'planType',
          type: 'text',
          label: 'Plan Type',
          readonly: true
        },
        {
          name: 'authMode',
          type: 'text',
          label: 'Auth Mode',
          readonly: true
        },
        {
          name: 'lastRefresh',
          type: 'text',
          label: 'Last Refresh',
          readonly: true
        },
        {
          name: 'authPath',
          type: 'path',
          label: 'Auth File',
          readonly: true,
          dialogOptions: {
            properties: ['openFile'],
            filters: [{ name: 'JSON', extensions: ['json'] }]
          },
          hint: 'Defaults to ~/.codex/auth.json'
        },
        {
          name: 'refreshAction',
          type: 'custom',
          label: 'Current Login',
          render: () => renderRefreshButton()
        },
        {
          name: 'bridgeHost',
          type: 'text',
          label: 'Bridge Host',
          required: true,
          defaultValue: DEFAULT_CONFIG.bridgeHost
        },
        {
          name: 'bridgePort',
          type: 'number',
          label: 'Bridge Port',
          required: true,
          defaultValue: DEFAULT_CONFIG.bridgePort
        },
        {
          name: 'defaultModel',
          type: 'text',
          label: 'Default Model',
          defaultValue: DEFAULT_CONFIG.defaultModel,
          placeholder: 'codex'
        }
      ],
      initialData: initialConfig,
      onChange: async (_field, _value, data) => {
        if (isProgrammaticFormUpdate) return
        await saveConfig(context, data)
        runtimeConfig = readCodexAuthConfig(context, data)
        isProgrammaticFormUpdate = true
        actions.setFieldsValue(runtimeConfig)
        isProgrammaticFormUpdate = false
        await startBridge(context, runtimeConfig).catch(() => undefined)
        syncProvider(context, FormComp)
      }
    })
    formActions = actions

    context.registerRegistry(REGISTRY_ID, () => {
      const provider = createOpenAICompatible({
        name: 'Codex Proxy',
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
    })

    await startBridge(context, runtimeConfig).catch(() => undefined)
    syncProvider(context, FormComp)
  },
  uninstall: async (context: PluginContext) => {
    await stopBridge(runtimeConfig)
    context.unregisterProvider(PROVIDER_ID)
    context.unregisterRegistry(REGISTRY_ID)
  }
}

export default plugin







