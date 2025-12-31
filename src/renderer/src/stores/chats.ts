export const useChatsStores = defineStore(
  'chats',
  () => {
    const chats = ref<Chat[]>([])
    const tempChats = ref<Chat[]>([]) 
    const activeChatId = ref<string | null>(null)
    const titleGeneratingChats = ref<Set<string>>(new Set())

    const allChats = computed(() => {
      return [...chats.value, ...tempChats.value]
    })

    const currentChat = computed(() => {
      return allChats.value.find((c) => c.id === activeChatId.value) || null
    })

    const isTitleGenerating = (chatId: string) => {
      return titleGeneratingChats.value.has(chatId)
    }

    const createChat = (title = '新的聊天', options?: { isTemp?: boolean }) => {
      const agentStore = useAgentStore()
      const id = nanoid()
      const chat: Chat = {
        id,
        title,
        messages: [],
        createdAt: Date.now(),
        agentId: agentStore.selectedAgentId || 'default',
        isTemp: options?.isTemp
      }

      if (options?.isTemp) {
        tempChats.value.push(chat)
      } else {
        chats.value.push(chat)
      }

      activeChatId.value = id
      return id
    }
    const getChatById = (id: string) => {
      return allChats.value.find((c) => c.id === id)
    }
    const deleteChat = (id: string) => {
      
      const initialLength = chats.value.length
      chats.value = chats.value.filter((c) => {
        if (c.id === id) {
          c.messages.forEach((m) => {
            m.metadata?.stop?.()
          })
        }
        return c.id !== id
      })

      
      if (chats.value.length === initialLength) {
        tempChats.value = tempChats.value.filter((c) => {
          if (c.id === id) {
            c.messages.forEach((m) => {
              m.metadata?.stop?.()
            })
          }
          return c.id !== id
        })
      }

      if (activeChatId.value === id) {
        activeChatId.value = allChats.value[0]?.id || null
      }
    }
    
    
    

    
    
    const addMessageToChat = (msg: BaseMessage) => {
      currentChat.value!.messages.push(msg)
      return msg.id
    }
    const deleteMessage = (cid: string, mid: string) => {
      const chat = getChatById(cid)!
      chat.messages = chat?.messages.filter((m) => m.id !== mid)
    }

    const renameChat = (id: string, title: string) => {
      const chat = getChatById(id)
      if (chat) chat.title = title
    }

    const setTitleGenerating = (id: string, generating: boolean) => {
      if (generating) {
        titleGeneratingChats.value.add(id)
      } else {
        titleGeneratingChats.value.delete(id)
      }
    }

    const setActiveChat = (id: string) => {
      activeChatId.value = id
    }

    const updateMessage = (cid: string, mid: string, newParts: ContentBlock[]) => {
      const chat = getChatById(cid)
      if (!chat) return
      const msg = chat.messages.find((m) => m.id === mid)
      if (msg) {
        msg.parts = newParts
      }
    }
    const updateMessageMetadata = (cid: string, mid: string, newMetadata: MetaData) => {
      const chat = getChatById(cid)
      if (!chat) return
      const msg = chat.messages.find((m) => m.id === mid)
      if (msg) {
        msg.metadata = newMetadata
      }
    }
    const updateMessages = (
      chatId: string,
      messages: BaseMessage[] | ((messages: BaseMessage[]) => BaseMessage[])
    ) => {
      const chat = getChatById(chatId)
      if (chat) {
        chat.messages = typeof messages === 'function' ? messages(chat.messages) : messages
      }
    }

    const forkChat = (sourceChatId: string, messageId: string) => {
      const sourceChat = getChatById(sourceChatId)
      if (!sourceChat) return

      const mIndex = sourceChat.messages.findIndex((m) => m.id === messageId)
      if (mIndex === -1) return

      const messagesToKeep = sourceChat.messages.slice(0, mIndex + 1)
      const clonedMessages = cloneDeep(messagesToKeep)

      const newChatId = createChat(`${sourceChat.title}`)
      const newChat = getChatById(newChatId)
      if (newChat) {
        newChat.messages = clonedMessages
      }
      return newChatId
    }

    return {
      forkChat,
      updateMessages,
      chats,
      tempChats,
      allChats,
      activeChatId,
      currentChat,
      createChat,
      deleteChat,
      renameChat,
      setActiveChat,
      addMessageToChat,
      getChatById,
      deleteMessage,
      updateMessage,
      updateMessageMetadata,
      isTitleGenerating,
      setTitleGenerating
    }
  },
  {
    persist: {
      storage: indexedDBStorage,
      paths: ['chats', 'activeChatId'] 
    }
  }
)
