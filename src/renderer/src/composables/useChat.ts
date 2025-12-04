import { Chat } from '@ai-sdk/vue'
export const useChat = () => {
  const { getChatById, updateMessages } = useChatsStores()
  const { currentSelectedProvider, currentSelectedModel } = storeToRefs(useSettingsStore())
  const { getAgentById, getMcpByAgent } = useAgentStore()

  const sendMessages = async (
    content: string | Array<{ type: string; text?: string; image?: Uint8Array }>,
    chatId: string
  ) => {
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

    // 处理消息内容
    let parts: Array<{ type: string; text?: string; image?: Uint8Array }>

    if (typeof content === 'string') {
      // 兼容旧版本，纯文本消息
      parts = [{ type: 'text', text: content }]
    } else {
      // 新版本，支持图片和文本混合消息
      parts = content
    }

    chat.sendMessage({ id: nanoid(), role: 'user', parts })
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
      const imageParts = userMsgToResend.parts.filter((p) => p.type === 'image')

      // 重构消息内容，包含文本和图片
      const contentParts: Array<{ type: string; text?: string; image?: Uint8Array }> = []

      if (textPart && textPart.text) {
        contentParts.push({ type: 'text', text: textPart.text })
      }

      // 添加图片部分（如果有）
      imageParts.forEach((imgPart) => {
        if (imgPart.image) {
          contentParts.push({ type: 'image', image: imgPart.image })
        }
      })

      if (contentParts.length > 0) {
        updateMessages(chatId, newMessages)
        sendMessages(contentParts, chatId)
      }
    }
  }
  return {
    sendMessages,
    regenerate
  }
}
