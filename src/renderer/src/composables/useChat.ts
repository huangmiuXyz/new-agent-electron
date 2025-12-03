import { Chat } from '@ai-sdk/vue'
export const useChat = () => {
  const { getChatById, updateMessages } = useChatsStores()

  const sendMessages = async (text: string, chatId: string) => {
    const chats = getChatById(chatId)
    const { currentSelectedProvider, currentSelectedModel } = useSettingsStore()
    const service = chatService()
    const chat = new Chat({
      transport: {
        sendMessages: ({ messages }) => {
          return service.createAgent(
            {
              model: currentSelectedModel!.id!,
              apiKey: currentSelectedProvider?.apiKey!,
              baseURL: currentSelectedProvider?.baseUrl!,
              provider: currentSelectedProvider?.name!
            },
            messages
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
