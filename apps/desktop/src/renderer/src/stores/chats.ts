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

    const setRenderedMessages = (chat: Chat, messages: BaseMessage[]) => {
      chat.messages = cloneMessages(messages)
    }

    const getRetryBranchNode = (chat: Chat, branchId: string | null) => {
      if (!branchId) return null
      return chat.retryBranchState?.nodes.find((node) => node.id === branchId) || null
    }

    const ensureRetryBranchState = (chat: Chat) => {
      if (!chat.retryBranchState) {
        chat.retryBranchState = {
          rootMessages: cloneMessages(chat.messages),
          activeBranchId: null,
          nodes: []
        }
      }
      return chat.retryBranchState
    }

    const getActiveRetryMessages = (chat: Chat) => {
      const state = chat.retryBranchState
      if (!state) return chat.messages
      const activeNode = getRetryBranchNode(chat, state.activeBranchId)
      return activeNode?.messages || state.rootMessages
    }

    const getRetryBranchMessages = (chat: Chat, branchId: string | null) => {
      const state = chat.retryBranchState
      if (!state) {
        return branchId == null ? chat.messages : []
      }

      if (branchId == null) {
        return state.rootMessages
      }

      return getRetryBranchNode(chat, branchId)?.messages || []
    }

    const isRetryBranchVisible = (chat: Chat, branchId: string | null) =>
      (chat.retryBranchState?.activeBranchId || null) === branchId

    const setActiveRetryBranch = (chat: Chat, branchId: string | null) => {
      if (!chat.retryBranchState) return
      chat.retryBranchState.activeBranchId = branchId
      setRenderedMessages(chat, getRetryBranchMessages(chat, branchId))
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

    const syncVisibleMessagesToActiveRetryBranch = (chat: Chat) => {
      const state = chat.retryBranchState
      if (!state) return
      const snapshot = cloneMessages(chat.messages)
      const activeNode = getRetryBranchNode(chat, state.activeBranchId)
      if (activeNode) {
        activeNode.messages = snapshot
      } else {
        state.rootMessages = snapshot
      }
    }

    const getRetryBranchPath = (chat: Chat, branchId?: string | null) => {
      const state = chat.retryBranchState
      if (!state) return [] as RetryBranchNode[]

      const path: RetryBranchNode[] = []
      let currentId = branchId ?? state.activeBranchId
      while (currentId) {
        const currentNode = getRetryBranchNode(chat, currentId)
        if (!currentNode) break
        path.unshift(currentNode)
        currentId = currentNode.parentBranchId
      }
      return path
    }

    const getSelectedBranchOwner = (chat: Chat, forkMessageId: string) => {
      const path = getRetryBranchPath(chat)
      let ownerBranchId: string | null = null

      for (const node of path) {
        if (node.forkMessageId === forkMessageId) {
          return ownerBranchId
        }
        ownerBranchId = node.id
      }

      return ownerBranchId
    }

    const hasVisibleRetryContinuation = (messages: BaseMessage[], forkMessageId: string) => {
      const forkIndex = messages.findIndex((message) => message.id === forkMessageId)
      if (forkIndex === -1) return false

      return messages.slice(forkIndex + 1).some((message) => {
        if (message.metadata?.deletedAt) return false
        if ((message.parts?.length || 0) > 0) return true

        const metadata = message.metadata
        return !!metadata?.loading || !!metadata?.error
      })
    }

    const getRetryBranchVariants = (
      chatId: string,
      forkMessageId: string,
      mode: 'visible' | 'structural' = 'visible'
    ) => {
      const chat = getChatById(chatId)
      if (!chat?.retryBranchState) {
        return {
          ownerBranchId: null as string | null,
          currentBranchId: null as string | null,
          variants: [] as Array<{ id: string | null; createdAt: number }>
        }
      }

      const ownerBranchId = getSelectedBranchOwner(chat, forkMessageId)
      const ownerCreatedAt =
        ownerBranchId == null
          ? chat.createdAt
          : getRetryBranchNode(chat, ownerBranchId)?.createdAt || chat.createdAt
      const ownerMessages = getRetryBranchMessages(chat, ownerBranchId)
      const includeOwnerVariant =
        mode === 'structural' || hasVisibleRetryContinuation(ownerMessages, forkMessageId)

      const selectedChild = getRetryBranchPath(chat).find(
        (node) => node.parentBranchId === ownerBranchId && node.forkMessageId === forkMessageId
      )

      const childVariants = chat.retryBranchState.nodes
        .filter((node) =>
          node.parentBranchId === ownerBranchId &&
          node.forkMessageId === forkMessageId &&
          (
            mode === 'structural' ||
            hasVisibleRetryContinuation(node.messages, node.forkMessageId) ||
            node.id === selectedChild?.id
          )
        )
        .sort((a, b) => a.createdAt - b.createdAt)

      const variants = [
        ...(includeOwnerVariant ? [{ id: ownerBranchId, createdAt: ownerCreatedAt }] : []),
        ...childVariants.map((node) => ({ id: node.id, createdAt: node.createdAt }))
      ]
      const preferredCurrentBranchId = selectedChild?.id || ownerBranchId
      const currentBranchId = variants.some((variant) => variant.id === preferredCurrentBranchId)
        ? preferredCurrentBranchId
        : variants[0]?.id || null

      return {
        ownerBranchId,
        currentBranchId,
        variants
      }
    }

    const normalizeActiveRetryBranch = (chat: Chat) => {
      const state = chat.retryBranchState
      if (!state?.activeBranchId) return

      const activeNode = getRetryBranchNode(chat, state.activeBranchId)
      if (!activeNode) {
        setActiveRetryBranch(chat, null)
        return
      }

      const { variants, currentBranchId } = getRetryBranchVariants(chat.id, activeNode.forkMessageId, 'structural')
      if (variants.some((variant) => variant.id === state.activeBranchId)) return

      setActiveRetryBranch(chat, currentBranchId)
    }

    const pruneRetryBranchTree = (chat: Chat) => {
      const state = chat.retryBranchState
      if (!state) return

      let changed = false
      const sortedNodes = [...state.nodes].sort((a, b) => a.createdAt - b.createdAt)
      const keptNodes: RetryBranchNode[] = []
      const keptIds = new Set<string>()

      const hasForkInParent = (node: RetryBranchNode) => {
        const parentMessages =
          node.parentBranchId == null
            ? state.rootMessages
            : keptNodes.find((candidate) => candidate.id === node.parentBranchId)?.messages || []
        return parentMessages.some((message) => message.id === node.forkMessageId)
      }

      for (const node of sortedNodes) {
        if (node.parentBranchId != null && !keptIds.has(node.parentBranchId)) {
          changed = true
          continue
        }

        if (!hasForkInParent(node)) {
          changed = true
          continue
        }

        keptNodes.push(node)
        keptIds.add(node.id)
      }

      if (changed) {
        state.nodes = keptNodes
      }

      if (state.activeBranchId && !keptIds.has(state.activeBranchId)) {
        setActiveRetryBranch(chat, null)
      }

      normalizeActiveRetryBranch(chat)

      if (state.nodes.length === 0 && state.activeBranchId == null) {
        delete chat.retryBranchState
      }
    }

    const collapseEmptyRetryBranches = (chat: Chat) => {
      const state = chat.retryBranchState
      if (!state) return

      const previousNodesById = new Map(state.nodes.map((node) => [node.id, node]))
      const keptNodes = state.nodes.filter((node) => hasVisibleRetryContinuation(node.messages, node.forkMessageId))

      if (keptNodes.length === state.nodes.length) return

      const keptIds = new Set(keptNodes.map((node) => node.id))
      state.nodes = keptNodes

      if (state.activeBranchId && !keptIds.has(state.activeBranchId)) {
        let fallbackBranchId: string | null = null
        let currentParentBranchId = previousNodesById.get(state.activeBranchId)?.parentBranchId || null

        while (currentParentBranchId) {
          if (keptIds.has(currentParentBranchId)) {
            fallbackBranchId = currentParentBranchId
            break
          }
          currentParentBranchId = previousNodesById.get(currentParentBranchId)?.parentBranchId || null
        }

        setActiveRetryBranch(chat, fallbackBranchId)
      }

      pruneRetryBranchTree(chat)
      normalizeActiveRetryBranch(chat)
    }

    const forEachRetryBranchMessages = (chat: Chat, handler: (messages: BaseMessage[]) => BaseMessage[]) => {
      const state = chat.retryBranchState
      if (!state) {
        chat.messages = handler(chat.messages)
        return
      }

      state.rootMessages = handler(state.rootMessages)
      state.nodes = state.nodes.map((node) => ({
        ...node,
        messages: handler(node.messages)
      }))
      setRenderedMessages(chat, getActiveRetryMessages(chat))
      pruneRetryBranchTree(chat)
    }

    const switchRetryBranch = (chatId: string, branchId: string | null) => {
      const chat = getChatById(chatId)
      if (!chat?.retryBranchState) return

      syncVisibleMessagesToActiveRetryBranch(chat)
      setActiveRetryBranch(chat, branchId)
    }

    const cycleRetryBranch = (chatId: string, forkMessageId: string, direction: 'prev' | 'next') => {
      const chat = getChatById(chatId)
      if (!chat) return

      const { variants, currentBranchId } = getRetryBranchVariants(chatId, forkMessageId)
      if (variants.length <= 1) return

      const currentIndex = Math.max(
        0,
        variants.findIndex((variant) => variant.id === currentBranchId)
      )
      const delta = direction === 'next' ? 1 : -1
      const nextIndex = (currentIndex + delta + variants.length) % variants.length
      switchRetryBranch(chatId, variants[nextIndex]!.id)
    }

    const createRetryBranch = (chatId: string, forkMessageId: string) => {
      const chat = getChatById(chatId)
      if (!chat) return null

      const activeMessages = getActiveRetryMessages(chat)
      const forkIndex = activeMessages.findIndex((message) => message.id === forkMessageId)
      if (forkIndex === -1) return null

      const state = ensureRetryBranchState(chat)
      syncVisibleMessagesToActiveRetryBranch(chat)

      const parentBranchId = getSelectedBranchOwner(chat, forkMessageId)
      const newNode: RetryBranchNode = {
        id: nanoid(),
        parentBranchId,
        forkMessageId,
        messages: cloneMessages(activeMessages.slice(0, forkIndex + 1)),
        createdAt: Date.now()
      }

      state.nodes.push(newNode)
      setActiveRetryBranch(chat, newNode.id)
      return newNode.id
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

      const initialLength = chats.value.length
      chats.value = chats.value.filter((c) => {
        if (allIds.has(c.id)) {
          const messageSets = [c.messages, c.retryBranchState?.rootMessages || []]
          c.retryBranchState?.nodes.forEach((node) => messageSets.push(node.messages))
          messageSets.flat().forEach((m) => m.metadata?.stop?.())
        }
        return !allIds.has(c.id)
      })


      if (chats.value.length === initialLength) {
        tempChats.value = tempChats.value.filter((c) => {
          if (allIds.has(c.id)) {
            const messageSets = [c.messages, c.retryBranchState?.rootMessages || []]
            c.retryBranchState?.nodes.forEach((node) => messageSets.push(node.messages))
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
      syncVisibleMessagesToActiveRetryBranch(chat)
      setRenderedMessages(chat, getActiveRetryMessages(chat))
      return msg.id
    }
    const deleteMessage = (cid: string, mid: string) => {
      const chat = getChatById(cid)!
      const branchFallbackCandidates = chat.messages
        .filter((message) => message.role === 'user' && !!message.id)
        .map((message) => {
          const branchInfo = getRetryBranchVariants(cid, message.id!)
          return {
            forkMessageId: message.id!,
            currentBranchId: branchInfo.currentBranchId,
            variants: branchInfo.variants
          }
        })
        .filter((candidate) => candidate.variants.length > 1)
      chat.messages.find((m) => m.id === mid)?.metadata?.stop?.()
      setTimeout(() => {
        forEachRetryBranchMessages(chat, (messages) =>
          messages.map((message) => {
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

        collapseEmptyRetryBranches(chat)

        for (const candidate of [...branchFallbackCandidates].reverse()) {
          const { variants, currentBranchId: nextBranchId } = getRetryBranchVariants(cid, candidate.forkMessageId)
          if (variants.length === 0) continue

          if (
            !variants.some((variant) => variant.id === candidate.currentBranchId) &&
            nextBranchId !== candidate.currentBranchId
          ) {
            switchRetryBranch(cid, nextBranchId)
            break
          }
        }
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

    const setChatAgent = (chatId: string, agentId: string) => {
      const chat = getChatById(chatId)
      if (!chat) return
      const agentStore = useAgentStore()
      chat.agentId = agentStore.getAgentById(agentId) ? agentId : DEFAULT_AGENT_ID
      const { providerId, modelId } = resolveChatModelConfig(chat.agentId, chat.providerId, chat.modelId)
      chat.providerId = providerId
      chat.modelId = modelId
    }

    const ensureChatAgent = (chatId: string) => {
      const chat = getChatById(chatId)
      if (!chat) return null
      setChatAgent(chatId, chat.agentId || DEFAULT_AGENT_ID)

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
      forEachRetryBranchMessages(chat, (messages) =>
        messages.map((message) => (message.id === mid ? { ...message, parts: newParts } : message))
      )
    }
    const updateMessageMetadata = (cid: string, mid: string, newMetadata: MetaData) => {
      const chat = getChatById(cid)
      if (!chat) return
      forEachRetryBranchMessages(chat, (messages) =>
        messages.map((message) => (message.id === mid ? { ...message, metadata: newMetadata } : message))
      )
    }
    const updateMessages = (
      chatId: string,
      messages: BaseMessage[] | ((messages: BaseMessage[]) => BaseMessage[])
    ) => {
      const chat = getChatById(chatId)
      if (chat) {
        chat.messages = typeof messages === 'function' ? messages(chat.messages) : messages
        syncVisibleMessagesToActiveRetryBranch(chat)
        pruneRetryBranchTree(chat)
      }
    }

    const updateMessagesInRetryBranch = (
      chatId: string,
      branchId: string | null,
      messages: BaseMessage[] | ((messages: BaseMessage[]) => BaseMessage[])
    ) => {
      const chat = getChatById(chatId)
      if (!chat) return

      const apply = (currentMessages: BaseMessage[]) =>
        typeof messages === 'function' ? messages(currentMessages) : messages

      if (!chat.retryBranchState) {
        if (branchId != null) return
        chat.messages = apply(chat.messages)
        return
      }

      if (branchId == null) {
        chat.retryBranchState.rootMessages = apply(chat.retryBranchState.rootMessages)
      } else {
        const targetNode = getRetryBranchNode(chat, branchId)
        if (!targetNode) return
        targetNode.messages = apply(targetNode.messages)
      }

      if (isRetryBranchVisible(chat, branchId)) {
        chat.messages = cloneMessages(getRetryBranchMessages(chat, branchId))
      }

      pruneRetryBranchTree(chat)
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
        const messageSets = [chat.messages, chat.retryBranchState?.rootMessages || []]
        chat.retryBranchState?.nodes.forEach((node) => messageSets.push(node.messages))
        messageSets.flat().forEach((message) => message.metadata?.stop?.())
      })
      chats.value = nextState.chats
      activeChatId.value = nextState.activeChatId
    }

    return {
      createRetryBranch,
      cycleRetryBranch,
      forkChat,
      getRetryBranchPath,
      getRetryBranchVariants,
      getRetryBranchMessages,
      switchRetryBranch,
      updateMessages,
      updateMessagesInRetryBranch,
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
