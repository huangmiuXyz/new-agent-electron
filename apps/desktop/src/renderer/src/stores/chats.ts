import { FileUIPart, TextUIPart } from "ai"

let resolveRestore: () => void
const restorePromise = new Promise<void>((resolve) => {
  resolveRestore = resolve
})

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

    const cloneMessages = (messages: BaseMessage[]) => cloneDeep(messages)

    const getMessageBranches = (message?: BaseMessage | null) =>
      message?.metadata?.messageBranches || []

    const cloneMessageBranches = (branches: MessageBranchSnapshot[]) =>
      branches.map((branch) => ({
        ...branch,
        messages: cloneMessages(branch.messages)
      }))

    const hasVisibleMessageContent = (messages: BaseMessage[]) =>
      messages.some((message) => {
        if (message.metadata?.deletedAt) return false
        if ((message.parts?.length || 0) > 0) return true

        const metadata = message.metadata
        return !!metadata?.loading || !!metadata?.error
      })

    const replaceMessageAt = (
      messages: BaseMessage[],
      index: number,
      updater: (message: BaseMessage) => BaseMessage
    ) => messages.map((message, currentIndex) => (currentIndex === index ? updater(message) : message))

    const updateMessageBranchAnchor = (
      messages: BaseMessage[],
      anchorIndex: number,
      branches: MessageBranchSnapshot[],
      activeMessageBranchId: string | null
    ) => replaceMessageAt(messages, anchorIndex, (message) => ({
      ...message,
      metadata: {
        ...message.metadata,
        messageBranches: cloneMessageBranches(branches),
        activeMessageBranchId
      } as MetaData
    }))

    const findVisibleMessageBranchAnchorIndex = (messages: BaseMessage[], forkMessageId: string) =>
      messages.findIndex((message) => message.id === forkMessageId)

    const ensureMessageBranchesForAnchor = (messages: BaseMessage[], forkMessageId: string) => {
      const anchorIndex = findVisibleMessageBranchAnchorIndex(messages, forkMessageId)
      if (anchorIndex < 0) return null

      const anchorMessage = messages[anchorIndex]
      const existingBranches = cloneMessageBranches(getMessageBranches(anchorMessage))
      const trailingMessages = cloneMessages(messages.slice(anchorIndex + 1))
      const branches =
        existingBranches.length > 0
          ? existingBranches
          : hasVisibleMessageContent(trailingMessages)
            ? [{
              id: nanoid(),
              createdAt: Date.now(),
              messages: trailingMessages
            }]
            : []
      const selectedBranchId =
        anchorMessage.metadata?.activeMessageBranchId &&
          branches.some((branch) => branch.id === anchorMessage.metadata?.activeMessageBranchId)
          ? anchorMessage.metadata.activeMessageBranchId
          : branches[0]?.id || null
      const nextMessages = updateMessageBranchAnchor(messages, anchorIndex, branches, selectedBranchId)

      return {
        anchorIndex,
        branches,
        activeMessageBranchId: selectedBranchId,
        messages: nextMessages
      }
    }

    const persistVisibleMessageBranches = (messages: BaseMessage[]) => {
      let nextMessages = cloneMessages(messages)

      for (let anchorIndex = 0; anchorIndex < nextMessages.length; anchorIndex += 1) {
        const anchorMessage = nextMessages[anchorIndex]
        const branches = cloneMessageBranches(getMessageBranches(anchorMessage))
        if (branches.length === 0) continue

        const activeMessageBranchId = anchorMessage.metadata?.activeMessageBranchId
        if (!activeMessageBranchId) continue

        const branchIndex = branches.findIndex((branch) => branch.id === activeMessageBranchId)
        if (branchIndex < 0) continue

        branches[branchIndex] = {
          ...branches[branchIndex],
          messages: cloneMessages(nextMessages.slice(anchorIndex + 1))
        }

        nextMessages = updateMessageBranchAnchor(nextMessages, anchorIndex, branches, activeMessageBranchId)
      }

      return nextMessages
    }

    const pruneEmptyMessageBranches = (messages: BaseMessage[]) => {
      let nextMessages = cloneMessages(messages)

      for (let anchorIndex = 0; anchorIndex < nextMessages.length; anchorIndex += 1) {
        const anchorMessage = nextMessages[anchorIndex]
        const branches = cloneMessageBranches(getMessageBranches(anchorMessage))
        if (branches.length === 0) continue

        const keptBranches = branches.filter((branch) => hasVisibleMessageContent(branch.messages))
        if (keptBranches.length === branches.length) continue

        const activeMessageBranchId = anchorMessage.metadata?.activeMessageBranchId
        const nextActiveMessageBranchId = keptBranches.some((branch) => branch.id === activeMessageBranchId)
          ? activeMessageBranchId || null
          : keptBranches[0]?.id || null

        nextMessages = updateMessageBranchAnchor(nextMessages, anchorIndex, keptBranches, nextActiveMessageBranchId)
      }

      return nextMessages
    }

    const resolveActiveMessageBranchIdFromMessages = (messages: BaseMessage[]) => {
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        const activeMessageBranchId = messages[index]?.metadata?.activeMessageBranchId
        if (activeMessageBranchId) {
          return activeMessageBranchId
        }
      }

      return null
    }

    const findVisibleMessageBranch = (messages: BaseMessage[], branchId: string) => {
      for (let anchorIndex = 0; anchorIndex < messages.length; anchorIndex += 1) {
        const branches = getMessageBranches(messages[anchorIndex])
        const branchIndex = branches.findIndex((branch) => branch.id === branchId)
        if (branchIndex >= 0) {
          return {
            anchorIndex,
            branchIndex,
            branch: branches[branchIndex]
          }
        }
      }

      return null
    }

    const buildMessagesFromVisibleMessageBranch = (messages: BaseMessage[], branchId: string) => {
      const location = findVisibleMessageBranch(messages, branchId)
      if (!location) return null

      const branches = cloneMessageBranches(getMessageBranches(messages[location.anchorIndex]))
      const selectedBranch = branches[location.branchIndex]
      if (!selectedBranch) return null

      const withSelection = updateMessageBranchAnchor(messages, location.anchorIndex, branches, branchId)
      return [
        ...cloneMessages(withSelection.slice(0, location.anchorIndex + 1)),
        ...cloneMessages(selectedBranch.messages)
      ]
    }

    const collectMessageSets = (messages: BaseMessage[]): BaseMessage[][] => {
      const sets: BaseMessage[][] = [messages]

      for (const message of messages) {
        for (const branch of getMessageBranches(message)) {
          sets.push(...collectMessageSets(branch.messages))
        }
      }

      return sets
    }

    const getMessageBranchMessages = (chat: Chat, branchId: string | null) => {
      if (!branchId) {
        return chat.messages
      }

      return buildMessagesFromVisibleMessageBranch(chat.messages, branchId) || []
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
      const selectedProviderHasModel = !!selectedProvider?.models?.some((m) => m.id === selectedModelId)
      const fallbackProvider = settingsStore.getAllProviders.find(
        (p) => p.models?.some((m) => m.active && m.category === 'text')
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


    const getMessageBranchVariants = (
      chatId: string,
      forkMessageId: string,
      mode: 'visible' | 'structural' = 'visible'
    ) => {
      const chat = getChatById(chatId)
      if (!chat) {
        return {
          ownerBranchId: null as string | null,
          currentBranchId: null as string | null,
          variants: [] as Array<{ id: string | null; createdAt: number }>
        }
      }

      const anchorIndex = findVisibleMessageBranchAnchorIndex(chat.messages, forkMessageId)
      if (anchorIndex < 0) {
        return {
          ownerBranchId: null as string | null,
          currentBranchId: null as string | null,
          variants: [] as Array<{ id: string | null; createdAt: number }>
        }
      }

      const anchorMessage = chat.messages[anchorIndex]
      const branches = getMessageBranches(anchorMessage)
      const visibleBranches = branches.filter((branch) => mode === 'structural' || hasVisibleMessageContent(branch.messages))
      const variants = visibleBranches
        .map((branch) => ({ id: branch.id, createdAt: branch.createdAt }))
        .sort((a, b) => a.createdAt - b.createdAt)
      const currentBranchId = visibleBranches.some((branch) => branch.id === anchorMessage.metadata?.activeMessageBranchId)
        ? anchorMessage.metadata?.activeMessageBranchId || null
        : variants[0]?.id || null

      return {
        ownerBranchId: null,
        currentBranchId,
        variants
      }
    }

    const switchMessageBranch = (chatId: string, branchId: string | null, forkMessageId?: string) => {
      const chat = getChatById(chatId)
      if (!chat || !branchId || !forkMessageId) return

      const persistedMessages = persistVisibleMessageBranches(chat.messages)
      const anchorIndex = findVisibleMessageBranchAnchorIndex(persistedMessages, forkMessageId)
      if (anchorIndex < 0) return

      const anchorMessage = persistedMessages[anchorIndex]
      const branches = cloneMessageBranches(getMessageBranches(anchorMessage))
      if (!branches.some((branch) => branch.id === branchId)) return

      const selectedMessages = buildMessagesFromVisibleMessageBranch(
        updateMessageBranchAnchor(persistedMessages, anchorIndex, branches, branchId),
        branchId
      )
      if (!selectedMessages) return

      chat.messages = selectedMessages
    }

    const cycleMessageBranch = (chatId: string, forkMessageId: string, direction: 'prev' | 'next') => {
      const chat = getChatById(chatId)
      if (!chat) return

      const { variants, currentBranchId } = getMessageBranchVariants(chatId, forkMessageId, 'structural')
      if (variants.length <= 1) return

      const currentIndex = Math.max(
        0,
        variants.findIndex((variant) => variant.id === currentBranchId)
      )
      const delta = direction === 'next' ? 1 : -1
      const nextIndex = (currentIndex + delta + variants.length) % variants.length
      switchMessageBranch(chatId, variants[nextIndex]!.id, forkMessageId)
    }

    const createMessageBranch = (chatId: string, forkMessageId: string) => {
      const chat = getChatById(chatId)
      if (!chat) return null

      const persistedMessages = persistVisibleMessageBranches(chat.messages)
      const ensured = ensureMessageBranchesForAnchor(persistedMessages, forkMessageId)
      if (!ensured) return null

      const newBranchId = nanoid()
      const nextBranches = [
        ...ensured.branches,
        {
          id: newBranchId,
          createdAt: Date.now(),
          messages: [] as BaseMessage[]
        }
      ]

      const nextMessages = updateMessageBranchAnchor(
        persistedMessages.slice(0, ensured.anchorIndex + 1),
        ensured.anchorIndex,
        nextBranches,
        newBranchId
      )

      chat.messages = nextMessages
      return newBranchId
    }

    const getActiveMessageBranchId = (chatId: string) => {
      const chat = getChatById(chatId)
      if (!chat) return null
      return resolveActiveMessageBranchIdFromMessages(chat.messages)
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
      useCanvasStore().deleteCanvases([...allIds])

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
          activeChatId.value = null
        }
      }
    }







    const addMessageToChat = (msg: BaseMessage, chatId?: string) => {
      const chat = chatId ? getChatById(chatId) : currentChat.value
      if (!chat) return ''
      chat.messages.push(msg)
      chat.messages = persistVisibleMessageBranches(chat.messages)
      return msg.id
    }
    const deleteMessage = (cid: string, mid: string) => {
      const chat = getChatById(cid)!
      chat.messages.find((m) => m.id === mid)?.metadata?.stop?.()
      setTimeout(() => {
        const previousActiveMessageBranchId = resolveActiveMessageBranchIdFromMessages(chat.messages)
        const nextMessages = persistVisibleMessageBranches(
          chat.messages.map((message) => {
            if (message.id !== mid || !message.metadata) return message

            return {
              ...message,
              metadata: {
                ...message.metadata,
                deletedAt: Date.now()
              }
            } as BaseMessage
          })
        )
        const prunedMessages = pruneEmptyMessageBranches(nextMessages)
        const nextActiveMessageBranchId = resolveActiveMessageBranchIdFromMessages(prunedMessages)

        if (
          previousActiveMessageBranchId &&
          nextActiveMessageBranchId &&
          previousActiveMessageBranchId !== nextActiveMessageBranchId
        ) {
          chat.messages = buildMessagesFromVisibleMessageBranch(prunedMessages, nextActiveMessageBranchId) || prunedMessages
          return
        }

        chat.messages = prunedMessages
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

    const setChatAgent = (chatId: string, agentId: string, options?: { keepCurrentModel?: boolean }) => {
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
        const { providerId, modelId } = resolveChatModelConfig(chat.agentId, currentProviderId, currentModelId)
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
      updateMessagesInMessageBranch(cid, null, (messages) =>
        messages.map((message) => (message.id === mid ? { ...message, parts: newParts } : message))
      )
    }
    const updateMessageMetadata = (cid: string, mid: string, newMetadata: MetaData) => {
      const chat = getChatById(cid)
      if (!chat) return
      updateMessagesInMessageBranch(cid, null, (messages) =>
        messages.map((message) => (message.id === mid ? { ...message, metadata: newMetadata } : message))
      )
    }
    const updateMessages = (
      chatId: string,
      messages: BaseMessage[] | ((messages: BaseMessage[]) => BaseMessage[])
    ) => {
      const chat = getChatById(chatId)
      if (chat) {
        const nextMessages = typeof messages === 'function' ? messages(chat.messages) : messages
        chat.messages = persistVisibleMessageBranches(nextMessages)
      }
    }

    const updateMessagesInMessageBranch = (
      chatId: string,
      branchId: string | null,
      messages: BaseMessage[] | ((messages: BaseMessage[]) => BaseMessage[])
    ) => {
      const chat = getChatById(chatId)
      if (!chat) return

      const apply = (currentMessages: BaseMessage[]) =>
        typeof messages === 'function' ? messages(currentMessages) : messages

      if (!branchId) {
        chat.messages = persistVisibleMessageBranches(apply(chat.messages))
        return
      }

      const branchMessages = buildMessagesFromVisibleMessageBranch(chat.messages, branchId)
      if (!branchMessages) {
        chat.messages = persistVisibleMessageBranches(apply(chat.messages))
        return
      }

      const nextMessages = persistVisibleMessageBranches(apply(branchMessages))
      const selectedAnchor = chat.messages.find((message) =>
        getMessageBranches(message).some((branch) => branch.id === branchId)
      )
      if (!selectedAnchor?.id) {
        chat.messages = nextMessages
        return
      }

      const anchorIndex = findVisibleMessageBranchAnchorIndex(nextMessages, selectedAnchor.id)
      if (anchorIndex < 0) {
        chat.messages = nextMessages
        return
      }

      const anchorMessage = nextMessages[anchorIndex]
      const branches = cloneMessageBranches(getMessageBranches(anchorMessage))
      const branchIndex = branches.findIndex((branch) => branch.id === branchId)
      if (branchIndex < 0) {
        chat.messages = nextMessages
        return
      }

      branches[branchIndex] = {
        ...branches[branchIndex],
        messages: cloneMessages(nextMessages.slice(anchorIndex + 1))
      }

      const preferredActiveBranchId =
        selectedAnchor.metadata?.activeMessageBranchId &&
          branches.some((branch) => branch.id === selectedAnchor.metadata?.activeMessageBranchId)
          ? selectedAnchor.metadata.activeMessageBranchId
          : branchId
      const messagesWithUpdatedBranch = updateMessageBranchAnchor(
        nextMessages,
        anchorIndex,
        branches,
        preferredActiveBranchId
      )

      chat.messages =
        preferredActiveBranchId === branchId
          ? messagesWithUpdatedBranch
          : buildMessagesFromVisibleMessageBranch(messagesWithUpdatedBranch, preferredActiveBranchId) ||
          messagesWithUpdatedBranch
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
      return chat.messages.some(m => m.metadata?.loading && m.metadata.stop)
    }

    const isChatScopeGenerating = (chatId: string): boolean => {
      const allIds = [chatId, ...getDescendantChatIds(chatId)]
      return allIds.some(id => isChatGenerating(id))
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
        chat.messages.forEach((m) => {
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
      chats.value = nextState.chats
      activeChatId.value = nextState.activeChatId
    }

    const { scrollToBottom } = useMessageScroll()

    watch(() => activeChatId.value, () => {
      scrollToBottom()
    })

    return {
      createMessageBranch,
      cycleMessageBranch,
      forkChat,
      getMessageBranchVariants,
      getMessageBranchMessages,
      getActiveMessageBranchId,
      switchMessageBranch,
      updateMessages,
      updateMessagesInMessageBranch,
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
      afterRestore: () => {
        resolveRestore()
      }
    }
  }
)
