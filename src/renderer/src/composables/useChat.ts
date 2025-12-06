import { Chat as _useChat } from '@ai-sdk/vue'
export const useChat = (chatId: string) => {
  const scope = effectScope()

  return scope.run(() => {
    const { getChatById, updateMessages } = useChatsStores()
    const update = (loading) => {
      updateMessages(chatId, (oldMessages) => {
        const map = new Map(oldMessages.map((m) => [m.id, m]))
        const cid = chat.id
        for (const m of chat.messages) {
          if (m.metadata?.cid && m.metadata.cid === cid) {
            m.metadata.loading = loading
            map.set(m.id, m)
          }
        }
        return Array.from(map.values())
      })
    }
    const { currentSelectedProvider, currentSelectedModel } = storeToRefs(useSettingsStore())
    const agent = useAgentStore()
    const chats = getChatById(chatId)
    const mcpClient = agent.getMcpByAgent(agent.selectedAgent!.id!).mcpServers
    const service = chatService()
    const { apiKey, baseUrl, id: provider, modelType } = toRefs(currentSelectedProvider.value!)
    const { id: model } = toRefs(currentSelectedModel.value!)
    const chat = new _useChat({
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
            { mcpClient, instructions: agent.selectedAgent?.systemPrompt }
          )
        },
        reconnectToStream: void 0 as any
      },
      messages: chats?.messages,
      onFinish: () => {
        update(false)
        scope.stop()
      }
    })
    watch(
      () => chat.messages,
      () => {
        update(true)
      },
      { deep: true }
    )

    const sendMessages = async (text: string) => {
      chat.sendMessage({
        id: chat.generateId(),
        role: 'user',
        parts: [{ type: 'text', text }],
        metadata: { cid: chat.id }
      })
    }
    const regenerate = (messageId: string) => {
      const mIndex = chats?.messages.findIndex((m) => m.id === messageId)!
      const message = chats?.messages[mIndex]
      chats!.messages = chats!.messages.slice(0, message?.role === 'user' ? mIndex + 1 : mIndex)
      chat.messages = chats?.messages
      chat.sendMessage()
    }
    return {
      sendMessages,
      regenerate
    }
  })!
}
