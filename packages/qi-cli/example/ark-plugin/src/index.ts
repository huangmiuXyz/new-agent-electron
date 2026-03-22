import type { Plugin, PluginContext, Provider } from '@agent-qi/types'
import { createArk } from './ark'
import {
  DEFAULT_BASE_URL,
  PLUGIN_NAME,
  PROVIDER_ID,
  PROVIDER_LOGO,
  PROVIDER_NAME
} from './constants'

const buildProvider = (existing?: Partial<Provider>): Provider => ({
  id: PROVIDER_ID,
  name: PROVIDER_NAME,
  logo: existing?.logo || PROVIDER_LOGO,
  apiKey: existing?.apiKey || '',
  apiKeys: existing?.apiKeys || [],
  activeApiKeyId: existing?.activeApiKeyId || '',
  baseUrl: existing?.baseUrl || DEFAULT_BASE_URL,
  providerType: PROVIDER_ID as unknown as Provider['providerType'],
  models: existing?.models || [],
  pluginName: PLUGIN_NAME
})

const syncSettingsProvider = async (context: PluginContext) => {
  const settings = (await context.getStore('settings')) as any
  const existing = settings.providers?.find((provider: Provider) => provider.id === PROVIDER_ID)
  settings.addCustomProvider(buildProvider(existing))
}

const cleanupSettingsProvider = async (context: PluginContext) => {
  const settings = (await context.getStore('settings')) as any
  const provider = settings.providers?.find((item: Provider) => item.id === PROVIDER_ID)
  if (!provider || provider.pluginName !== PLUGIN_NAME) {
    return
  }

  settings.removeCustomProvider(PROVIDER_ID)

  const defaults = settings.defaultModels || {}
  const updates: Record<string, string> = {}
  const pairs = [
    ['speechProviderId', 'speechModelId'],
    ['ttsProviderId', 'ttsModelId'],
    ['titleGenerationProviderId', 'titleGenerationModelId'],
    ['translationProviderId', 'translationModelId'],
    ['searchProviderId', 'searchModelId']
  ] as const

  for (const [providerKey, modelKey] of pairs) {
    if (defaults[providerKey] === PROVIDER_ID) {
      updates[providerKey] = ''
      updates[modelKey] = ''
    }
  }

  if (Object.keys(updates).length > 0) {
    settings.updateDefaultModels(updates)
  }
}

const plugin: Plugin = {
  name: PLUGIN_NAME,
  version: '1.0.0',
  description: 'Volcengine Ark provider plugin',

  install: async (context: PluginContext) => {
    context.registerRegistry(PROVIDER_ID, (options: any) => createArk(options))
    await syncSettingsProvider(context)
  },

  uninstall: async (context: PluginContext) => {
    context.unregisterRegistry(PROVIDER_ID)
    await cleanupSettingsProvider(context)
  }
}

export default plugin
