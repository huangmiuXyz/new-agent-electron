import type { Plugin, PluginContext } from '@agent-qi/types'
import { createSkyReels } from './skyreels'
import {
  DEFAULT_BASE_URL,
  DEFAULT_MODEL_ID,
  PLUGIN_NAME,
  PROVIDER_ID,
  PROVIDER_LOGO,
  PROVIDER_NAME,
  STORAGE_KEY
} from './constants'

const plugin: Plugin = {
  name: PLUGIN_NAME,
  version: '1.0.0',
  description: 'SkyReels v4 video provider plugin',

  install: async (context: PluginContext) => {
    const { localforage, useForm } = context
    let currentConfig: { apiKey?: string } = (await localforage.getItem(STORAGE_KEY)) || {}

    const [ConfigForm] = useForm({
      fields: [
        {
          name: 'apiKey',
          label: 'API Key',
          type: 'password',
          placeholder: '输入 SkyReels API Key'
        }
      ],
      initialData: {
        apiKey: currentConfig.apiKey || ''
      },
      onChange: async (_field, _value, data: { apiKey?: string }) => {
        currentConfig = JSON.parse(JSON.stringify(data))
        await localforage.setItem(STORAGE_KEY, currentConfig)
      }
    })

    context.registerRegistry(
      PROVIDER_ID,
      (options: Record<string, unknown>) =>
        createSkyReels({
          ...options,
          apiKey:
            typeof options?.apiKey === 'string' && options.apiKey
              ? options.apiKey
              : currentConfig.apiKey,
          baseURL: typeof options?.baseURL === 'string' && options.baseURL
            ? options.baseURL
            : DEFAULT_BASE_URL
        }),
      { hide: true }
    )

    context.registerProvider(PROVIDER_ID, {
      name: PROVIDER_NAME,
      providerType: PROVIDER_ID,
      logo: PROVIDER_LOGO,
      form: ConfigForm as any,
      models: [
        {
          id: DEFAULT_MODEL_ID,
          name: 'SkyReels V4 Video',
          category: 'video',
          active: true
        }
      ]
    })
  },

  uninstall: async (context: PluginContext) => {
    context.unregisterProvider(PROVIDER_ID)
    context.unregisterRegistry(PROVIDER_ID)
  }
}

export default plugin
