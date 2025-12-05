import { Chat } from '@ai-sdk/vue'
export const useChat = (chatId: string) => {
  const scope = effectScope()

  return scope.run(() => {
    const { getChatById, updateMessages } = useChatsStores()
    const { currentSelectedProvider, currentSelectedModel } = storeToRefs(useSettingsStore())
    const { getAgentById, getMcpByAgent } = useAgentStore()
    const chats = getChatById(chatId)
    const agent = getAgentById(chats!.agentId!)
    const mcpClient = getMcpByAgent(agent?.id!).mcpServers
    const service = chatService()
    const { apiKey, baseUrl, id: provider, modelType } = toRefs(currentSelectedProvider.value!)
    const { id: model } = toRefs(currentSelectedModel.value!)
    const chat = new Chat({
      transport: {
        sendMessages: ({ messages }) => {
          return service.createAgent(
            chat.id,
            {
              model: model.value!,
              apiKey: apiKey!.value!,
              baseURL: baseUrl.value,
              provider: provider.value,
              modelType: modelType.value
            },
            messages,
            { mcpClient, instructions: agent?.systemPrompt }
          )
        },
        reconnectToStream: void 0 as any
      },
      messages: chats?.messages,
      onFinish: () => {
        scope.stop()
      }
    })
    watchEffect(() => {
      updateMessages(chatId, chat.messages)
    })
    const sendMessages = async (text: string) => {
      chat.sendMessage({
        id: chat.generateId(),
        role: 'user',
        parts: [{ type: 'text', text }],
        metadata: { id: chat.id }
      })
    }
    const regenerate = (messageId: string) => {
      chat.regenerate({ messageId })
    }
    return {
      sendMessages,
      regenerate
    }
  })
}
