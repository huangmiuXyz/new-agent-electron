import data from '@renderer/assets/data/provider.json'

export const useSettingsStore = defineStore(
  'settings',
  () => {

    const getDefaultProviders = () => {
      return data.map((p) => ({
        ...p,
        providerType: p.providerType as Provider['providerType'],
        apiKey: '',
        models: []
      }))
    }

    const display = ref({
      darkMode: false,
      compactDensity: true,
      showTimestamps: true,
      fontSize: 13,
      sidebarCollapsed: false,
      showTerminal: false,
      terminalHeight: 200
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


    const loadedPlugins = ref<string[]>([])

    const devPluginPaths = ref<Record<string, string>>({})

    const defaultModels = ref({
      titleGenerationModelId: '',
      titleGenerationProviderId: '',
      translationModelId: '',
      translationProviderId: '',
      searchModelId: '',
      searchProviderId: ''
    })


    const thinkingMode = ref(false)

    const updateThinkingMode = (mode: boolean) => {
      thinkingMode.value = mode
    }

    const updateDisplaySettings = (settings: Partial<typeof display.value>) => {
      display.value = { ...display.value, ...settings }
    }

    const updateTerminalSettings = (settings: Partial<typeof terminal.value>) => {
      terminal.value = { ...terminal.value, ...settings }
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

    const updateDefaultModels = (settings: Partial<typeof defaultModels.value>) => {
      defaultModels.value = { ...defaultModels.value, ...settings }
    }


    const updateLoadedPlugins = (plugins: string[]) => {
      loadedPlugins.value = plugins
    }


    const addLoadedPlugin = (pluginName: string) => {
      if (!loadedPlugins.value.includes(pluginName)) {
        loadedPlugins.value.push(pluginName)
      }
    }


    const removeLoadedPlugin = (pluginName: string) => {
      const index = loadedPlugins.value.indexOf(pluginName)
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
      updateDisplaySettings,
      updateTerminalSettings,
      updateThinkingMode,
      updateProvider,
      addModelToProvider,
      deleteModelFromProvider,
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
      resetProviderBaseUrl
    }
  },
  {
    persist: {
      storage: indexedDBStorage,
      afterRestore: async () => {
        const { restorePlugins } = usePlugins()
        restorePlugins()
      }
    }
  }
)
