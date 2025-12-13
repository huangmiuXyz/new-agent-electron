import data from '@renderer/assets/data/provider.json'

export const useSettingsStore = defineStore(
  'settings',
  () => {
    // 显示设置
    const display = ref({
      darkMode: false,
      compactDensity: true,
      showTimestamps: true,
      fontSize: 13,
      sidebarCollapsed: false
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

    // 默认模型设置
    const defaultModels = ref({
      titleGenerationModelId: '',
      titleGenerationProviderId: '',
      translationModelId: '',
      translationProviderId: ''
    })

    // 知识库设置
    const knowledgeBases = ref<KnowledgeBase[]>([
      {
        id: 'default-local',
        name: '本地知识库',
        description: '本地文件系统中的知识库',
        type: 'local',
        path: '',
        embeddingModel: 'text-embedding-ada-002',
        chunkSize: 1000,
        chunkOverlap: 200,
        active: true,
        created: +new Date(),
        documents: []
      },
      {
        id: 'default-remote',
        name: '远程知识库',
        description: '远程API访问的知识库',
        type: 'remote',
        url: '',
        embeddingModel: 'text-embedding-ada-002',
        chunkSize: 1000,
        chunkOverlap: 200,
        active: false,
        created: +new Date(),
        documents: []
      }
    ])

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

    // 获取默认模型信息
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

    // 知识库相关方法
    const updateKnowledgeBase = (knowledgeBaseId: string, knowledgeBaseData: KnowledgeBase) => {
      const index = knowledgeBases.value.findIndex((kb) => kb.id === knowledgeBaseId)
      if (index !== -1) {
        const currentKnowledgeBase = knowledgeBases.value[index]
        if (currentKnowledgeBase) {
          knowledgeBases.value[index] = {
            ...knowledgeBaseData,
            id: currentKnowledgeBase.id,
            created: currentKnowledgeBase.created
          }
        }
      }
    }

    const addKnowledgeBase = (knowledgeBase: KnowledgeBase) => {
      knowledgeBases.value.push(knowledgeBase)
    }

    const deleteKnowledgeBase = (knowledgeBaseId: string) => {
      const index = knowledgeBases.value.findIndex((kb) => kb.id === knowledgeBaseId)
      if (index !== -1) {
        knowledgeBases.value.splice(index, 1)
      }
    }

    const addDocumentToKnowledgeBase = (knowledgeBaseId: string, document: KnowledgeDocument) => {
      const index = knowledgeBases.value.findIndex((kb) => kb.id === knowledgeBaseId)
      if (index !== -1) {
        const knowledgeBase = knowledgeBases.value[index]
        if (knowledgeBase) {
          if (!knowledgeBase.documents) {
            knowledgeBase.documents = []
          }
          knowledgeBase.documents.push(document)
        }
      }
    }

    const deleteDocumentFromKnowledgeBase = (knowledgeBaseId: string, documentId: string) => {
      const index = knowledgeBases.value.findIndex((kb) => kb.id === knowledgeBaseId)
      if (index !== -1) {
        const knowledgeBase = knowledgeBases.value[index]
        if (knowledgeBase && knowledgeBase.documents) {
          const docIndex = knowledgeBase.documents.findIndex((doc) => doc.id === documentId)
          if (docIndex !== -1) {
            knowledgeBase.documents.splice(docIndex, 1)
          }
        }
      }
    }

    return {
      display,
      providers,
      mcpServers,
      defaultModels,
      knowledgeBases,
      updateDisplaySettings,
      updateProvider,
      addModelToProvider,
      deleteModelFromProvider,
      updateDefaultModels,
      updateKnowledgeBase,
      addKnowledgeBase,
      deleteKnowledgeBase,
      addDocumentToKnowledgeBase,
      deleteDocumentFromKnowledgeBase,
      selectedModelId,
      selectedProviderId,
      currentSelectedProvider,
      currentSelectedModel,
      getProviderById,
      getModelById,
      getTitleGenerationModel,
      getTranslationModel,
      getValidTools
    }
  },
  {
    persist: true
  }
)
