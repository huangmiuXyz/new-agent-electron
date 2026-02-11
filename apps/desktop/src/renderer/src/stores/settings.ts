import data from '@renderer/assets/data/provider.json'
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
      }
    }

    const removeCustomProvider = (providerId: string) => {
      const index = providers.value.findIndex((p) => p.id === providerId)
      if (index > -1) {
        providers.value.splice(index, 1)
      }
    }

    const getAllProviders = computed(() => {
      return [...providers.value, ...registeredProviders.value] as Provider[]
    })

    const selectedModelId = ref<string>('deepseek-chat')
    const selectedProviderId = ref<string>('深度探索')
    const currentSelectedProvider = computed(() => {
      return providers.value.find((p) => p.id === selectedProviderId.value)
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

    type ImageGenerationFormData = ImageGenerateOptions & {
      model: { modelId: string; providerId: string }
      prompt: string
      providerOptions?: Record<string, any>
      mediaType?: 'image' | 'video'
    }

    const imageGenerationForm = ref<ImageGenerationFormData>()
    const videoGenerationForm = ref<ImageGenerationFormData>()

    const updateImageGenerationForm = (data: ImageGenerationFormData) => {
      if (data.mediaType === 'video') {
        videoGenerationForm.value = data
      } else {
        imageGenerationForm.value = data
      }
    }
    const isAfterRestore = restorePromise

    return {
      isAfterRestore,
      display,
      terminal,
      providers,
      mcpServers,
      loadedPlugins,
      devPluginPaths,
      defaultModels,
      thinkingMode,
      speechEnabled,
      providerOptions,
      imageGenerationForm,
      videoGenerationForm,
      shortcuts,
      updateImageGenerationForm,
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
      addCustomProvider,
      removeCustomProvider,
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
        'mcpServers',
        'loadedPlugins',
        'devPluginPaths',
        'defaultModels',
        'thinkingMode',
        'speechEnabled',
        'providerOptions',
        'selectedModelId',
        'selectedProviderId',
        'imageGenerationForm',
        'videoGenerationForm',
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
