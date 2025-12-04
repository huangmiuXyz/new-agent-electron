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
              provider: currentSelectedProvider.value!.name!,
              modelType: currentSelectedProvider.value!.modelType
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
  const regenerate = (messageId: string, chatId: string) => {
    const chat = getChatById(chatId)
    if (!chat) return

    const msgIndex = chat.messages.findIndex((m) => m.id === messageId)
    if (msgIndex === -1) return

    const message = chat.messages[msgIndex]
    let userMsgToResend: any = null
    let newMessages: any[] = []

    if (message.role === 'assistant') {
      const prevMsg = chat.messages[msgIndex - 1]
      if (prevMsg && prevMsg.role === 'user') {
        userMsgToResend = prevMsg
        newMessages = chat.messages.slice(0, msgIndex - 1)
      }
    } else if (message.role === 'user') {
      userMsgToResend = message
      newMessages = chat.messages.slice(0, msgIndex)
    }

    if (userMsgToResend) {
      const textPart = userMsgToResend.parts.find((p) => p.type === 'text')
      if (textPart && textPart.text) {
        updateMessages(chatId, newMessages)
        sendMessages(textPart.text, chatId)
      }
    }
  }
  return {
    sendMessages,
    regenerate
  }
}
