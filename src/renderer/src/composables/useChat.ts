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
  const scope = effectScope()

  return scope.run(() => {
    const { getChatById, updateMessages } = useChatsStores()
    const chats = getChatById(chatId)

    const isLastMessage = (messageId: string) => {
      return chats!.messages[chats!.messages.length - 1].id === messageId
    }

    const { scrollToBottom, isAtBottom } = useMessagesScroll()

    const _update = (loading: boolean) => {
      const userWasAtBottom = isAtBottom()

      updateMessages(chatId, (oldMessages) => {
        const map = new Map(oldMessages.map((m) => [m.id, m]))
        const cid = chat.id

        for (const m of chat.messages) {
          if (m.metadata?.cid === cid) {
            m.metadata.loading = loading
            if (userWasAtBottom && isLastMessage(m.id)) {
              nextTick(() => scrollToBottom())
            }
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
        reconnectToStream: undefined as any
      },
      onFinish: () => {
        update(false)
        useTitle(chatId).generateTitle()
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

      let parts: Array<FileUIPart | TextUIPart> =
        typeof content === 'string' ? [{ type: 'text', text: content }] : content

      chats!.messages.push({
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
      if (isLastMessage(messageId)) {
        scrollToBottom()
      }
      const deleMessages = chats!.messages.splice(message?.role === 'user' ? mIndex + 1 : mIndex)
      deleMessages.forEach((m) => {
        m.metadata?.stop?.()
      })
      chat.sendMessage()
    }

    return {
      sendMessages,
      regenerate
    }
  })!
}
