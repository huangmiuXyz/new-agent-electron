import { Chat } from '@ai-sdk/vue'
export const useChat = () => {
  const { getChatById, updateMessages } = useChatsStores()
  const { currentSelectedProvider, currentSelectedModel } = storeToRefs(useSettingsStore())
  const { getAgentById, getMcpByAgent } = useAgentStore()

  const sendMessages = async (text: string, chatId: string) => {
    const chats = getChatById(chatId)
    const agent = getAgentById(chats!.agentId!)
    const mcpClient = getMcpByAgent(agent?.id!).mcpServers
    const tools = await window.api.list_tools(JSON.parse(JSON.stringify(mcpClient)))
    const service = chatService()
    const chat = new Chat({
      transport: {
        sendMessages: ({ messages }) => {
          return service.createAgent(
            {
              model: currentSelectedModel.value!.id!,
              apiKey: currentSelectedProvider.value!.apiKey!,
              baseURL: currentSelectedProvider.value!.baseUrl!,
              provider: currentSelectedProvider.value!.name!
            },
            messages,
            { tools }
          )
        },
        reconnectToStream: void 0 as any
      },
      messages: chats?.messages
    })
    chat.sendMessage({ id: nanoid(), role: 'user', parts: [{ type: 'text', text }] })
    watchEffect(() => {
      updateMessages(chatId, chat.messages)
    })
  }
  const regenerate = () => {}
  return {
    sendMessages,
    regenerate
  }
}
