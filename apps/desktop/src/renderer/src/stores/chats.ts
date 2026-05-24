import { FileUIPart, TextUIPart } from 'ai'
import { allowNextIndexedDBEmptyWrite, setIndexedDBStorageRestoreGuard } from '@renderer/utils'

let resolveRestore: () => void
const restorePromise = new Promise<void>((resolve) => {
  resolveRestore = resolve
})

const resolvePersistedActiveChatId = (persistedChats: Chat[], persistedActiveId: string | null) => {
  if (persistedActiveId && persistedChats.some((chat) => chat.id === persistedActiveId)) {
    return persistedActiveId
  }

  return persistedChats[0]?.id || null
}

export const useChatsStores = defineStore(
  'chats',
  () => {
    const DEFAULT_AGENT_ID = 'default'
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

    const collectMessageSets = (messages: BaseMessage[]): BaseMessage[][] => {
      return [messages]
    }

    const someMessageDeep = (
      messages: BaseMessage[],
      predicate: (message: BaseMessage) => boolean
    ): boolean => {
      for (const message of messages) {
        if (predicate(message)) return true
      }

      return false
    }

    const forEachMessageDeep = (
      messages: BaseMessage[],
      callback: (message: BaseMessage) => void
    ) => {
      for (const message of messages) {
        callback(message)
      }
    }

    const resolveChatModelConfig = (
      agentId: string,
      currentProviderId?: string,
      currentModelId?: string
    ) => {
      const settingsStore = useSettingsStore()
      const agentStore = useAgentStore()
      const selectedProviderId = settingsStore.selectedProviderId
      const selectedModelId = settingsStore.selectedModelId
      const selectedProvider = settingsStore.getProviderById(selectedProviderId)
      const selectedProviderHasModel = !!selectedProvider?.models?.some(
        (m) => m.id === selectedModelId
      )
      const fallbackProvider = settingsStore.getAllProviders.find((p) =>
        p.models?.some((m) => m.active && m.category === 'text')
      )
      const fallbackModel = fallbackProvider?.models?.find((m) => m.active && m.category === 'text')
      const currentProvider = currentProviderId
        ? settingsStore.getProviderById(currentProviderId)
        : null
      const currentModelIsValid = !!(
        currentProviderId &&
        currentModelId &&
        currentProvider?.models?.some((m) => m.id === currentModelId)
      )
      const agentDefaultModel = agentStore.getAgentById(agentId)?.defaultModel
      const agentDefaultProvider = agentDefaultModel?.providerId
        ? settingsStore.getProviderById(agentDefaultModel.providerId)
        : null
      const agentDefaultModelIsValid = !!(
        agentDefaultModel?.providerId &&
        agentDefaultModel?.modelId &&
        agentDefaultProvider?.models?.some((m) => m.id === agentDefaultModel.modelId)
      )

      const providerId = currentModelIsValid
        ? currentProviderId!
        : agentDefaultModelIsValid
          ? agentDefaultModel!.providerId
          : selectedProviderHasModel
            ? selectedProviderId
            : fallbackProvider?.id || ''
      const modelId = currentModelIsValid
        ? currentModelId!
        : agentDefaultModelIsValid
          ? agentDefaultModel!.modelId
          : selectedProviderHasModel
            ? selectedModelId
            : fallbackModel?.id || ''

      return { providerId, modelId }
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
      const agentStore = useAgentStore()
      const normalizeAgentId = (agentId?: string) => {
        if (!agentId) return DEFAULT_AGENT_ID
        return agentStore.getAgentById(agentId) ? agentId : DEFAULT_AGENT_ID
      }
      const agentId = normalizeAgentId(options?.agentId)
      const { providerId, modelId } = resolveChatModelConfig(agentId)

      const id = nanoid()
      const chat: Chat = {
        id,
        title,
        messages: [],
        createdAt: Date.now(),
        agentId,
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
      !isMobile.value && useCanvasStore().deleteCanvases([...allIds])

      const initialLength = chats.value.length
      chats.value = chats.value.filter((c) => {
        if (allIds.has(c.id)) {
          const messageSets = collectMessageSets(c.messages)
          messageSets.flat().forEach((m) => m.metadata?.stop?.())
        }
        return !allIds.has(c.id)
      })

      if (chats.value.length === initialLength) {
        tempChats.value = tempChats.value.filter((c) => {
          if (allIds.has(c.id)) {
            const messageSets = collectMessageSets(c.messages)
            messageSets.flat().forEach((m) => m.metadata?.stop?.())
          }
          return !allIds.has(c.id)
        })
      }

      if (activeChatId.value && allIds.has(activeChatId.value)) {
        const fallbackId = allChats.value[0]?.id || null
        if (fallbackId) {
          setActiveChat(fallbackId)
        } else {
          allowNextIndexedDBEmptyWrite('chats')
          activeChatId.value = null
        }
      }
    }

    const addMessageToChat = (msg: BaseMessage, chatId?: string) => {
      const chat = chatId ? getChatById(chatId) : currentChat.value
      if (!chat) return ''
      chat.messages.push(msg)
      return msg.id
    }
    const deleteMessage = (cid: string, mid: string) => {
      const chat = getChatById(cid)!
      chat.messages.find((m) => m.id === mid)?.metadata?.stop?.()
      setTimeout(() => {
        chat.messages = chat.messages.filter((message) => message.id !== mid)
      })
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

    const setChatAgent = (
      chatId: string,
      agentId: string,
      options?: { keepCurrentModel?: boolean }
    ) => {
      const chat = getChatById(chatId)
      if (!chat) return
      const agentStore = useAgentStore()
      const normalizedAgentId = agentStore.getAgentById(agentId) ? agentId : DEFAULT_AGENT_ID
      const agentChanged = chat.agentId !== normalizedAgentId
      chat.agentId = normalizedAgentId
      // 只有当智能体真正改变时才重新解析模型配置
      if (agentChanged) {
        // 如果指定保持当前模型，则传入当前模型信息；否则让新智能体使用其默认模型
        const currentProviderId = options?.keepCurrentModel ? chat.providerId : undefined
        const currentModelId = options?.keepCurrentModel ? chat.modelId : undefined
        const { providerId, modelId } = resolveChatModelConfig(
          chat.agentId,
          currentProviderId,
          currentModelId
        )
        chat.providerId = providerId
        chat.modelId = modelId
      }
    }

    const ensureChatAgent = (chatId: string) => {
      const chat = getChatById(chatId)
      if (!chat) return null
      const targetAgentId = chat.agentId || DEFAULT_AGENT_ID
      // 保持当前模型不变，因为这只是确保智能体有效，不是用户主动切换
      setChatAgent(chatId, targetAgentId, { keepCurrentModel: true })
      return chat.agentId
    }

    const setChatModel = (chatId: string, providerId: string, modelId: string) => {
      const chat = getChatById(chatId)
      if (!chat) return
      chat.providerId = providerId
      chat.modelId = modelId
    }

    const setChatToolFeaturesEnabled = (chatId: string, enabled: boolean) => {
      const chat = getChatById(chatId)
      if (!chat) return
      chat.toolFeaturesEnabled = enabled
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
      const agentStore = useAgentStore()
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
      const targetAgentWorkPath = agentStore.getAgentById(options.agentId)?.workPath?.trim()
      if (!targetAgentWorkPath) {
        useCanvasStore().inheritWorkspaceFromChat(options.parentChatId, chatId)
      }
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
      updateMessages(cid, (messages) =>
        messages.map((message) => (message.id === mid ? { ...message, parts: newParts } : message))
      )
    }
    const updateMessageMetadata = (cid: string, mid: string, newMetadata: MetaData) => {
      const chat = getChatById(cid)
      if (!chat) return
      updateMessages(cid, (messages) =>
        messages.map((message) =>
          message.id === mid ? { ...message, metadata: newMetadata } : message
        )
      )
    }
    const updateMessages = (
      chatId: string,
      messages: BaseMessage[] | ((messages: BaseMessage[]) => BaseMessage[])
    ) => {
      const chat = getChatById(chatId)
      if (chat) {
        const nextMessages = typeof messages === 'function' ? messages(chat.messages) : messages
        chat.messages = nextMessages
      }
    }

    const forkChat = (sourceChatId: string, messageId: string) => {
      const sourceChat = getChatById(sourceChatId)
      if (!sourceChat) return

      const mIndex = sourceChat.messages.findIndex((m) => m.id === messageId)
      if (mIndex === -1) return

      const messagesToKeep = sourceChat.messages.slice(0, mIndex + 1)
      const clonedMessages = cloneDeep(messagesToKeep)

      const newChatId = createChat(`${sourceChat.title}`, {
        agentId: sourceChat.agentId
      })
      const newChat = getChatById(newChatId)
      if (newChat) {
        newChat.messages = clonedMessages
        newChat.providerId = sourceChat.providerId
        newChat.modelId = sourceChat.modelId
      }
      return newChatId
    }

    // 预发送队列相关方法
    const getPendingMessages = (chatId: string): PendingMessage[] => {
      const chat = getChatById(chatId)
      return chat?.pendingMessages || []
    }

    const addPendingMessage = (chatId: string, parts: Array<FileUIPart | TextUIPart>): string => {
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

      chat.pendingMessages = chat.pendingMessages.filter((m) => m.id !== messageId)
    }

    const clearPendingMessages = (chatId: string) => {
      const chat = getChatById(chatId)
      if (!chat) return
      chat.pendingMessages = []
    }

    const prioritizePendingMessage = (chatId: string, messageId: string) => {
      const chat = getChatById(chatId)
      if (!chat?.pendingMessages?.length) return

      const index = chat.pendingMessages.findIndex((message) => message.id === messageId)
      if (index <= 0) return

      const [message] = chat.pendingMessages.splice(index, 1)
      if (!message) return
      chat.pendingMessages.unshift(message)
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
      return someMessageDeep(chat.messages, (m) => !!(m.metadata?.loading && m.metadata.stop))
    }

    const isChatScopeGenerating = (chatId: string): boolean => {
      const allIds = [chatId, ...getDescendantChatIds(chatId)]
      return allIds.some((id) => isChatGenerating(id))
    }

    const stopGeneratingInChatScope = (
      chatId: string,
      options?: {
        preservePendingMessages?: boolean
      }
    ) => {
      const allIds = [chatId, ...getDescendantChatIds(chatId)]
      allIds.forEach((id) => {
        const chat = getChatById(id)
        if (!chat) return
        forEachMessageDeep(chat.messages, (m) => {
          if (m.metadata?.loading && m.metadata?.stop) {
            m.metadata.stop()
          }
        })
        if (!options?.preservePendingMessages) {
          chat.pendingMessages = []
        }
      })
    }

    const replacePersistedState = (nextState: { chats: Chat[]; activeChatId: string | null }) => {
      chats.value.forEach((chat) => {
        const messageSets = collectMessageSets(chat.messages)
        messageSets.flat().forEach((message) => message.metadata?.stop?.())
      })
      if (nextState.chats.length === 0) {
        allowNextIndexedDBEmptyWrite('chats')
      }
      chats.value = nextState.chats
      activeChatId.value = resolvePersistedActiveChatId(nextState.chats, nextState.activeChatId)
    }

    const { scrollToBottom } = useMessageScroll()

    watch(
      () => activeChatId.value,
      () => {
        scrollToBottom()
      }
    )

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
      ensureChatAgent,
      setChatModel,
      setChatToolFeaturesEnabled,
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
      prioritizePendingMessage,
      shiftPendingMessage,
      isChatGenerating,
      isChatScopeGenerating,
      stopGeneratingInChatScope,
      replacePersistedState,
      isAfterRestore
    }
  },
  {
    persist: {
      storage: indexedDBStorage,
      paths: ['chats', 'activeChatId'],
      beforeRestore: () => {
        setIndexedDBStorageRestoreGuard('chats', true)
      },
      afterRestore: (ctx) => {
        const store = ctx.store as unknown as { chats: Chat[]; activeChatId: string | null }
        if (store) {
          store.activeChatId = resolvePersistedActiveChatId(store.chats, store.activeChatId)
        }
        setIndexedDBStorageRestoreGuard('chats', false)
        resolveRestore()
      }
    }
  }
)
