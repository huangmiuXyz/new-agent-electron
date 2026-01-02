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
      fontSize: 16,
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
      speechProviderId: ''
    })

    const registeredProviders = ref<RegisteredProvider[]>([])

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
      registeredProviders,
      thinkingMode,
      updateDisplaySettings,
      updateTerminalSettings,
      updateThinkingMode,
      addRegisteredProvider,
      removeRegisteredProvider,
      togglePluginNotification,
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
      // 自定义序列化，过滤掉插件注册的提供商
      serializer: {
        deserialize: (value) => {
          return JSON.parse(value)
        },
        serialize: (state: any) => {
          const copy = { ...state }
          if (copy.providers) {
            copy.providers = copy.providers.filter((p: any) => !p.pluginName)
          }
          delete copy.registeredProviders
          return JSON.stringify(copy)
        }
      },
      afterRestore: async () => {
        const { restorePlugins } = usePlugins()
        restorePlugins()
      }
    }
  }
)
