import { Chat as _useChat } from '@ai-sdk/vue'
import { FileUIPart, TextUIPart } from 'ai'
const messageScrollRef = ref()
const waitForContentStable = (el: HTMLElement) => {
  return new Promise<void>((resolve) => {
    const imgs = el.querySelectorAll('img')
    const pending = Array.from(imgs).filter((i) => !i.complete)

    if (pending.length === 0) {
      requestAnimationFrame(() => resolve())
      return
    }

    let remain = pending.length
    const check = () => {
      remain--
      if (remain === 0) {
        requestAnimationFrame(() => resolve())
      }
    }

    pending.forEach((img) => {
      img.onload = check
      img.onerror = check
    })
  })
}

export const useMessagesScroll = () => {
  const isAtBottom = () => {
    const el = messageScrollRef.value
    if (!el) return true
    const threshold = 30
    return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold
  }

  const scrollToBottom = async () => {
    const el = messageScrollRef.value
    if (!el) return

    await nextTick()
    await waitForContentStable(el)

    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
    })
  }

  return { messageScrollRef, isAtBottom, scrollToBottom }
}

export const useChat = (chatId: string) => {
  const { getChatById, updateMessages } = useChatsStores()
  const chats = getChatById(chatId)

  const { scrollToBottom, isAtBottom } = useMessagesScroll()

  const isLastMessage = (messageId: string) => {
    return chats!.messages[chats!.messages.length - 1].id === messageId
  }
  const { currentSelectedProvider, currentSelectedModel, thinkingMode } =
    storeToRefs(useSettingsStore())
  const agent = useAgentStore()
  const mcpClient = agent.getMcpByAgent(agent.selectedAgent!.id!).mcpServers
  const service = chatService()
  const mcpTools = agent.selectedAgent!.tools! || []
  const builtinTools = agent.selectedAgent!.builtinTools! || []
  const { apiKey, baseUrl, id: provider, providerType } = toRefs(currentSelectedProvider.value!)
  const { id: model } = toRefs(currentSelectedModel.value!)
  const createChat = (messages: BaseMessage[]): _useChat<BaseMessage> => {
    const scope = effectScope()

    return scope.run(() => {
      const chat = new _useChat<BaseMessage>({
        messages,
        transport: {
          sendMessages: ({ messages }) => {
            return service.createAgent(
              chat.id,
              {
                model: model.value!,
                apiKey: apiKey!.value!,
                baseURL: baseUrl.value,
                provider: provider.value,
                providerType: providerType.value
              },
              messages,
              {
                mcpClient,
                instructions: agent.selectedAgent?.systemPrompt,
                mcpTools,
                builtinTools,
                knowledgeBaseIds: agent.selectedAgent?.knowledgeBaseIds,
                thinkingMode: thinkingMode.value
              }
            )
          },
          reconnectToStream: undefined as any
        },
        onFinish: () => {
          useTitle(chatId).generateTitle()
          scope.stop()
        },
        onError: (error) => {
          update(error)
        }
      })

      const _update = (error?: Error) => {
        const userWasAtBottom = isAtBottom()
        updateMessages(chatId, (oldMessages) => {
          const lastMessage = oldMessages.find((m) => m.id === chat.lastMessage!.id)
          if (lastMessage) {
            lastMessage.metadata!.error = error
          }
          if (userWasAtBottom && isLastMessage(chat.lastMessage.id)) {
            nextTick(() => scrollToBottom())
          }
          return oldMessages
        })
      }

      const update = throttle(_update, 150, { edges: ['leading', 'trailing'] })
      watch(
        () => chat.messages,
        () => {
          update()
        },
        { deep: true }
      )
      return chat!
    })!
  }

  const sendMessages = async (content: string | Array<FileUIPart | TextUIPart>) => {
    scrollToBottom()
    const chat = createChat(chats?.messages!)
    let parts: Array<FileUIPart | TextUIPart> =
      typeof content === 'string' ? [{ type: 'text', text: content }] : content

    chats!.messages.push({
      id: chat.generateId(),
      role: 'user',
      parts,
      metadata: { cid: chat.id } as MetaData
    })
    chats!.messages.push({
      id: chat.generateId(),
      role: 'assistant',
      parts: [],
      metadata: { cid: chat.id } as MetaData
    })
    chat.sendMessage()
  }

  const regenerate = (messageId: string) => {
    const index = chats?.messages.findIndex((m) => m.id === messageId)!
    if (index === -1) return

    let targetIndex = index
    const message = chats!.messages[index]

    if (message.role === 'user') {
      const nextMessage = chats!.messages[index + 1]
      if (nextMessage && nextMessage.role === 'assistant') {
        targetIndex = index + 1
      } else {
        const newAssistantMessage = {
          id: nanoid(),
          role: 'assistant' as const,
          parts: []
        }
        chats!.messages.splice(index + 1, 0, newAssistantMessage)
        targetIndex = index + 1
      }
    }

    const messages = chats?.messages.slice(0, targetIndex)!
    const assistantMessage = {
      id: nanoid(),
      role: 'assistant' as const,
      parts: [],
      metadata: { cid: nanoid() } as MetaData
    }
    chats!.messages[targetIndex] = assistantMessage
    messages.push(assistantMessage)
    const chat = createChat(messages)
    scrollToBottom()
    chat.sendMessage()
  }

  return {
    sendMessages,
    regenerate
  }
}
