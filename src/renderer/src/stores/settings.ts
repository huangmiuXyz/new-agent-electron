import data from '@renderer/assets/data/provider.json'

export const useSettingsStore = defineStore(
  'settings',
  () => {
    // 显示设置
    const display = ref({
      darkMode: false,
      compactDensity: true,
      showTimestamps: true,
      fontSize: 13
    })

    const providers = ref<Provider[]>(
      data.map((p) => ({
        ...p,
        modelType: p.modelType as Provider['modelType'],
        apiKey: '',
        models: []
      }))
    )

    const mcpServers = ref<ClientConfig>({})

    const updateDisplaySettings = (settings: Partial<typeof display.value>) => {
      display.value = { ...display.value, ...settings }
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
          provider.models.push(model)
        }
      }
    }

    const selectedModelId = ref<string>('deepseek-chat')
    const selectedProviderId = ref<string>('深度探索')
    const currentSelectedProvider = computed(() => {
      return providers.value.find((p) => p.id === selectedProviderId.value)
    })
    const currentSelectedModel = computed(() => {
      return currentSelectedProvider.value?.models.find((p) => p.id === selectedModelId.value)
    })
    const getProviderById = (id: string) => {
      return providers.value.find((p) => p.id === id)
    }
    const getModelById = (pid: string, mid: string) => {
      const provider = getProviderById(pid)!
      return { model: provider?.models.find((m) => m.id === mid)!, provider }
    }
    return {
      display,
      providers,
      mcpServers,
      updateDisplaySettings,
      updateProvider,
      addModelToProvider,
      selectedModelId,
      selectedProviderId,
      currentSelectedProvider,
      currentSelectedModel,
      getProviderById,
      getModelById
    }
  },
  {
    persist: true
  }
)
