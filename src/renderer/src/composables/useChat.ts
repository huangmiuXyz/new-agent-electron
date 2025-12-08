import { Chat as _useChat } from '@ai-sdk/vue'
import { FileUIPart, TextUIPart } from 'ai'

const messageSrollRef = ref()
export const useMessagesScroll = () => {
  const { arrivedState } = useScroll(messageSrollRef)

  const scrollToBottom = async () => {
    await nextTick()
    requestAnimationFrame(() => {
      if (!messageSrollRef.value) return
      messageSrollRef.value.scrollTo({
        top: messageSrollRef.value.scrollHeight,
        behavior: 'instant'
      })
    })
  }

  return { messageSrollRef, scrollToBottom, arrivedState }
}

export const useChat = (chatId: string) => {
  const scope = effectScope()

  return scope.run(() => {
    const { getChatById, updateMessages } = useChatsStores()
    const { scrollToBottom, arrivedState } = useMessagesScroll()
    const chats = getChatById(chatId)
    const isLastMessage = (messageId: string) => {
      return chats!.messages[chats!.messages.length - 1].id === messageId
    }
    const _update = (loading) => {
      updateMessages(chatId, (oldMessages) => {
        const isBottom = arrivedState.bottom
        const map = new Map(oldMessages.map((m) => [m.id, m]))
        const cid = chat.id
        for (const m of chat.messages) {
          if (m.metadata?.cid && m.metadata.cid === cid) {
            m.metadata.loading = loading
            if (isBottom && isLastMessage(m.id)) scrollToBottom()
            map.set(m.id, m)
          }
        }
        return Array.from(map.values())
      })
    }
    const update = throttle(_update, 150, { edges: ['leading'] })
    const { currentSelectedProvider, currentSelectedModel } = storeToRefs(useSettingsStore())
    const agent = useAgentStore()
    const mcpClient = agent.getMcpByAgent(agent.selectedAgent!.id!).mcpServers
    const service = chatService()
    const { apiKey, baseUrl, id: provider, modelType } = toRefs(currentSelectedProvider.value!)
    const { id: model } = toRefs(currentSelectedModel.value!)
    const chat = new _useChat({
      transport: {
        sendMessages: () => {
          return service.createAgent(
            chat.id,
            {
              model: model.value!,
              apiKey: apiKey!.value!,
              baseURL: baseUrl.value,
              provider: provider.value,
              modelType: modelType.value
            },
            chats!.messages,
            { mcpClient, instructions: agent.selectedAgent?.systemPrompt }
          )
        },
        reconnectToStream: void 0 as any
      },
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

    const sendMessages = async (content: string | Array<FileUIPart | TextUIPart>) => {
      scrollToBottom()

      let parts: Array<FileUIPart | TextUIPart>

      if (typeof content === 'string') {
        parts = [{ type: 'text', text: content }]
      } else {
        parts = content
      }

      chats?.messages.push({
        id: chat.generateId(),
        role: 'user',
        parts,
        metadata: { cid: chat.id } as MetaData
      })
      chat.sendMessage()
    }
    const regenerate = (messageId: string) => {
      const mIndex = chats?.messages.findIndex((m) => m.id === messageId)!
      const message = chats?.messages[mIndex]
      chats!.messages = chats!.messages.slice(0, message?.role === 'user' ? mIndex + 1 : mIndex)
      chat.sendMessage()
    }
    return {
      sendMessages,
      regenerate
    }
  })!
}
