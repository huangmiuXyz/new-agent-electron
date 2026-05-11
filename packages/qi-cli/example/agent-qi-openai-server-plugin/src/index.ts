import type { Plugin, PluginContext } from '@agent-qi/types'

const PLUGIN_NAME = 'agent-qi-openai-server'
const STORAGE_KEY = 'agent_qi_openai_server_config'

type PluginConfig = {
  enabled: boolean
  host: string
  port: number
  apiKey: string
  adminKey: string
  model: { providerId: string; modelId: string }
  status: string
}

const DEFAULT_CONFIG: PluginConfig = {
  enabled: false,
  host: '127.0.0.1',
  port: 18188,
  apiKey: 'sk-agent-qi-local',
  adminKey: '',
  model: { providerId: '', modelId: '' },
  status: '未启动'
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const randomKey = () => {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

const normalizeConfig = (input?: Partial<PluginConfig> | null): PluginConfig => ({
  ...DEFAULT_CONFIG,
  ...input,
  enabled: Boolean(input?.enabled),
  host: String(input?.host || DEFAULT_CONFIG.host).trim() || DEFAULT_CONFIG.host,
  port: Number(input?.port || DEFAULT_CONFIG.port) || DEFAULT_CONFIG.port,
  apiKey: String(input?.apiKey || DEFAULT_CONFIG.apiKey).trim() || DEFAULT_CONFIG.apiKey,
  adminKey: String(input?.adminKey || '').trim() || randomKey(),
  model: {
    providerId: String(input?.model?.providerId || '').trim(),
    modelId: String(input?.model?.modelId || '').trim()
  },
  status: String(input?.status || DEFAULT_CONFIG.status)
})

const getBaseURL = (config: PluginConfig) => `http://${config.host}:${config.port}`

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const plugin: Plugin = {
  name: PLUGIN_NAME,
  version: '1.0.0',
  description: 'Expose Agent-Qi AI providers as an OpenAI-compatible local server.',
  install: async (context: PluginContext) => {
    const stored = await context.localforage.getItem<PluginConfig>(STORAGE_KEY)
    let runtimeConfig = normalizeConfig(stored)
    let isProgrammaticUpdate = false

    const saveConfig = async (next: PluginConfig) => {
      runtimeConfig = normalizeConfig(next)
      await context.localforage.setItem(STORAGE_KEY, runtimeConfig)
    }

    const getSettings = async () => await context.getStore<any>('settings')

    const getServerCodePath = () => {
      const serverPath = context.api.path.join(context.basePath, 'src', 'server.ts')
      const fallbackServerPath = context.api.path.join(context.basePath, 'server.ts')
      const codePath = context.api.fs.existsSync(serverPath) ? serverPath : fallbackServerPath

      if (!context.api.fs.existsSync(codePath)) {
        throw new Error(`未找到服务入口: ${codePath}`)
      }

      return codePath
    }

    const getProviderSnapshot = async () => {
      const settings = await getSettings()
      return cloneJson(settings.getAllProviders || [])
    }

    const runServerCommand = async <T = unknown>(
      command: Record<string, unknown>,
      options: { detached?: boolean; timeoutMs?: number } = {}
    ) => {
      return await context.execNodejs<T>({
        codePath: getServerCodePath(),
        args: [cloneJson(command)],
        detached: options.detached,
        timeoutMs: options.timeoutMs || (options.detached ? 5_000 : 3_000),
        modules: {
          ai: 'ai',
          openai: '@ai-sdk/openai',
          openaiCompatible: '@ai-sdk/openai-compatible',
          anthropic: '@ai-sdk/anthropic',
          deepseek: '@ai-sdk/deepseek',
          google: '@ai-sdk/google',
          xai: '@ai-sdk/xai',
          ollama: 'ai-sdk-ollama',
          openrouter: '@openrouter/ai-sdk-provider'
        }
      })
    }

    const setStatus = async (status: string) => {
      runtimeConfig = { ...runtimeConfig, status }
      await context.localforage.setItem(STORAGE_KEY, runtimeConfig)
      isProgrammaticUpdate = true
      formActions.setFieldsValue(runtimeConfig)
      isProgrammaticUpdate = false
    }

    const startServer = async (config: PluginConfig) => {
      await setStatus('启动中...')
      await runServerCommand({ action: 'stop', config })

      const result = await runServerCommand(
        {
          action: 'start',
          config,
          providers: await getProviderSnapshot()
        },
        {
        detached: true,
          timeoutMs: 5_000
        }
      )

      if (!result.ok) {
        throw new Error(result.error?.message || result.errorMessage || '启动 Node 服务失败')
      }

      let ready = false
      for (let index = 0; index < 30; index += 1) {
        const health = await runServerCommand<{ ok?: boolean; json?: { ok?: boolean } }>({
          action: 'health',
          config
        })
        if (health.ok && health.result?.json?.ok) {
          ready = true
          break
        }
        await sleep(300)
      }
      if (!ready) throw new Error(`服务启动超时: ${getBaseURL(config)}`)
      await setStatus(`运行中: ${getBaseURL(config)}/v1`)
    }

    const restartServer = async (config: PluginConfig) => {
      if (!config.enabled) {
        await runServerCommand({ action: 'stop', config })
        await setStatus('未启动')
        return
      }
      try {
        await startServer(config)
        context.notification.success(`OpenAI 兼容服务已启动: ${getBaseURL(config)}/v1`, 'Agent-Qi 服务')
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await setStatus(`启动失败: ${message}`)
        context.notification.error(message, 'Agent-Qi 服务')
      }
    }

    const renderServiceActions = () => {
      const Button = context.components?.Button as Record<string, unknown> | undefined
      if (!Button) return null
      return context.vue.h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;' }, [
        context.vue.h(
          Button as never,
          {
            type: 'button',
            size: 'sm',
            variant: 'primary',
            onClick: () => restartServer(formActions.getData())
          },
          { default: () => '启动 / 重启服务' }
        ),
        context.vue.h(
          Button as never,
          {
            type: 'button',
            size: 'sm',
            variant: 'secondary',
            onClick: async () => {
              await runServerCommand({ action: 'stop', config: runtimeConfig })
              await setStatus('未启动')
              context.notification.success('服务已停止。', 'Agent-Qi 服务')
            }
          },
          { default: () => '停止服务' }
        )
      ])
    }

    const [ConfigForm, formActions] = context.useForm<PluginConfig>({
      title: 'OpenAI 兼容服务',
      showHeader: false,
      fields: [
        {
          name: 'enabled',
          label: '启用服务',
          type: 'boolean',
          hint: '启用后会在桌面端启动本机 Node 服务。'
        },
        {
          name: 'host',
          label: 'Host',
          type: 'text',
          placeholder: '127.0.0.1'
        },
        {
          name: 'port',
          label: '端口',
          type: 'number',
          placeholder: '18188'
        },
        {
          name: 'apiKey',
          label: 'API Key',
          type: 'password',
          placeholder: 'sk-agent-qi-local'
        },
        {
          name: 'model',
          label: '默认模型',
          type: 'modelSelector',
          modelCategory: 'text',
          placeholder: '选择默认对外模型'
        },
        {
          name: 'status',
          label: '状态',
          type: 'text',
          readonly: true
        },
        {
          name: 'actions',
          label: '服务操作',
          type: 'custom',
          render: () => renderServiceActions()
        }
      ],
      initialData: runtimeConfig,
      onChange: async (_field, _value, data) => {
        if (isProgrammaticUpdate) return
        await saveConfig(data)
      }
    })

    context.registerSettings(ConfigForm)

    if (runtimeConfig.enabled) {
      void restartServer(runtimeConfig)
    }
  },
  uninstall: async (context: PluginContext) => {
    const stored = await context.localforage.getItem<PluginConfig>(STORAGE_KEY)
    if (stored) {
      const config = normalizeConfig(stored)
      const serverPath = context.api.path.join(context.basePath, 'src', 'server.ts')
      const fallbackServerPath = context.api.path.join(context.basePath, 'server.ts')
      const codePath = context.api.fs.existsSync(serverPath) ? serverPath : fallbackServerPath
      if (context.api.fs.existsSync(codePath)) {
        await context.execNodejs({
          codePath,
          args: [{ action: 'stop', config }],
          timeoutMs: 3_000,
          modules: {
            ai: 'ai',
            openai: '@ai-sdk/openai',
            openaiCompatible: '@ai-sdk/openai-compatible',
            anthropic: '@ai-sdk/anthropic',
            deepseek: '@ai-sdk/deepseek',
            google: '@ai-sdk/google',
            xai: '@ai-sdk/xai',
            ollama: 'ai-sdk-ollama',
            openrouter: '@openrouter/ai-sdk-provider'
          }
        })
      }
    }
    context.unregisterSettings()
  }
}

export default plugin
