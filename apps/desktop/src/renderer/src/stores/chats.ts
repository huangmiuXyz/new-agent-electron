import { FileUIPart, TextUIPart } from 'ai'
import {
  allowNextIndexedDBEmptyWrite
} from '@renderer/utils/storage'
import { correctThinkingMode } from '@renderer/services/chatService/thinkingMode'
import { chatRepository } from '@renderer/services/chatRepository'

let resolveRestore: () => void
const restorePromise = new Promise<void>((resolve) => {
  resolveRestore = resolve
})

const NEW_CHAT_DRAFT_ID = '__new__'
const MESSAGE_WINDOW_SIZE = 100
const MESSAGE_PAGE_SIZE = 50
type UpdateMessagesOptions = {
  persist?: boolean
}

const resolvePersistedActiveChatId = (persistedChats: { id: string }[], persistedActiveId: string | null) => {
  if (persistedActiveId && persistedChats.some((chat) => chat.id === persistedActiveId)) {
    return persistedActiveId
  }
  return persistedChats[0]?.id || null
}

export const useChatsStores = defineStore(
  'chats',
  () => {
    const DEFAULT_AGENT_ID = 'default'
    const chatList = ref<ChatSummary[]>([])
    const tempChats = ref<Chat[]>([])
    const activeChatId = ref<string | null>(null)
    const activeMessageWindow = ref<LoadedMessageWindow | null>(null)
    const messageWindows = shallowRef<Record<string, LoadedMessageWindow>>({})
    const chatDrafts = ref<Record<string, string>>({})
    const titleGeneratingChats = ref<Set<string>>(new Set())
    const pendingMessagesMap = ref<Record<string, PendingMessage[]>>({})
    const guidedChatIds = ref<Set<string>>(new Set())
    const isAfterRestore = restorePromise

    const getLoadedMessages = (chatId: string): BaseMessage[] => {
      return messageWindows.value[chatId]?.messages || []
    }

    const materializeChat = (summary: ChatSummary, messages: BaseMessage[] = []): Chat => ({
      id: summary.id,
      title: summary.title,
      createdAt: summary.createdAt,
      agentId: summary.agentId,
      providerId: summary.providerId,
      modelId: summary.modelId,
      isTemp: summary.isTemp,
      parentChatId: summary.parentChatId,
      subTask: summary.subTask,
      toolFeaturesEnabled: summary.toolFeaturesEnabled,
      compressedContext: summary.compressedContext,
      selectedMcpResources: summary.selectedMcpResources,
      is_collected: summary.is_collected,
      pendingMessages: pendingMessagesMap.value[summary.id] || [],
      messages,
    })

    const allChats = computed(() => {
      return [...chatList.value.map((s) => materializeChat(s, getLoadedMessages(s.id))), ...tempChats.value]
    })

    const currentChat = computed(() => {
      const summary = chatList.value.find((chat) => chat.id === activeChatId.value)
      if (!summary) return tempChats.value.find((chat) => chat.id === activeChatId.value) || null
      return materializeChat(summary, getLoadedMessages(summary.id))
    })

    const isTitleGenerating = (chatId: string) => {
      return titleGeneratingChats.value.has(chatId)
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

    const withChatMeta = (chatId: string, fn: (meta: ChatSummary | Chat) => void) => {
      const summary = chatList.value.find((s) => s.id === chatId)
      if (summary) {
        fn(summary)
        summary.updatedAt = Date.now()
        chatList.value = [...chatList.value]
        if (!isMobile.value) {
          window.api.chatDb.chat.update(chatId, JSON.parse(JSON.stringify(summary))).catch((err) => {
            console.error('[chats] Failed to sync chat meta', err)
          })
        }
        return
      }
      const chat = tempChats.value.find((c) => c.id === chatId)
      if (chat) fn(chat)
    }

    const replaceWindowMessages = (chatId: string, messages: BaseMessage[]) => {
      const existing = messageWindows.value[chatId]
      const next: LoadedMessageWindow = {
        chatId,
        messages,
        hasMoreBefore: existing?.hasMoreBefore ?? false,
        oldestOrder: existing?.oldestOrder ?? 0,
        newestOrder: messages.length - 1
      }
      messageWindows.value = { ...messageWindows.value, [chatId]: next }
      if (activeMessageWindow.value?.chatId === chatId) {
        activeMessageWindow.value = next
      }
    }

    const initializeChatsStore = async () => {
      await isAfterRestore
      if (!isMobile.value) {
        const summaries = await window.api.chatDb.chat.list()
        chatList.value = summaries
      }
      if (chatList.value.length === 0 && tempChats.value.length === 0) {
        createChat('新的聊天')
      }
      if (activeChatId.value) {
        const chatExists = chatList.value.some(c => c.id === activeChatId.value)
        if (!chatExists) {
          activeChatId.value = chatList.value[0]?.id || null
        }
        if (activeChatId.value) {
          const window = await chatRepository.loadRecentMessages(activeChatId.value, MESSAGE_WINDOW_SIZE)
          messageWindows.value = { [activeChatId.value]: window }
          activeMessageWindow.value = window
        }
      }
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

      if (options?.isTemp) {
        const chat: Chat = {
          id,
          title,
          messages: [],
          createdAt: Date.now(),
          agentId,
          providerId,
          modelId,
          isTemp: true,
          pendingMessages: [],
          parentChatId: options?.parentChatId,
          subTask: options?.subTask
        }
        tempChats.value.push(chat)
      } else {
        const summary: ChatSummary = {
          id,
          title,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          agentId,
          providerId,
          modelId,
          parentChatId: options?.parentChatId,
          subTask: options?.subTask,
          messageCount: 0
        }
        chatList.value.push(summary)
        if (!isMobile.value) {
          window.api.chatDb.chat.create(summary).catch((err) => {
            console.error('[chats] Failed to persist chat', err)
          })
        }
      }

      if (options?.activate !== false) {
        activeChatId.value = id
        const pendingDraft = chatDrafts.value[NEW_CHAT_DRAFT_ID]
        if (pendingDraft && !chatDrafts.value[id]) {
          chatDrafts.value[id] = pendingDraft
          delete chatDrafts.value[NEW_CHAT_DRAFT_ID]
        }
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

    const deleteChat = async (id: string) => {
      const allIds = new Set([id, ...getDescendantChatIds(id)])

      if (allChats.value.every(c => allIds.has(c.id))) {
        await clearChat(id)
        return
      }

      !isMobile.value && useCanvasStore().deleteCanvases([...allIds])

      for (const chatId of allIds) {
        const loaded = messageWindows.value[chatId]
        if (loaded) {
          loaded.messages.forEach((m) => m.metadata?.stop?.())
        }
        const summary = chatList.value.find((s) => s.id === chatId)
        if (summary) {
          chatList.value = chatList.value.filter((s) => s.id !== chatId)
          if (!isMobile.value) {
            await window.api.chatDb.chat.delete(chatId)
          }
        } else {
          tempChats.value = tempChats.value.filter((c) => c.id !== chatId)
        }
        const remaining = { ...messageWindows.value }
        delete remaining[chatId]
        messageWindows.value = remaining
        delete chatDrafts.value[chatId]
      }

      if (activeChatId.value && allIds.has(activeChatId.value)) {
        const fallbackId = allChats.value[0]?.id || null
        if (fallbackId) {
          await setActiveChat(fallbackId)
        } else {
          allowNextIndexedDBEmptyWrite('chats')
          activeChatId.value = null
          activeMessageWindow.value = null
        }
      }
    }

    const addMessageToChat = async (msg: BaseMessage, chatId?: string) => {
      const cid = chatId || activeChatId.value
      if (!cid) return ''
      const nextMessages = [...(messageWindows.value[cid]?.messages || []), msg]
      await chatRepository.appendMessages(cid, [msg])
      replaceWindowMessages(cid, nextMessages)
      return msg.id
    }

    const deleteMessage = async (cid: string, mid: string) => {
      const window = messageWindows.value[cid]
      if (!window) return
      window.messages.find((m) => m.id === mid)?.metadata?.stop?.()
      const nextMessages = window.messages.filter((message) => message.id !== mid)
      await chatRepository.deleteMessage(mid)
      replaceWindowMessages(cid, nextMessages)
    }

    const renameChat = (id: string, title: string) => {
      withChatMeta(id, (meta) => { meta.title = title })
    }

    const setTitleGenerating = (id: string, generating: boolean) => {
      if (generating) {
        titleGeneratingChats.value.add(id)
      } else {
        titleGeneratingChats.value.delete(id)
      }
    }

    const setActiveChat = async (id: string) => {
      activeChatId.value = id
      if (messageWindows.value[id]) {
        activeMessageWindow.value = messageWindows.value[id]
      } else {
        const window = await chatRepository.loadRecentMessages(id, MESSAGE_WINDOW_SIZE)
        messageWindows.value = { ...messageWindows.value, [id]: window }
        activeMessageWindow.value = window
      }
    }

    const getDraftKey = (chatId?: string | null) => chatId || activeChatId.value || NEW_CHAT_DRAFT_ID

    const getChatDraft = (chatId?: string | null) => {
      return chatDrafts.value[getDraftKey(chatId)] || ''
    }

    const setChatDraft = (value: string, chatId?: string | null) => {
      const key = getDraftKey(chatId)
      if (value) {
        chatDrafts.value[key] = value
      } else {
        delete chatDrafts.value[key]
      }
    }

    const appendChatDraft = (text: string, chatId?: string | null) => {
      const trimmedText = text.trim()
      if (!trimmedText) return ''

      const currentDraft = getChatDraft(chatId)
      const nextDraft = currentDraft
        ? `${currentDraft.replace(/\s+$/g, '')}\n\n${trimmedText}`
        : trimmedText

      setChatDraft(nextDraft, chatId)
      return nextDraft
    }

    const correctThinkingModeForProvider = (providerId: string, modelId: string) => {
      const settingsStore = useSettingsStore()
      const provider = settingsStore.getProviderById(providerId)
      if (!provider) return
      const current = settingsStore.thinkingMode
      const corrected = correctThinkingMode(current, {
        providerType: provider.providerType,
        providerId,
        modelId
      })
      if (corrected !== (current ?? null)) {
        settingsStore.updateThinkingMode(corrected)
      }
    }

    const applyAgentChange = (
      meta: { agentId?: string; providerId?: string; modelId?: string },
      agentId: string,
      options?: { keepCurrentModel?: boolean }
    ) => {
      const agentStore = useAgentStore()
      const normalizedAgentId = agentStore.getAgentById(agentId) ? agentId : DEFAULT_AGENT_ID
      const agentChanged = meta.agentId !== normalizedAgentId
      meta.agentId = normalizedAgentId
      if (!agentChanged) return
      const currentProviderId = options?.keepCurrentModel ? meta.providerId : undefined
      const currentModelId = options?.keepCurrentModel ? meta.modelId : undefined
      const { providerId, modelId } = resolveChatModelConfig(meta.agentId, currentProviderId, currentModelId)
      const modelChanged = meta.providerId !== providerId || meta.modelId !== modelId
      meta.providerId = providerId
      meta.modelId = modelId
      if (modelChanged) correctThinkingModeForProvider(providerId, modelId)
    }

    const applyModelChange = (
      meta: { providerId?: string; modelId?: string },
      providerId: string,
      modelId: string
    ) => {
      const modelChanged = meta.providerId !== providerId || meta.modelId !== modelId
      meta.providerId = providerId
      meta.modelId = modelId
      if (modelChanged) correctThinkingModeForProvider(providerId, modelId)
    }

    const setChatAgent = (
      chatId: string,
      agentId: string,
      options?: { keepCurrentModel?: boolean }
    ) => {
      withChatMeta(chatId, (meta) => applyAgentChange(meta, agentId, options))
    }

    const ensureChatAgent = (chatId: string) => {
      let result: string | null = null
      withChatMeta(chatId, (meta) => {
        const targetAgentId = meta.agentId || DEFAULT_AGENT_ID
        setChatAgent(chatId, targetAgentId, { keepCurrentModel: true })
        result = meta.agentId || null
      })
      return result
    }

    const setChatModel = (chatId: string, providerId: string, modelId: string) => {
      withChatMeta(chatId, (meta) => applyModelChange(meta, providerId, modelId))
    }

    const setChatToolFeaturesEnabled = (chatId: string, enabled: boolean) => {
      withChatMeta(chatId, (meta) => { meta.toolFeaturesEnabled = enabled })
    }

    const getChildChats = (parentChatId: string) => {
      return allChats.value
        .filter((chat) => chat.parentChatId === parentChatId)
        .sort((a, b) => a.createdAt - b.createdAt)
    }

    const getRootChats = () => {
      return allChats.value
        .filter((chat) => !chat.parentChatId)
        .sort((a, b) => {
          if (a.is_collected && !b.is_collected) return -1
          if (!a.is_collected && b.is_collected) return 1
          return b.createdAt - a.createdAt
        })
    }

    const togglePinChat = (chatId: string) => {
      const summary = chatList.value.find((s) => s.id === chatId)
      if (summary) {
        updateChatSummaryMeta(chatId, { is_collected: !summary.is_collected })
        return
      }
      const chat = tempChats.value.find((c) => c.id === chatId)
      if (chat) {
        chat.is_collected = !chat.is_collected
      }
    }

    const isChatPinned = (chatId: string): boolean => {
      const summary = chatList.value.find((s) => s.id === chatId)
      if (summary) return !!summary.is_collected
      const chat = tempChats.value.find((c) => c.id === chatId)
      return !!chat?.is_collected
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
      withChatMeta(chatId, (meta) => {
        if (!meta.subTask) return
        meta.subTask =
          typeof updater === 'function' ? updater(meta.subTask) : { ...meta.subTask, ...updater }
      })
    }

    const updateMessage = async (cid: string, mid: string, newParts: any[]) => {
      const window = messageWindows.value[cid]
      if (!window) return
      const nextMessages = window.messages.map((message) =>
        message.id === mid ? { ...message, parts: newParts } : message
      )
      replaceWindowMessages(cid, nextMessages)
      await chatRepository.replaceMessageParts(mid, newParts)
    }

    const updateMessageMetadata = async (cid: string, mid: string, newMetadata: MetaData) => {
      const window = messageWindows.value[cid]
      if (!window) return
      const nextMessages = window.messages.map((message) =>
        message.id === mid ? { ...message, metadata: newMetadata } : message
      )
      replaceWindowMessages(cid, nextMessages)
      await chatRepository.updateMessageMetadata(mid, newMetadata)
    }

    const updateMessageAudioChunks = async (cid: string, mid: string, audio: NonNullable<MetaData['audio']>) => {
      const window = messageWindows.value[cid]
      if (!window) return
      const message = window.messages.find((m) => m.id === mid)
      if (!message) return
      const newMetadata = { ...message.metadata, audio } as MetaData
      const nextMessages = window.messages.map((m) =>
        m.id === mid ? { ...m, metadata: newMetadata } : m
      )
      replaceWindowMessages(cid, nextMessages)
      await chatRepository.updateMessageMetadata(mid, newMetadata)
    }

    const updateMessages = async (
      chatId: string,
      messages: BaseMessage[] | ((messages: BaseMessage[]) => BaseMessage[]),
      options: UpdateMessagesOptions = {}
    ) => {
      const currentMessages = messageWindows.value[chatId]?.messages || []
      const nextMessages = typeof messages === 'function' ? messages(currentMessages) : messages
      replaceWindowMessages(chatId, nextMessages)
      if (options.persist === false) return
      await chatRepository.replaceMessages(chatId, nextMessages)
    }

    const loadMoreMessagesBefore = async (chatId: string) => {
      const window = messageWindows.value[chatId]
      if (!window || window.oldestOrder === undefined || !window.hasMoreBefore) return
      const batch = await chatRepository.loadMessagesBefore(chatId, window.oldestOrder, MESSAGE_PAGE_SIZE)
      if (batch.messages.length === 0) return
      messageWindows.value = {
        ...messageWindows.value,
        [chatId]: {
          chatId,
          messages: [...batch.messages, ...window.messages],
          hasMoreBefore: batch.hasMoreBefore,
          oldestOrder: batch.oldestOrder,
          newestOrder: window.newestOrder
        }
      }
    }

    const forkChat = async (sourceChatId: string, messageId: string) => {
      const sourceMessages = await chatRepository.loadAllMessages(sourceChatId)
      const mIndex = sourceMessages.findIndex((m) => m.id === messageId)
      if (mIndex === -1) return

      const messagesToKeep = sourceMessages.slice(0, mIndex + 1)
      const clonedMessages = messagesToKeep.map((msg) => ({
        ...msg,
        parts: msg.parts ? msg.parts.map((part) => ({ ...part })) : msg.parts,
        metadata: msg.metadata ? { ...msg.metadata } : msg.metadata
      }))

      const sourceSummary = chatList.value.find((s) => s.id === sourceChatId)
      const newChatId = createChat(sourceSummary?.title || '新的聊天', {
        agentId: sourceSummary?.agentId
      })

      await chatRepository.replaceMessages(newChatId, clonedMessages)
      const window = await chatRepository.loadRecentMessages(newChatId, MESSAGE_WINDOW_SIZE)
      messageWindows.value = { ...messageWindows.value, [newChatId]: window }
      activeMessageWindow.value = window
      return newChatId
    }

    const getPendingMessages = (chatId: string): PendingMessage[] => {
      return pendingMessagesMap.value[chatId] || []
    }

    const addPendingMessage = (chatId: string, parts: Array<FileUIPart | TextUIPart>): string => {
      if (!pendingMessagesMap.value[chatId]) {
        pendingMessagesMap.value = { ...pendingMessagesMap.value, [chatId]: [] }
      }

      const id = nanoid()
      pendingMessagesMap.value[chatId].push({
        id,
        parts,
        timestamp: Date.now()
      })
      return id
    }

    const removePendingMessage = (chatId: string, messageId: string) => {
      const list = pendingMessagesMap.value[chatId]
      if (!list) return
      pendingMessagesMap.value = {
        ...pendingMessagesMap.value,
        [chatId]: list.filter((m) => m.id !== messageId)
      }
    }

    const clearPendingMessages = (chatId: string) => {
      if (!pendingMessagesMap.value[chatId]) return
      pendingMessagesMap.value = { ...pendingMessagesMap.value, [chatId]: [] }
    }

    const markChatGuided = (chatId: string) => {
      guidedChatIds.value = new Set([...guidedChatIds.value, chatId])
    }

    const clearChatGuided = (chatId: string) => {
      const next = new Set(guidedChatIds.value)
      next.delete(chatId)
      guidedChatIds.value = next
    }

    const isChatGuided = (chatId: string): boolean => {
      return guidedChatIds.value.has(chatId)
    }

    const prioritizePendingMessage = (chatId: string, messageId: string) => {
      const list = pendingMessagesMap.value[chatId]
      if (!list?.length) return

      const index = list.findIndex((message) => message.id === messageId)
      if (index <= 0) return

      const [message] = list.splice(index, 1)
      if (!message) return
      list.unshift(message)
    }

    const shiftPendingMessage = (chatId: string): PendingMessage | undefined => {
      const list = pendingMessagesMap.value[chatId]
      if (!list?.length) return undefined

      const message = list.shift()
      return message
    }

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
          if (pendingMessagesMap.value[id]) {
            pendingMessagesMap.value = { ...pendingMessagesMap.value, [id]: [] }
          }
        }
      })
    }

    const pruneChatDrafts = () => {
      const validChatIds = new Set(allChats.value.map((chat) => chat.id))
      Object.keys(chatDrafts.value).forEach((chatId) => {
        if (chatId !== NEW_CHAT_DRAFT_ID && !validChatIds.has(chatId)) {
          delete chatDrafts.value[chatId]
        }
      })
    }

    const replacePersistedState = async (nextState: { chats: Chat[]; activeChatId: string | null }) => {
      Object.values(messageWindows.value).forEach((window) => {
        window.messages.forEach((message) => message.metadata?.stop?.())
      })
      const summaries: ChatSummary[] = nextState.chats.map((chat) => ({
        id: chat.id,
        title: chat.title,
        createdAt: chat.createdAt,
        updatedAt: Date.now(),
        agentId: chat.agentId,
        providerId: chat.providerId,
        modelId: chat.modelId,
        isTemp: chat.isTemp,
        parentChatId: chat.parentChatId,
        subTask: chat.subTask,
        toolFeaturesEnabled: chat.toolFeaturesEnabled,
        compressedContext: chat.compressedContext,
        is_collected: chat.is_collected,
        messageCount: chat.messages?.length || 0
      }))
      chatList.value = summaries
      tempChats.value = []
      messageWindows.value = {}
      activeMessageWindow.value = null
      activeChatId.value = resolvePersistedActiveChatId(summaries, nextState.activeChatId)
      pruneChatDrafts()
      if (!isMobile.value) {
        await window.api.chatDb.snapshot.import({
          schemaVersion: 2,
          summaries,
          messagesByChatId: {},
          activeChatId: activeChatId.value,
          chatDrafts: {}
        })
      }
      await Promise.all(
        nextState.chats
          .filter((chat) => chat.messages?.length)
          .map((chat) => chatRepository.replaceMessages(chat.id, chat.messages!))
      )
      if (activeChatId.value) {
        const window = await chatRepository.loadRecentMessages(activeChatId.value, MESSAGE_WINDOW_SIZE)
        messageWindows.value = { [activeChatId.value]: window }
        activeMessageWindow.value = window
      }
    }

    const updateChatSummaryMeta = (chatId: string, updates: Partial<ChatSummary>) => {
      const summary = chatList.value.find((s) => s.id === chatId)
      if (!summary) return
      Object.assign(summary, updates, { updatedAt: Date.now() })
      chatList.value = [...chatList.value]
      if (!isMobile.value) {
        window.api.chatDb.chat.update(chatId, JSON.parse(JSON.stringify({ ...summary, ...updates, updatedAt: Date.now() }))).catch((err) => {
          console.error('[chats] Failed to sync chat meta', err)
        })
      }
    }

    const clearChat = async (id: string) => {
      const allIds = new Set([id, ...getDescendantChatIds(id)])
      !isMobile.value && useCanvasStore().deleteCanvases([...allIds])

      for (const chatId of allIds) {
        const loaded = messageWindows.value[chatId]
        if (loaded) {
          loaded.messages.forEach((m) => m.metadata?.stop?.())
        }
        const summary = chatList.value.find((s) => s.id === chatId)
        if (summary) {
          await chatRepository.deleteChatMessages(chatId)
          replaceWindowMessages(chatId, [])
          updateChatSummaryMeta(chatId, {
            messageCount: 0,
            lastMessageAt: undefined,
            lastMessagePreview: undefined
          })
        } else {
          tempChats.value = tempChats.value.filter((c) => c.id !== chatId)
        }
        delete chatDrafts.value[chatId]
      }

      if (activeChatId.value && allIds.has(activeChatId.value)) {
        activeMessageWindow.value = messageWindows.value[activeChatId.value] || null
      }
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
      chatList,
      tempChats,
      chatDrafts,
      allChats,
      activeChatId,
      currentChat,
      initializeChatsStore,
      createChat,
      deleteChat,
      renameChat,
      setActiveChat,
      getChatDraft,
      setChatDraft,
      appendChatDraft,
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
      updateMessageAudioChunks,
      isTitleGenerating,
      setTitleGenerating,
      loadMoreMessagesBefore,
      getPendingMessages,
      addPendingMessage,
      removePendingMessage,
      clearPendingMessages,
      prioritizePendingMessage,
      shiftPendingMessage,
      isChatGenerating,
      isChatScopeGenerating,
      stopGeneratingInChatScope,
      markChatGuided,
      clearChatGuided,
      isChatGuided,
      replacePersistedState,
      isAfterRestore,
      updateChatSummaryMeta,
      clearChat,
      togglePinChat,
      isChatPinned
    }
  },
  {
    persist: {
      storage: indexedDBStorage,
      paths: ['activeChatId', 'chatDrafts'],
      afterRestore: () => {
        resolveRestore()
      }
    }
  }
)
