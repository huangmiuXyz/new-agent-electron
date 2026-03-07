import { FileUIPart, TextUIPart } from "ai"

let resolveRestore: () => void
const restorePromise = new Promise<void>((resolve) => {
  resolveRestore = resolve
})

export const useChatsStores = defineStore(
  'chats',
  () => {
    const chats = ref<Chat[]>([])
    const tempChats = ref<Chat[]>([])
    const activeChatId = ref<string | null>(null)
    const titleGeneratingChats = ref<Set<string>>(new Set())
    const isAfterRestore = restorePromise

    const allChats = computed(() => {
      return [...chats.value, ...tempChats.value]
    })

    const currentChat = computed(() => {
      return allChats.value.find((c) => c.id === activeChatId.value) || null
    })

    const isTitleGenerating = (chatId: string) => {
      return titleGeneratingChats.value.has(chatId)
    }

    const createChat = (
      title = '新的聊天',
      options?: {
        isTemp?: boolean
        activate?: boolean
        agentId?: string
        parentChatId?: string
        subTask?: SubTaskInfo
      }
    ) => {
      const settingsStore = useSettingsStore()
      const selectedProviderId = settingsStore.selectedProviderId
      const selectedModelId = settingsStore.selectedModelId
      const selectedProvider = settingsStore.getProviderById(selectedProviderId)
      const selectedProviderHasModel = !!selectedProvider?.models?.some((m) => m.id === selectedModelId)
      const fallbackProvider = settingsStore.getAllProviders.find(
        (p) => p.models?.some((m) => m.active && m.category === 'text')
      )
      const fallbackModel = fallbackProvider?.models?.find((m) => m.active && m.category === 'text')
      const providerId = selectedProviderHasModel ? selectedProviderId : fallbackProvider?.id || ''
      const modelId = selectedProviderHasModel ? selectedModelId : fallbackModel?.id || ''

      const id = nanoid()
      const chat: Chat = {
        id,
        title,
        messages: [],
        createdAt: Date.now(),
        agentId: options?.agentId || 'default',
        providerId,
        modelId,
        isTemp: options?.isTemp,
        pendingMessages: [],
        parentChatId: options?.parentChatId,
        subTask: options?.subTask
      }

      if (options?.isTemp) {
        tempChats.value.push(chat)
      } else {
        chats.value.push(chat)
      }

      if (options?.activate !== false) {
        activeChatId.value = id
      }
      return id
    }
    const getChatById = (id: string) => {
      return allChats.value.find((c) => c.id === id)
    }
    const getDescendantChatIds = (id: string): string[] => {
      const descendants: string[] = []
      const queue = [id]
      while (queue.length > 0) {
        const currentId = queue.shift()!
        allChats.value
          .filter((chat) => chat.parentChatId === currentId)
          .forEach((child) => {
            descendants.push(child.id)
            queue.push(child.id)
          })
      }
      return descendants
    }

    const deleteChat = (id: string) => {
      const allIds = new Set([id, ...getDescendantChatIds(id)])

      const initialLength = chats.value.length
      chats.value = chats.value.filter((c) => {
        if (allIds.has(c.id)) {
          c.messages.forEach((m) => {
            m.metadata?.stop?.()
          })
        }
        return !allIds.has(c.id)
      })


      if (chats.value.length === initialLength) {
        tempChats.value = tempChats.value.filter((c) => {
          if (allIds.has(c.id)) {
            c.messages.forEach((m) => {
              m.metadata?.stop?.()
            })
          }
          return !allIds.has(c.id)
        })
      }

      if (activeChatId.value && allIds.has(activeChatId.value)) {
        const fallbackId = allChats.value[0]?.id || null
        if (fallbackId) {
          setActiveChat(fallbackId)
        } else {
          activeChatId.value = null
        }
      }
    }







    const addMessageToChat = (msg: BaseMessage) => {
      currentChat.value!.messages.push(msg)
      return msg.id
    }
    const deleteMessage = (cid: string, mid: string) => {
      const chat = getChatById(cid)!
      chat.messages.find((m) => m.id === mid)?.metadata?.stop?.()
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

    const setChatAgent = (chatId: string, agentId: string) => {
      const chat = getChatById(chatId)
      if (!chat) return
      chat.agentId = agentId

      // 如果智能体有默认模型配置，且当前聊天没有设置模型，则自动切换到默认模型
      const agentStore = useAgentStore()
      const agent = agentStore.getAgentById(agentId)
      if (agent?.defaultModel?.providerId && agent?.defaultModel?.modelId) {
        // 检查当前模型是否为空或未设置
        const settingsStore = useSettingsStore()
        const currentProvider = settingsStore.getProviderById(chat.providerId!)
        const hasValidModel = currentProvider?.models?.some((m) => m.id === chat.modelId)

        if (!hasValidModel) {
          chat.providerId = agent.defaultModel.providerId
          chat.modelId = agent.defaultModel.modelId
        }
      }
    }

    const setChatModel = (chatId: string, providerId: string, modelId: string) => {
      const chat = getChatById(chatId)
      if (!chat) return
      chat.providerId = providerId
      chat.modelId = modelId
    }

    const getChildChats = (parentChatId: string) => {
      return allChats.value
        .filter((chat) => chat.parentChatId === parentChatId)
        .sort((a, b) => a.createdAt - b.createdAt)
    }

    const getRootChats = () => {
      return allChats.value
        .filter((chat) => !chat.parentChatId)
        .sort((a, b) => b.createdAt - a.createdAt)
    }

    const createSubChat = (options: {
      parentChatId: string
      task: string
      agentId: string
      title?: string
      activate?: boolean
      isTemp?: boolean
    }) => {
      const taskId = nanoid()
      const now = Date.now()
      const chatId = createChat(options.title || `子任务: ${options.task.slice(0, 20)}`, {
        isTemp: options.isTemp,
        activate: options.activate,
        agentId: options.agentId,
        parentChatId: options.parentChatId,
        subTask: {
          id: taskId,
          task: options.task,
          status: 'running',
          assignedByChatId: options.parentChatId,
          assignedToAgentId: options.agentId,
          assignedAt: now,
          startedAt: now
        }
      })
      return { chatId, taskId }
    }

    const updateSubTask = (
      chatId: string,
      updater: Partial<SubTaskInfo> | ((task: SubTaskInfo) => SubTaskInfo)
    ) => {
      const chat = getChatById(chatId)
      if (!chat?.subTask) return
      chat.subTask =
        typeof updater === 'function' ? updater(chat.subTask) : { ...chat.subTask, ...updater }
    }

    const updateMessage = (cid: string, mid: string, newParts: any[]) => {
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

    // 预发送队列相关方法
    const getPendingMessages = (chatId: string): PendingMessage[] => {
      const chat = getChatById(chatId)
      return chat?.pendingMessages || []
    }

    const addPendingMessage = (
      chatId: string,
      parts: Array<FileUIPart | TextUIPart>
    ): string => {
      const chat = getChatById(chatId)
      if (!chat) return ''

      if (!chat.pendingMessages) {
        chat.pendingMessages = []
      }

      const id = nanoid()
      chat.pendingMessages.push({
        id,
        parts,
        timestamp: Date.now()
      })
      return id
    }

    const removePendingMessage = (chatId: string, messageId: string) => {
      const chat = getChatById(chatId)
      if (!chat || !chat.pendingMessages) return

      chat.pendingMessages = chat.pendingMessages.filter(m => m.id !== messageId)
    }

    const clearPendingMessages = (chatId: string) => {
      const chat = getChatById(chatId)
      if (!chat) return
      chat.pendingMessages = []
    }

    const shiftPendingMessage = (chatId: string): PendingMessage | undefined => {
      const chat = getChatById(chatId)
      if (!chat || !chat.pendingMessages || chat.pendingMessages.length === 0) return undefined

      const message = chat.pendingMessages.shift()
      return message
    }

    // 检查聊天是否正在生成回复
    const isChatGenerating = (chatId: string): boolean => {
      const chat = getChatById(chatId)
      if (!chat) return false
      return chat.messages.some(m => m.metadata?.loading && m.metadata.stop)
    }

    const isChatScopeGenerating = (chatId: string): boolean => {
      const allIds = [chatId, ...getDescendantChatIds(chatId)]
      return allIds.some(id => isChatGenerating(id))
    }

    const stopGeneratingInChatScope = (chatId: string) => {
      const allIds = [chatId, ...getDescendantChatIds(chatId)]
      allIds.forEach((id) => {
        const chat = getChatById(id)
        if (!chat) return
        chat.messages.forEach((m) => {
          if (m.metadata?.loading && m.metadata?.stop) {
            m.metadata.stop()
          }
        })
        chat.pendingMessages = []
      })
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
      setChatAgent,
      setChatModel,
      getRootChats,
      getChildChats,
      createSubChat,
      updateSubTask,
      addMessageToChat,
      getChatById,
      deleteMessage,
      updateMessage,
      updateMessageMetadata,
      isTitleGenerating,
      setTitleGenerating,
      // 预发送队列方法
      getPendingMessages,
      addPendingMessage,
      removePendingMessage,
      clearPendingMessages,
      shiftPendingMessage,
      isChatGenerating,
      isChatScopeGenerating,
      stopGeneratingInChatScope,
      isAfterRestore
    }
  },
  {
    persist: {
      storage: indexedDBStorage,
      paths: ['chats', 'activeChatId'],
      afterRestore: () => {
        resolveRestore()
      }
    }
  }
)
