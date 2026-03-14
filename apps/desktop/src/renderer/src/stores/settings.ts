import data from '@renderer/assets/provider.json'
import { ImageGenerateOptions } from '@renderer/services/chatService'

let resolveRestore: () => void
const restorePromise = new Promise<void>((resolve) => {
  resolveRestore = resolve
})

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
      sidebarWidth: 200,
      chatSidebarWidth: 260,
      notesSidebarWidth: 260,
      settingsSidebarWidth: 220,
      imageSidebarWidth: 300,
      speechSidebarWidth: 320,
      speechSidebarCollapsed: true,
      showTerminal: false,
      terminalHeight: 200,
      expandToolsByDefault: true,
      expandThoughtByDefault: true,
      chatCenteredLayout: false
    })

    // 快捷键配置
    const shortcuts = ref<ShortcutConfig[]>(
      BUILTIN_SHORTCUTS.map(s => ({ ...s }))
    )

    // 更新快捷键配置
    const updateShortcut = (id: string, updates: Partial<ShortcutConfig>) => {
      const index = shortcuts.value.findIndex(s => s.id === id)
      if (index > -1) {
        shortcuts.value[index] = { ...shortcuts.value[index], ...updates }
      }
    }

    // 重置快捷键为默认值
    const resetShortcut = (id: string) => {
      const builtin = BUILTIN_SHORTCUTS.find(s => s.id === id)
      if (builtin) {
        updateShortcut(id, {
          currentKey: undefined,
          enabled: builtin.enabled
        })
      }
    }

    // 重置所有快捷键
    const resetAllShortcuts = () => {
      shortcuts.value = BUILTIN_SHORTCUTS.map(s => ({ ...s }))
    }

    // 获取生效的快捷键（优先使用 currentKey，否则使用 defaultKey）
    const getActiveShortcutKey = (id: string): string => {
      const shortcut = shortcuts.value.find(s => s.id === id)
      if (!shortcut || !shortcut.enabled) return ''
      return shortcut.currentKey || shortcut.defaultKey
    }

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
    const providerOrder = ref<string[]>(providers.value.map((p) => p.id))
    const favoriteAgentIds = ref<string[]>([])
    const favoriteModelKeys = ref<string[]>([])

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
    const thinkingMode = ref(false)
    const speechEnabled = ref(false)
    const providerOptions = ref<Record<string, any>>({})

    const updateThinkingMode = (mode: boolean) => {
      thinkingMode.value = mode
    }

    const updateSpeechEnabled = (enabled: boolean) => {
      speechEnabled.value = enabled
    }

    const updateProviderOptions = (id: string, options: Record<string, any>) => {
      providerOptions.value[id] = options
    }

    const updateDisplaySettings = (settings: Partial<typeof display.value>) => {
      display.value = { ...display.value, ...settings }
    }

    const updateTerminalSettings = (settings: Partial<typeof terminal.value>) => {
      terminal.value = { ...terminal.value, ...settings }
    }

    const addRegisteredProvider = (provider: RegisteredProvider) => {
      registeredProviders.value.push(provider)
      if (!providerOrder.value.includes(provider.id)) {
        providerOrder.value.push(provider.id)
      }
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

    // 辅助函数：查找提供商
    const findProviderRef = (providerId: string): { index: number; target: typeof providers } | null => {
      const index = providers.value.findIndex((p) => p.id === providerId)
      if (index !== -1) return { index, target: providers }
      return null
    }

    const updateProvider = (providerId: string, providerData: Provider) => {
      const result = findProviderRef(providerId)
      if (!result) return
      const { index, target } = result
      const currentProvider = target.value[index]
      if (currentProvider) {
        target.value[index] = {
          ...providerData,
          id: currentProvider.id,
          name: currentProvider.name,
          logo: currentProvider.logo
        }
      }
    }

    const addModelToProvider = (providerId: string, model: Model) => {
      const result = findProviderRef(providerId)
      if (!result) return
      const { index, target } = result
      const provider = target.value[index]
      if (provider) {
        if (!provider.models) provider.models = []
        provider.models.unshift(model)
      }
    }

    const deleteModelFromProvider = (providerId: string, modelId: string) => {
      const result = findProviderRef(providerId)
      if (!result) return
      const { index, target } = result
      const provider = target.value[index]
      if (provider?.models) {
        const modelIndex = provider.models.findIndex((m) => m.id === modelId)
        if (modelIndex !== -1) provider.models.splice(modelIndex, 1)
      }
    }

    const addApiKeyToProvider = (providerId: string, apiKey: ApiKeyInfo) => {
      const result = findProviderRef(providerId)
      if (!result) return
      const { index, target } = result
      const provider = { ...target.value[index] }
      provider.apiKeys = [...(provider.apiKeys || []), apiKey]
      if (!provider.apiKey) {
        provider.apiKey = apiKey.key
        provider.activeApiKeyId = apiKey.id
      }
      target.value[index] = provider
    }

    const deleteApiKeyFromProvider = (providerId: string, apiKeyId: string) => {
      const result = findProviderRef(providerId)
      if (!result) return
      const { index, target } = result
      const provider = { ...target.value[index] }
      if (!provider.apiKeys) return

      const deleteIndex = provider.apiKeys.findIndex((k) => k.id === apiKeyId)
      if (deleteIndex === -1) return

      const isCurrentActive = provider.activeApiKeyId === apiKeyId
      provider.apiKeys = provider.apiKeys.filter((k) => k.id !== apiKeyId)

      if (isCurrentActive) {
        if (provider.apiKeys.length > 0) {
          const nextActiveKey = provider.apiKeys[deleteIndex] || provider.apiKeys[provider.apiKeys.length - 1]
          provider.apiKey = nextActiveKey.key
          provider.activeApiKeyId = nextActiveKey.id
        } else {
          provider.apiKey = ''
          provider.activeApiKeyId = ''
        }
      }

      target.value[index] = provider
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
      const { [pluginName]: _, ...rest } = devPluginPaths.value
      devPluginPaths.value = rest
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

    // 自定义提供商管理（直接添加到 providers 中）
    const addCustomProvider = (provider: Provider) => {
      const existingIndex = providers.value.findIndex((p) => p.id === provider.id)
      if (existingIndex > -1) {
        providers.value[existingIndex] = provider
      } else {
        providers.value.push(provider)
        if (!providerOrder.value.includes(provider.id)) {
          providerOrder.value.push(provider.id)
        }
      }
    }

    const removeCustomProvider = (providerId: string) => {
      const index = providers.value.findIndex((p) => p.id === providerId)
      if (index > -1) {
        providers.value.splice(index, 1)
      }
      providerOrder.value = providerOrder.value.filter((pid) => pid !== providerId)
    }

    const replaceSyncProviders = (nextProviders: Provider[], nextOrder?: string[]) => {
      const baseProviders = getDefaultProviders()
      const baseProviderIds = new Set(baseProviders.map((provider) => provider.id))
      const incomingProviders = nextProviders.filter((provider) => !provider.pluginName)
      const incomingProviderMap = new Map(incomingProviders.map((provider) => [provider.id, provider] as const))
      const incomingCustomProviders = incomingProviders.filter((provider) => !baseProviderIds.has(provider.id))
      const localPluginProviders = providers.value.filter((provider) => provider.pluginName)

      providers.value = [
        ...baseProviders.map((provider) => incomingProviderMap.get(provider.id) || provider),
        ...incomingCustomProviders,
        ...localPluginProviders
      ]

      const availableProviderIds = new Set(providers.value.map((provider) => provider.id))
      const normalizedOrder = (nextOrder || []).filter((id) => availableProviderIds.has(id))
      providers.value.forEach((provider) => {
        if (!normalizedOrder.includes(provider.id)) {
          normalizedOrder.push(provider.id)
        }
      })
      providerOrder.value = normalizedOrder
    }

    const moveProvider = (fromId: string, toId: string, after = false) => {
      if (!fromId || !toId || fromId === toId) return
      if (!providerOrder.value.includes(fromId)) providerOrder.value.push(fromId)
      if (!providerOrder.value.includes(toId)) providerOrder.value.push(toId)
      const fromIndex = providerOrder.value.findIndex((id) => id === fromId)
      if (fromIndex === -1) return
      const [providerId] = providerOrder.value.splice(fromIndex, 1)
      if (!providerId) return
      const targetIndex = providerOrder.value.findIndex((id) => id === toId)
      if (targetIndex === -1) {
        providerOrder.value.push(providerId)
        return
      }
      const insertIndex = after ? targetIndex + 1 : targetIndex
      providerOrder.value.splice(insertIndex, 0, providerId)
    }

    const getAllProviders = computed(() => {
      const allProviders = [...providers.value, ...registeredProviders.value] as Provider[]
      const providerMap = new Map(allProviders.map((provider) => [provider.id, provider] as const))
      const orderedProviders: Provider[] = []
      providerOrder.value.forEach((id) => {
        const provider = providerMap.get(id)
        if (provider) {
          orderedProviders.push(provider)
          providerMap.delete(id)
        }
      })
      providerMap.forEach((provider) => orderedProviders.push(provider))
      return orderedProviders
    })

    const createFavoriteModelKey = (providerId: string, modelId: string) => `${providerId}::${modelId}`

    const isFavoriteAgent = (agentId: string) => favoriteAgentIds.value.includes(agentId)

    const toggleFavoriteAgent = (agentId: string) => {
      if (!agentId) return
      if (favoriteAgentIds.value.includes(agentId)) {
        favoriteAgentIds.value = favoriteAgentIds.value.filter((id) => id !== agentId)
      } else {
        favoriteAgentIds.value = [agentId, ...favoriteAgentIds.value]
      }
    }

    const isFavoriteModel = (providerId: string, modelId: string) =>
      favoriteModelKeys.value.includes(createFavoriteModelKey(providerId, modelId))

    const toggleFavoriteModel = (providerId: string, modelId: string) => {
      const key = createFavoriteModelKey(providerId, modelId)
      if (favoriteModelKeys.value.includes(key)) {
        favoriteModelKeys.value = favoriteModelKeys.value.filter((item) => item !== key)
      } else {
        favoriteModelKeys.value = [key, ...favoriteModelKeys.value]
      }
    }

    watch(
      [
        () => providers.value.map((provider) => provider.id),
        () => registeredProviders.value.map((provider) => provider.id)
      ],
      ([providerIds, registeredIds]) => {
        const allIds = new Set([...providerIds, ...registeredIds])
        allIds.forEach((id) => {
          if (!providerOrder.value.includes(id)) {
            providerOrder.value.push(id)
          }
        })
      },
      { immediate: true }
    )

    watch(
      getAllProviders,
      (providersList) => {
        const validModelKeys = new Set<string>()
        providersList.forEach((provider) => {
          provider.models?.forEach((model) => {
            validModelKeys.add(createFavoriteModelKey(provider.id, model.id))
          })
        })
        favoriteModelKeys.value = favoriteModelKeys.value.filter((key) => validModelKeys.has(key))
      },
      { immediate: true, deep: true }
    )

    const selectedProviderId = computed<string>({
      get: () => {
        const chatStore = useChatsStores()
        return chatStore.currentChat?.providerId || ''
      },
      set: (providerId: string) => {
        const chatStore = useChatsStores()
        const chat = chatStore.currentChat
        if (!chat?.id || !providerId) return

        const provider = getAllProviders.value.find((p) => p.id === providerId)
        const currentModelId = chat.modelId
        const currentExists = provider?.models?.some((m) => m.id === currentModelId)
        const nextModelId =
          (currentExists ? currentModelId : undefined) ||
          provider?.models?.find((m) => m.active && m.category === 'text')?.id ||
          provider?.models?.[0]?.id

        if (!nextModelId) return
        chatStore.setChatModel(chat.id, providerId, nextModelId)
      }
    })
    const selectedModelId = computed<string>({
      get: () => {
        const chatStore = useChatsStores()
        return chatStore.currentChat?.modelId || ''
      },
      set: (modelId: string) => {
        const chatStore = useChatsStores()
        const chat = chatStore.currentChat
        const providerId = chat?.providerId
        if (!chat?.id || !providerId || !modelId) return
        chatStore.setChatModel(chat.id, providerId, modelId)
      }
    })
    const currentSelectedProvider = computed(() => {
      return getAllProviders.value.find((p) => p.id === selectedProviderId.value)
    })
    const currentSelectedModel = computed(() => {
      return currentSelectedProvider.value?.models?.find((p) => p.id === selectedModelId.value)
    })

    const getProviderById = (id: string) => {
      return getAllProviders.value.find((p) => p.id === id)
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
      const provider = getAllProviders.value.find(
        (p) => p.id === defaultModels.value.titleGenerationProviderId
      )
      return provider?.models?.find((m) => m.id === defaultModels.value.titleGenerationModelId)
    })

    const getTranslationModel = computed(() => {
      const provider = getAllProviders.value.find(
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

    type ImageGenerationFormData = ImageGenerateOptions & {
      model: { modelId: string; providerId: string }
      prompt: string
      providerOptions?: Record<string, any>
      mediaType?: 'image' | 'video'
    }

    type SpeechGenerationFormData = {
      model: { modelId: string; providerId: string }
      prompt: string
      voice?: string
      speed?: number
      language?: string
      providerOptions?: Record<string, any>
      mediaType?: 'speech'
    }

    const imageGenerationForm = ref<ImageGenerationFormData>()
    const videoGenerationForm = ref<ImageGenerationFormData>()
    const speechGenerationForm = ref<SpeechGenerationFormData>()

    const updateImageGenerationForm = (data: ImageGenerationFormData) => {
      if (data.mediaType === 'video') {
        videoGenerationForm.value = data
      } else {
        imageGenerationForm.value = data
      }
    }

    const updateSpeechGenerationForm = (data: SpeechGenerationFormData) => {
      speechGenerationForm.value = data
    }
    const isAfterRestore = restorePromise

    return {
      isAfterRestore,
      display,
      terminal,
      providers,
      providerOrder,
      favoriteAgentIds,
      favoriteModelKeys,
      mcpServers,
      loadedPlugins,
      devPluginPaths,
      defaultModels,
      thinkingMode,
      speechEnabled,
      providerOptions,
      imageGenerationForm,
      videoGenerationForm,
      speechGenerationForm,
      shortcuts,
      updateImageGenerationForm,
      updateSpeechGenerationForm,
      updateThinkingMode,
      updateSpeechEnabled,
      updateProviderOptions,
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
      getModelByVoice,
      createFavoriteModelKey,
      isFavoriteAgent,
      toggleFavoriteAgent,
      isFavoriteModel,
      toggleFavoriteModel,
      addCustomProvider,
      removeCustomProvider,
      replaceSyncProviders,
      moveProvider,
      updateShortcut,
      resetShortcut,
      resetAllShortcuts,
      getActiveShortcutKey
    }
  },
  {
    persist: {
      storage: indexedDBStorage,
      paths: [
        'display',
        'terminal',
        'providers',
        'providerOrder',
        'favoriteAgentIds',
        'favoriteModelKeys',
        'mcpServers',
        'loadedPlugins',
        'devPluginPaths',
        'defaultModels',
        'thinkingMode',
        'speechEnabled',
        'providerOptions',
        'imageGenerationForm',
        'videoGenerationForm',
        'speechGenerationForm',
        'shortcuts'
      ],
      afterRestore: async () => {
        try {
          const { restorePlugins } = usePlugins()
          await restorePlugins()
        } finally {
          resolveRestore()
        }
      }
    }
  }
)
