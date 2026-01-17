import data from '@renderer/assets/data/provider.json'

export const useSettingsStore = defineStore(
  'settings',
  () => {

    const getDefaultProviders = () => {
      return data.map((p) => ({
        ...p,
        providerType: p.providerType as Provider['providerType'],
        apiKey: '',
        apiKeys: [],
        models: []
      }))
    }

    const display = ref({
      darkMode: false,
      compactDensity: true,
      showTimestamps: true,
      fontSize: 16,
      sidebarCollapsed: false,
      showTerminal: false,
      terminalHeight: 200,
      expandToolsByDefault: true,
      expandThoughtByDefault: true
    })

    const terminal = ref({
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      cursorBlink: true,

      backgroundColor: '#ffffff',
      foregroundColor: '#333333',
      cursorColor: '#333333',
      selectionBackgroundColor: '#add6ff'
    })

    const providers = ref<Provider[]>(getDefaultProviders())

    const mcpServers = ref<ClientConfig>({})


    const loadedPlugins = ref<LoadedPluginConfig[]>([])

    const devPluginPaths = ref<Record<string, string>>({})


    const defaultModels = ref({
      titleGenerationModelId: '',
      titleGenerationProviderId: '',
      translationModelId: '',
      translationProviderId: '',
      searchModelId: '',
      searchProviderId: '',
      speechModelId: '',
      speechProviderId: '',
      ttsModelId: '',
      ttsProviderId: '',
    })

    const registeredProviders = ref<RegisteredProvider[]>([])
    const getAllProviders = computed(() => {
      return [...providers.value, ...registeredProviders.value] as Provider[]
    })
    const thinkingMode = ref(false)
    const speechEnabled = ref(false)

    const updateThinkingMode = (mode: boolean) => {
      thinkingMode.value = mode
    }

    const updateSpeechEnabled = (enabled: boolean) => {
      speechEnabled.value = enabled
    }

    const updateDisplaySettings = (settings: Partial<typeof display.value>) => {
      display.value = { ...display.value, ...settings }
    }

    const updateTerminalSettings = (settings: Partial<typeof terminal.value>) => {
      terminal.value = { ...terminal.value, ...settings }
    }

    const addRegisteredProvider = (provider: RegisteredProvider) => {
      registeredProviders.value.push(provider)
    }

    const removeRegisteredProvider = (id: string) => {
      const index = registeredProviders.value.findIndex((p) => p.id === id)
      if (index > -1) {
        registeredProviders.value.splice(index, 1)
      }
    }

    const togglePluginNotification = (pluginName: string, disabled: boolean) => {
      const plugin = loadedPlugins.value.find((p) => p.name === pluginName)
      if (plugin) {
        plugin.notificationsDisabled = disabled
      } else {
        // 如果插件不在加载列表中，可能是还没保存，先加进去
        loadedPlugins.value.push({
          name: pluginName,
          notificationsDisabled: disabled
        })
      }
    }

    const updateProvider = (providerId: string, providerData: Provider) => {
      const index = providers.value.findIndex((p) => p.id === providerId)
      if (index !== -1) {
        const currentProvider = providers.value[index]
        if (currentProvider) {
          providers.value[index] = {
            ...providerData,
            id: currentProvider.id,
            name: currentProvider.name,
            logo: currentProvider.logo
          }
        }
      }
    }

    const addModelToProvider = (providerId: string, model: Model) => {
      const index = providers.value.findIndex((p) => p.id === providerId)
      if (index !== -1) {
        const provider = providers.value[index]
        if (provider) {
          if (!provider.models) {
            provider.models = []
          }
          provider.models.unshift(model)
        }
      }
    }

    const deleteModelFromProvider = (providerId: string, modelId: string) => {
      const providerIndex = providers.value.findIndex((p) => p.id === providerId)
      if (providerIndex !== -1) {
        const provider = providers.value[providerIndex]
        if (provider && provider.models) {
          const modelIndex = provider.models.findIndex((m) => m.id === modelId)
          if (modelIndex !== -1) {
            provider.models.splice(modelIndex, 1)
          }
        }
      }
    }

    const addApiKeyToProvider = (providerId: string, apiKey: ApiKeyInfo) => {
      const index = providers.value.findIndex((p) => p.id === providerId)
      if (index !== -1) {
        const provider = { ...providers.value[index] }
        provider.apiKeys = [...(provider.apiKeys || []), apiKey]
        // 如果当前没有设置 API Key，则默认使用这一个
        if (!provider.apiKey) {
          provider.apiKey = apiKey.key
          provider.activeApiKeyId = apiKey.id
        }
        providers.value[index] = provider
      }
    }

    const deleteApiKeyFromProvider = (providerId: string, apiKeyId: string) => {
      const index = providers.value.findIndex((p) => p.id === providerId)
      if (index !== -1) {
        const provider = { ...providers.value[index] }
        if (provider.apiKeys) {
          const deleteIndex = provider.apiKeys.findIndex((k) => k.id === apiKeyId)
          if (deleteIndex === -1) return
          const isCurrentActive = provider.activeApiKeyId === apiKeyId

          provider.apiKeys = provider.apiKeys.filter((k) => k.id !== apiKeyId)

          // 如果删除的是当前激活的密钥
          if (isCurrentActive) {
            if (provider.apiKeys.length > 0) {
              // 优先切换到原位置的下一个（现在的 deleteIndex），如果已经是最后一个则切到上一个
              const nextActiveKey = provider.apiKeys[deleteIndex] || provider.apiKeys[provider.apiKeys.length - 1]
              provider.apiKey = nextActiveKey.key
              provider.activeApiKeyId = nextActiveKey.id
            } else {
              // 如果没有密钥了，清空 apiKey
              provider.apiKey = ''
              provider.activeApiKeyId = ''
            }
          }

          providers.value[index] = provider
        }
      }
    }

    const switchApiKeyForProvider = (providerId: string, apiKeyId: string) => {
      const index = providers.value.findIndex((p) => p.id === providerId)
      if (index !== -1) {
        const provider = { ...providers.value[index] }
        if (provider.apiKeys) {
          const apiKeyInfo = provider.apiKeys.find((k) => k.id === apiKeyId)
          if (apiKeyInfo) {
            provider.apiKey = apiKeyInfo.key
            provider.activeApiKeyId = apiKeyInfo.id
            providers.value[index] = provider
          }
        }
      }
    }

    const updateDefaultModels = (settings: Partial<typeof defaultModels.value>) => {
      defaultModels.value = { ...defaultModels.value, ...settings }
    }


    const updateLoadedPlugins = (plugins: LoadedPluginConfig[]) => {
      loadedPlugins.value = plugins
    }


    const addLoadedPlugin = (pluginName: string) => {
      if (!loadedPlugins.value.find((p) => p.name === pluginName)) {
        loadedPlugins.value.push({ name: pluginName })
      }
    }


    const removeLoadedPlugin = (pluginName: string) => {
      const index = loadedPlugins.value.findIndex((p) => p.name === pluginName)
      if (index > -1) {
        loadedPlugins.value.splice(index, 1)
      }
    }

    const addDevPluginPath = (pluginName: string, path: string) => {
      devPluginPaths.value[pluginName] = path
    }

    const removeDevPluginPath = (pluginName: string) => {
      delete devPluginPaths.value[pluginName]
    }


    const resetProviderBaseUrl = (providerId: string) => {
      const defaultProviders = getDefaultProviders()
      const defaultProvider = defaultProviders.find((p) => p.id === providerId)

      if (defaultProvider) {
        const index = providers.value.findIndex((p) => p.id === providerId)
        if (index !== -1) {
          const currentProvider = providers.value[index]
          providers.value[index] = {
            ...currentProvider,
            baseUrl: defaultProvider.baseUrl
          }
        }
      }
    }

    const selectedModelId = ref<string>('deepseek-chat')
    const selectedProviderId = ref<string>('深度探索')
    const currentSelectedProvider = computed(() => {
      return providers.value.find((p) => p.id === selectedProviderId.value)
    })
    const currentSelectedModel = computed(() => {
      return currentSelectedProvider.value?.models?.find((p) => p.id === selectedModelId.value)
    })

    const getProviderById = (id: string) => {
      return providers.value.find((p) => p.id === id)
    }
    const getModelById = (pid: string, mid: string) => {
      const provider = getProviderById(pid)!
      return { model: provider?.models.find((m) => m.id === mid)!, provider }
    }

    const getModelByVoice = (voice: string) => {
      const { ttsModelId, ttsProviderId } = defaultModels.value
      const modelIds = Array.isArray(ttsModelId) ? ttsModelId : [ttsModelId]
      const providerIds = Array.isArray(ttsProviderId) ? ttsProviderId : [ttsProviderId]

      for (let i = 0; i < modelIds.length; i++) {
        const mId = modelIds[i]
        const pId = providerIds[i]
        const provider = getProviderById(pId)
        const model = provider?.models?.find((m) => m.id === mId)
        if (model?.voices?.some((v) => v.id === voice)) {
          return { modelId: mId, providerId: pId }
        }
      }
      return null
    }


    const getTitleGenerationModel = computed(() => {
      const provider = providers.value.find(
        (p) => p.id === defaultModels.value.titleGenerationProviderId
      )
      return provider?.models?.find((m) => m.id === defaultModels.value.titleGenerationModelId)
    })

    const getTranslationModel = computed(() => {
      const provider = providers.value.find(
        (p) => p.id === defaultModels.value.translationProviderId
      )
      return provider?.models?.find((m) => m.id === defaultModels.value.translationModelId)
    })

    const getValidTools = (tools: string[] | undefined) => {
      if (!tools) return []

      return tools.filter((toolId) => {
        const [serverName, toolName] = toolId.split('.')
        const server = mcpServers.value[serverName]
        return server && server.active && server.tools && server.tools[toolName]
      })
    }

    return {
      display,
      terminal,
      providers,
      mcpServers,
      loadedPlugins,
      devPluginPaths,
      defaultModels,
      thinkingMode,
      speechEnabled,
      updateThinkingMode,
      updateSpeechEnabled,
      updateDisplaySettings,
      updateTerminalSettings,
      addRegisteredProvider,
      removeRegisteredProvider,
      togglePluginNotification,
      updateProvider,
      addModelToProvider,
      deleteModelFromProvider,
      addApiKeyToProvider,
      deleteApiKeyFromProvider,
      switchApiKeyForProvider,
      updateDefaultModels,
      updateLoadedPlugins,
      addLoadedPlugin,
      removeLoadedPlugin,
      addDevPluginPath,
      removeDevPluginPath,
      selectedModelId,
      selectedProviderId,
      currentSelectedProvider,
      currentSelectedModel,
      getProviderById,
      getModelById,
      getTitleGenerationModel,
      getTranslationModel,
      getValidTools,
      resetProviderBaseUrl,
      getAllProviders,
      registeredProviders,
      getModelByVoice
    }
  },
  {
    persist: {
      storage: indexedDBStorage,
      paths: [
        'display',
        'terminal',
        'providers',
        'mcpServers',
        'loadedPlugins',
        'devPluginPaths',
        'defaultModels',
        'thinkingMode',
        'speechEnabled',
        'selectedModelId',
        'selectedProviderId',
        'currentSelectedProvider',
        'currentSelectedModel'
      ],
      afterRestore: async () => {
        const { restorePlugins } = usePlugins()
        restorePlugins()
      }
    }
  }
)
