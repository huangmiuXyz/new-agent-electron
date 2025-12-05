import { Chat as _useChat } from '@ai-sdk/vue'
export const useChat = (chats: Chat) => {
  const scope = effectScope()

  return scope.run(() => {
    const { updateMessages } = useChatsStores()
    const { currentSelectedProvider, currentSelectedModel } = storeToRefs(useSettingsStore())
    const agent = useAgentStore()
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
        scope.stop()
      }
    })
    watch(
      () => chat.messages,
      () => {
        updateMessages(chats.id, (oldMessages) => {
          const map = new Map(oldMessages.map((m) => [m.id, m]))
          const cid = chat.id
          for (const m of chat.messages) {
            if (m.metadata?.cid && m.metadata.cid === cid) {
              m.metadata.loading = chat.status === 'submitted' || chat.status === 'streaming'
              map.set(m.id, m)
            }
          }
          return Array.from(map.values())
        })
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
      chat.regenerate({ messageId })
    }
    return {
      sendMessages,
      regenerate
    }
  })!
}
