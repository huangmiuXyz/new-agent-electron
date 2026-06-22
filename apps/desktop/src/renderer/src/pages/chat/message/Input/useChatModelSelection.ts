import { computed } from 'vue'
import { useAgentStore } from '@renderer/stores/agent'
import { useChatsStores } from '@renderer/stores/chats'
import { useSettingsStore } from '@renderer/stores/settings'

export const useChatModelSelection = () => {
  const chatStore = useChatsStores()
  const agentStore = useAgentStore()
  const settingsStore = useSettingsStore()

  const currentChatAgent = computed(() => {
    const agentId = chatStore.currentChat?.agentId
    return agentId ? agentStore.getAgentById(agentId) : null
  })

  const chatProviderId = computed({
    get: () => chatStore.currentChat?.providerId || '',
    set: (value: string) => {
      if (!value) return
      if (value === chatStore.currentChat?.providerId) return
      let chatId = chatStore.currentChat?.id
      if (!chatId) chatId = chatStore.createChat()
      const chat = chatStore.getChatById(chatId)
      const provider = settingsStore.getProviderById(value)
      const currentModelId = chat?.modelId
      const modelExists = !!provider?.models?.some((model) => model.id === currentModelId)
      const fallbackModelId =
        provider?.models?.find((model) => model.active && model.category === 'text')?.id ||
        provider?.models?.[0]?.id ||
        ''
      const modelId = modelExists ? currentModelId! : fallbackModelId
      if (!modelId) return
      chatStore.setChatModel(chatId, value, modelId)
    }
  })

  const chatModelId = computed({
    get: () => chatStore.currentChat?.modelId || '',
    set: (value: string) => {
      if (!value) return
      let chatId = chatStore.currentChat?.id
      if (!chatId) chatId = chatStore.createChat()
      let providerId = chatStore.currentChat?.providerId
      const hasModel = providerId
        ? settingsStore.getProviderById(providerId)?.models?.some((model) => model.id === value)
        : false
      if (!hasModel) {
        providerId = settingsStore.getAllProviders.find((provider) =>
          provider.models?.some((model) => model.id === value)
        )?.id
      }
      if (!providerId) return
      chatStore.setChatModel(chatId, providerId, value)
    }
  })

  const currentChatProvider = computed(() => {
    return chatProviderId.value ? settingsStore.getProviderById(chatProviderId.value) : null
  })

  const currentChatModel = computed(() => {
    if (!chatProviderId.value || !chatModelId.value) return null
    return settingsStore.getModelById(chatProviderId.value, chatModelId.value).model
  })

  return {
    currentChatAgent,
    chatProviderId,
    chatModelId,
    currentChatProvider,
    currentChatModel
  }
}
