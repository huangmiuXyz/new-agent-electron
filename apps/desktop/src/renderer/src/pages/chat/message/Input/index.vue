<script setup lang="tsx">
import { FileUIPart, TextUIPart } from 'ai'
import AtPanel from './AtPanel.vue'
import ThinkingModeButton from './ThinkingModeButton.vue'
import { useContinuousVoiceRecorder } from '@renderer/composables/useContinuousVoiceRecorder'
import { useShortcuts } from '@renderer/composables/useShortcuts'
import { usePlugins } from '@renderer/composables/usePlugins'
import { createRegistry } from '@renderer/services/chatService/registry'
import {
  estimateMessagesTokens,
  estimateTextTokens
} from '@renderer/services/chatService/tokenUsage'
import { z } from 'zod'

const message = ref('')
const chatStore = useChatsStores()
const { triggerHook } = usePlugins()
const selectedFiles = ref<Array<UploadFile>>([])

const {
  speechEnabled,
  providerOptions: allProviderOptions,
  display,
  defaultModels
} = storeToRefs(useSettingsStore())
const agentStore = useAgentStore()
const canvasStore = useCanvasStore()
const { updateSpeechEnabled, updateProviderOptions } = useSettingsStore()
const settingsStore = useSettingsStore()

const currentChatAgent = computed(() => {
  const agentId = chatStore.currentChat?.agentId
  return agentId ? agentStore.getAgentById(agentId) : null
})
const currentChatToolFeaturesEnabled = computed(
  () => chatStore.currentChat?.toolFeaturesEnabled !== false
)
const currentAgentWorkPath = computed(() => currentChatAgent.value?.workPath?.trim() || '')
const canChooseLocalWorkPath = computed(() => {
  const api = window.api as Partial<typeof window.api> | undefined
  return (
    !isMobile.value &&
    typeof api?.showOpenDialog === 'function' &&
    Boolean(api.path && api.fs)
  )
})
const workPathButtonTitle = computed(() => {
  const agentName = currentChatAgent.value?.name || '当前智能体'
  return currentAgentWorkPath.value
    ? `${agentName} 工作路径：${currentAgentWorkPath.value}，右键清空`
    : `设置 ${agentName} 的工作路径`
})
const workPathButtonLabel = computed(() => {
  if (!currentAgentWorkPath.value) return '工作路径'
  const api = window.api as Partial<typeof window.api> | undefined
  return api?.path?.basename(currentAgentWorkPath.value) || currentAgentWorkPath.value.split(/[\\/]/).filter(Boolean).pop() || currentAgentWorkPath.value
})
const chatProviderId = computed({
  get: () => chatStore.currentChat?.providerId || '',
  set: (value: string) => {
    if (!value) return
    let chatId = chatStore.currentChat?.id
    if (!chatId) {
      chatId = chatStore.createChat()
    }
    const chat = chatStore.getChatById(chatId)
    const provider = settingsStore.getProviderById(value)
    const currentModelId = chat?.modelId
    const modelExists = !!provider?.models?.some((m) => m.id === currentModelId)
    const fallbackModelId =
      provider?.models?.find((m) => m.active && m.category === 'text')?.id ||
      provider?.models?.[0]?.id ||
      ''
    const modelId = modelExists ? currentModelId! : fallbackModelId
    if (!modelId) return
    chatStore.setChatModel(chatId, value, modelId)
  }
})
const chatModelId = computed({
  get: () => chatStore.currentChat?.modelId || '',
  set: (value: string) => {
    if (!value) return
    let chatId = chatStore.currentChat?.id
    if (!chatId) {
      chatId = chatStore.createChat()
    }
    let providerId = chatStore.currentChat?.providerId
    if (
      !providerId ||
      !settingsStore.getProviderById(providerId)?.models?.some((m) => m.id === value)
    ) {
      const provider = settingsStore.getAllProviders.find((p) =>
        p.models?.some((m) => m.id === value)
      )
      providerId = provider?.id
    }
    if (!providerId) return
    chatStore.setChatModel(chatId, providerId, value)
  }
})
const currentChatProvider = computed(() => {
  return chatProviderId.value ? settingsStore.getProviderById(chatProviderId.value) : null
})
const currentChatModel = computed(() => {
  if (!chatProviderId.value || !chatModelId.value) return null
  return settingsStore.getModelById(chatProviderId.value, chatModelId.value).model
})
const InfoCircle = useIcon('InfoCircle')
const numberFormatter = new Intl.NumberFormat('zh-CN')
const COMPRESSED_CONTEXT_MARKER = '[上下文已压缩]'

const isCompressedContextMessage = (message: BaseMessage): boolean => {
  return Boolean(
    message.metadata?.isCompressedContext ||
    message.parts?.some(
      (part) => part.type === 'text' && part.text?.includes(COMPRESSED_CONTEXT_MARKER)
    )
  )
}

const isCompressingContextMessage = (message: BaseMessage): boolean => {
  return Boolean(message.metadata?.isCompressingContext)
}

const estimateSystemTextTokens = (text: string, model?: string): number => {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return estimateTextTokens(`system: ${trimmed}`, model) + 4
}

const getCurrentContextMessages = (chat: Chat, agent?: Agent | null): BaseMessage[] => {
  const contextCount = agent?.contextCount ?? 50
  const messages = chat.messages.filter((message) => !isCompressingContextMessage(message))
  const compressedContext = chat.compressedContext

  if (compressedContext?.content && !compressedContext.loading) {
    const baseMessages = messages.filter((message) => !isCompressedContextMessage(message))
    const preservedSystemMessages = baseMessages.filter((message) => message.role === 'system')
    const compressedUpToIndex = compressedContext.compressedUpToIndex
    const tailMessages =
      compressedUpToIndex == null || compressedUpToIndex < 0
        ? baseMessages.filter((message) => message.role !== 'system')
        : baseMessages
          .slice(compressedUpToIndex + 1)
          .filter((message) => message.role !== 'system')
    const recentMessageBudget =
      contextCount > 0
        ? Math.max(contextCount - preservedSystemMessages.length - 1, 0)
        : tailMessages.length
    const recentMessages =
      recentMessageBudget > 0 ? tailMessages.slice(-recentMessageBudget) : []

    return [...preservedSystemMessages, ...recentMessages]
  }

  if (contextCount > 0 && messages.length > contextCount) {
    return messages.slice(-contextCount)
  }

  return messages
}

const currentChatContextTokens = computed(() => {
  const chat = chatStore.currentChat
  const model = currentChatModel.value?.id || chatModelId.value
  const agent = currentChatAgent.value

  if (!chat) {
    return {
      total: 0,
      userToolTokens: 0,
      assistantTokens: 0,
      systemSummaryTokens: 0,
      contextMessageCount: 0,
      hasContext: false,
      totalDisplay: numberFormatter.format(0),
      userToolDisplay: numberFormatter.format(0),
      assistantDisplay: numberFormatter.format(0),
      systemSummaryDisplay: numberFormatter.format(0),
      contextMessageCountDisplay: numberFormatter.format(0),
      tooltip: '当前上下文 Token\n暂无可用统计'
    }
  }

  const contextMessages = getCurrentContextMessages(chat, agent)
  const userToolContextMessages = contextMessages.filter(
    (message) => message.role !== 'assistant' && message.role !== 'system'
  )
  const assistantContextMessages = contextMessages.filter((message) => message.role === 'assistant')
  const systemContextMessages = contextMessages.filter((message) => message.role === 'system')
  const userToolTokens = estimateMessagesTokens(userToolContextMessages, model)
  const assistantTokens = estimateMessagesTokens(assistantContextMessages, model)
  const systemMessageTokens = estimateMessagesTokens(systemContextMessages, model)
  const compressedContextTokens =
    chat.compressedContext?.content && !chat.compressedContext.loading
      ? estimateSystemTextTokens(
        `${chat.compressedContext.content}\n\n${COMPRESSED_CONTEXT_MARKER}`,
        model
      )
      : 0
  const systemTokens = estimateSystemTextTokens(agent?.systemPrompt || '', model)
  const systemSummaryTokens = systemMessageTokens + compressedContextTokens + systemTokens
  const total = userToolTokens + assistantTokens + systemSummaryTokens

  return {
    total,
    userToolTokens,
    assistantTokens,
    systemSummaryTokens,
    contextMessageCount: contextMessages.length,
    hasContext: total > 0 || contextMessages.length > 0,
    totalDisplay: numberFormatter.format(total),
    userToolDisplay: numberFormatter.format(userToolTokens),
    assistantDisplay: numberFormatter.format(assistantTokens),
    systemSummaryDisplay: numberFormatter.format(systemSummaryTokens),
    contextMessageCountDisplay: numberFormatter.format(contextMessages.length),
    tooltip:
      total > 0 || contextMessages.length > 0
        ? [
          '当前上下文 Token（估算）',
          `总计: ${numberFormatter.format(total)}`,
          `用户/工具: ${numberFormatter.format(userToolTokens)}`,
          `助手历史: ${numberFormatter.format(assistantTokens)}`,
          `系统/摘要: ${numberFormatter.format(systemSummaryTokens)}`,
          `上下文消息: ${numberFormatter.format(contextMessages.length)} 条`
        ].join('\n')
        : '当前上下文 Token\n暂无可用统计'
  }
})

const speechStore = useSpeechStore()
const modal = useModal()
const { showContextMenu } = useContextMenu()

// 提供商参数设置
const openProviderOptionsModal = () => {
  const schema = (() => {
    try {
      const registry = createRegistry({
        apiKey: currentChatProvider.value?.apiKey || '',
        baseURL: currentChatProvider.value?.baseUrl || '',
        name: chatProviderId.value
      })
      const provider = registry.getProvider(currentChatProvider.value?.providerType || '')
      return provider?.chatCallOptionsSchema || null
    } catch (e) {
      console.warn('Failed to get chat options schema:', e)
      return null
    }
  })()

  if (!schema) {
    modal.confirm({
      title: '参数设置',
      content: '当前提供商不支持参数配置',
      showCancel: false,
      confirmText: '确定'
    })
    return
  }

  const [FormComponent, formActions] = useForm<Record<string, any>>({
    schemas: schema as z.ZodObject<any>,
    initialData: allProviderOptions.value[chatProviderId.value] || {},
    size: 'sm',
    onSubmit: (data) => {
      if (chatProviderId.value) {
        updateProviderOptions(chatProviderId.value, data)
      }
      modal.remove()
    }
  })

  modal.confirm({
    title: '参数设置',
    width: '50%',
    content: FormComponent,
    confirmText: '应用',
    cancelText: '取消',
    onOk: () => {
      formActions.submit()
    }
  })
}

const chooseCurrentAgentWorkPath = async () => {
  if (!canChooseLocalWorkPath.value) {
    messageApi.warning('移动端暂不支持本机工作路径，请使用临时工作区')
    return
  }

  let chatId = chatStore.currentChat?.id
  if (!chatId) {
    chatId = chatStore.createChat()
  }

  const chat = chatStore.getChatById(chatId)
  const agentId = chat?.agentId || 'default'
  const agent = agentStore.getAgentById(agentId)

  if (!agent) {
    messageApi.error('未找到当前智能体')
    return
  }

  const result = await window.api.showOpenDialog({
    title: `选择 ${agent.name} 的工作路径`,
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: agent.workPath || undefined
  })

  if (result.canceled || !result.filePaths?.[0]) return

  const workPath = result.filePaths[0]
  agentStore.updateAgent(agent.id, { workPath })
  canvasStore.resetWorkspaceRoot(chatId)
  messageApi.success(`已设置工作路径：${workPath}`)
}

const clearCurrentAgentWorkPath = () => {
  if (!canChooseLocalWorkPath.value || !currentAgentWorkPath.value) return

  const chatId = chatStore.currentChat?.id
  const agentId = chatStore.currentChat?.agentId || 'default'
  const agent = agentStore.getAgentById(agentId)
  if (!agent) return

  agentStore.updateAgent(agent.id, { workPath: '' })
  if (chatId) {
    canvasStore.resetWorkspaceRoot(chatId)
  }
  messageApi.success('已清空工作路径')
}

const openWorkPathContextMenu = (event: MouseEvent) => {
  showContextMenu(event, [
    {
      label: '清空工作路径',
      icon: Delete,
      danger: true,
      disabled: !currentAgentWorkPath.value,
      onClick: clearCurrentAgentWorkPath
    }
  ])
}

const toggleCurrentChatToolFeatures = () => {
  let chatId = chatStore.currentChat?.id
  if (!chatId) {
    chatId = chatStore.createChat()
  }

  chatStore.setChatToolFeaturesEnabled(chatId, !currentChatToolFeaturesEnabled.value)
}

// 图标
const FileUploadIcon = useIcon('Folder')
const MicIcon = useIcon('Mic')
const MicOffIcon = useIcon('MicOff')
const VolumeIcon = useIcon('VolumeMedium')
const VolumeMuteIcon = useIcon('VolumeMute')
const CloseIcon = useIcon('Close')
const PendingIcon = useIcon('FormatListBulleted')
const SettingsIcon = useIcon('Settings')
const ToolFeaturesIcon = useIcon('Wrench20Regular')
const PlaylistIcon = useIcon('Menu')
const StopIcon = useIcon('Stop')
const ChevronDown = useIcon('ChevronDown')
const SendIcon = useIcon('Send')
const HistoryIcon = useIcon('HistoryClock')
const { Edit, Delete, CommentAdd16Regular, Search } = useIcon([
  'Edit',
  'Delete',
  'CommentAdd16Regular',
  'Search'
])

// 引入子组件
const fileUploadRef = useTemplateRef('fileUploadRef')
const inputContainerRef = useTemplateRef('inputContainerRef')
const textareaRef = useTemplateRef('textareaRef')
const atPanelRef = useTemplateRef<InstanceType<typeof AtPanel>>('atPanelRef')

// 当前聊天的预发送消息列表
const pendingMessages = computed(() => {
  if (!chatStore.currentChat) return []
  return chatStore.getPendingMessages(chatStore.currentChat.id)
})

// 检查是否正在生成回复
const isGenerating = computed(() => {
  if (!chatStore.currentChat) return false
  return chatStore.isChatGenerating(chatStore.currentChat.id)
})

const isScopeGenerating = computed(() => {
  if (!chatStore.currentChat) return false
  return chatStore.isChatScopeGenerating(chatStore.currentChat.id)
})

const showChatSwitcher = ref(false)
const chatSwitcherQuery = ref('')
const chatSwitcherMode = ref<'list' | 'create' | 'rename' | 'delete'>('list')
const chatSwitcherTargetId = ref<string | null>(null)
const chatSwitcherDraftTitle = ref('')
const sortedChats = computed(() =>
  [...chatStore.allChats].sort((a, b) => b.createdAt - a.createdAt)
)
const filteredChats = computed(() => {
  const keyword = chatSwitcherQuery.value.trim().toLowerCase()
  if (!keyword) return sortedChats.value
  return sortedChats.value.filter((chat) => {
    const parentTitle = chat.parentChatId
      ? chatStore.getChatById(chat.parentChatId)?.title || ''
      : ''
    return `${chat.title} ${parentTitle}`.toLowerCase().includes(keyword)
  })
})
const chatSwitcherTargetChat = computed(() =>
  chatSwitcherTargetId.value ? chatStore.getChatById(chatSwitcherTargetId.value) || null : null
)

const isChatGenerating = (chat: Chat) => {
  return chatStore.isChatGenerating(chat.id)
}

const getChatSecondaryText = (chat: Chat) => {
  if (!chat.parentChatId) return ''
  return chatStore.getChatById(chat.parentChatId)?.title || '子会话'
}

const resetChatSwitcherState = () => {
  chatSwitcherMode.value = 'list'
  chatSwitcherTargetId.value = null
  chatSwitcherDraftTitle.value = ''
}

watch(showChatSwitcher, (visible) => {
  if (!visible) {
    chatSwitcherQuery.value = ''
    resetChatSwitcherState()
  }
})

const selectChatFromSwitcher = (chatId: string) => {
  chatStore.setActiveChat(chatId)
  showChatSwitcher.value = false
}

const openCreateChatInline = () => {
  chatSwitcherMode.value = 'create'
  chatSwitcherTargetId.value = null
  chatSwitcherDraftTitle.value = ''
}

const openRenameChatInline = (chat: Chat) => {
  chatSwitcherMode.value = 'rename'
  chatSwitcherTargetId.value = chat.id
  chatSwitcherDraftTitle.value = chat.title
}

const openDeleteChatInline = (chat: Chat) => {
  chatSwitcherMode.value = 'delete'
  chatSwitcherTargetId.value = chat.id
  chatSwitcherDraftTitle.value = chat.title
}

const submitCreateChatInline = () => {
  chatStore.createChat(chatSwitcherDraftTitle.value.trim() || '新的聊天')
  showChatSwitcher.value = false
}

const submitRenameChatInline = () => {
  const chatId = chatSwitcherTargetId.value
  const title = chatSwitcherDraftTitle.value.trim()
  if (!chatId || !title) return
  chatStore.renameChat(chatId, title)
  resetChatSwitcherState()
}

const submitDeleteChatInline = () => {
  const chatId = chatSwitcherTargetId.value
  if (!chatId) return
  chatStore.deleteChat(chatId)
  resetChatSwitcherState()
}

// 处理文件选择
const handleFilesSelected = (files: Array<UploadFile>) => {
  selectedFiles.value.push(...files)
}

// 处理文件移除
const handleFileRemoved = (index: number) => {
  selectedFiles.value.splice(index, 1)
}

// 移除预发送消息
const removePendingMessage = (messageId: string) => {
  if (!chatStore.currentChat) return
  chatStore.removePendingMessage(chatStore.currentChat.id, messageId)
}

const guidePendingMessage = async (messageId: string) => {
  const chatId = chatStore.currentChat?.id
  if (!chatId) return

  if (chatStore.isChatGenerating(chatId)) {
    chatStore.prioritizePendingMessage(chatId, messageId)
    chatStore.stopGeneratingInChatScope(chatId, { preservePendingMessages: true })
    return
  }

  const pendingMessage = chatStore.getPendingMessages(chatId).find((item) => item.id === messageId)
  if (!pendingMessage) return

  chatStore.removePendingMessage(chatId, messageId)
  const { sendMessages } = useChat(chatId)
  sendMessages(pendingMessage.parts.map((part) => ({ ...part })))
}

const stopAllGeneratingInCurrentChat = () => {
  const chatId = chatStore.currentChat?.id
  if (!chatId) return
  chatStore.stopGeneratingInChatScope(chatId)
}

// 获取预发送消息的文本预览
const getPendingMessagePreview = (parts: Array<FileUIPart | TextUIPart>): string => {
  const textParts = parts.filter((p): p is TextUIPart => p.type === 'text')
  const fileParts = parts.filter((p): p is FileUIPart => p.type === 'file')

  let preview = textParts.map((p) => p.text).join(' ')
  if (fileParts.length > 0) {
    const fileText = fileParts.length === 1 ? '[文件]' : `[${fileParts.length}个文件]`
    preview = preview ? `${preview} ${fileText}` : fileText
  }

  // 截断显示
  if (preview.length > 50) {
    preview = preview.substring(0, 50) + '...'
  }
  return preview || '[空消息]'
}

// 语音录制
const isRecording = ref(false)
const isListening = ref(false)
const isProcessingVoice = ref(false)

const partialSpeechText = ref('')
const showMobileTools = ref(false)
type MobileDragToolId =
  | 'upload'
  | 'voice'
  | 'thinking'
  | 'settings'
  | 'speech'
  | 'playlist'
  | 'agent'
  | 'model'
  | 'stop'
type MobileDropZone = 'top-left' | 'top-right' | 'bottom'
const MOBILE_LONG_PRESS_MS = 380
const MOBILE_POINTER_MOVE_CANCEL_PX = 10
const MOBILE_TOP_MAX_TOOLS = 4
const MOBILE_TOOL_LAYOUT_STORAGE_KEY = 'chat.mobile.tool-layout.v1'
type MobileToolLayoutStorage = {
  topLeft: MobileDragToolId[]
  topRight: MobileDragToolId[]
  bottom: MobileDragToolId[]
}
const mobileToolOrder: MobileDragToolId[] = [
  'upload',
  'voice',
  'thinking',
  'settings',
  'speech',
  'playlist',
  'agent',
  'model',
  'stop'
]
const mobileToolLabelMap: Record<MobileDragToolId, string> = {
  upload: '上传',
  voice: '语音',
  thinking: '思考',
  settings: '参数',
  speech: '播报',
  playlist: '列表',
  agent: '助手',
  model: '模型',
  stop: '停止'
}
const defaultMobileLayout: MobileToolLayoutStorage = {
  topLeft: ['upload', 'voice'],
  topRight: [],
  bottom: ['thinking', 'settings', 'speech', 'playlist', 'agent', 'model', 'stop']
}
const mobileToolLayout = useLocalStorage<MobileToolLayoutStorage>(
  MOBILE_TOOL_LAYOUT_STORAGE_KEY,
  defaultMobileLayout
)

function normalizeMobileToolList(list: unknown): MobileDragToolId[] {
  if (!Array.isArray(list)) return []
  const validSet = new Set<MobileDragToolId>(mobileToolOrder)
  const unique: MobileDragToolId[] = []
  list.forEach((item) => {
    if (typeof item !== 'string') return
    const toolId = item as MobileDragToolId
    if (!validSet.has(toolId) || unique.includes(toolId)) return
    unique.push(toolId)
  })
  return unique
}

function normalizeMobileLayout(layout: unknown): MobileToolLayoutStorage {
  const raw = (layout || {}) as Partial<MobileToolLayoutStorage>
  const topLeft = normalizeMobileToolList(raw.topLeft)
  const topRight = normalizeMobileToolList(raw.topRight)
  const bottom = normalizeMobileToolList(raw.bottom)
  const merged = [...topLeft, ...topRight, ...bottom]
  const missing = mobileToolOrder.filter((toolId) => !merged.includes(toolId))
  const uniqueTopLeft = topLeft.filter((toolId, index) => merged.indexOf(toolId) === index)
  const uniqueTopRight = topRight.filter((toolId) => !uniqueTopLeft.includes(toolId))
  const uniqueBottom = bottom.filter(
    (toolId) => !uniqueTopLeft.includes(toolId) && !uniqueTopRight.includes(toolId)
  )
  const mergedTop = [...uniqueTopLeft, ...uniqueTopRight]
  const keptTop = mergedTop.slice(0, MOBILE_TOP_MAX_TOOLS)
  const overflowTop = mergedTop.slice(MOBILE_TOP_MAX_TOOLS)
  const topLeftCapped = keptTop.filter((toolId) => uniqueTopLeft.includes(toolId))
  const topRightCapped = keptTop.filter((toolId) => uniqueTopRight.includes(toolId))
  return {
    topLeft: topLeftCapped,
    topRight: topRightCapped,
    bottom: [...overflowTop, ...uniqueBottom, ...missing]
  }
}

const normalizedMobileLayout = normalizeMobileLayout(mobileToolLayout.value)
const mobileTopLeftTools = ref<MobileDragToolId[]>(normalizedMobileLayout.topLeft)
const mobileTopRightTools = ref<MobileDragToolId[]>(normalizedMobileLayout.topRight)
const mobileTopBarRef = useTemplateRef('mobileTopBarRef')
const mobileBottomTools = ref<MobileDragToolId[]>(normalizedMobileLayout.bottom)
const mobileLayoutSnapshot = computed<MobileToolLayoutStorage>(() => ({
  topLeft: [...mobileTopLeftTools.value],
  topRight: [...mobileTopRightTools.value],
  bottom: [...mobileBottomTools.value]
}))
const mobileTopLeftZoneRef = useTemplateRef('mobileTopLeftZoneRef')
const mobileTopRightZoneRef = useTemplateRef('mobileTopRightZoneRef')
const mobileBottomZoneRef = useTemplateRef('mobileBottomZoneRef')
const longPressTimer = ref<number | null>(null)
const longPressPointerId = ref<number | null>(null)
const longPressToolId = ref<MobileDragToolId | null>(null)
const longPressStartPoint = ref<{ x: number; y: number } | null>(null)
const draggingToolId = ref<MobileDragToolId | null>(null)
const suppressMobileToolClick = ref(false)
const mobileDragPointer = ref<{ x: number; y: number }>({ x: 0, y: 0 })
const mobileHoverDropZone = ref<MobileDropZone | null>(null)

const isMobileToolDragging = computed(() => !!draggingToolId.value)

const isMobileToolVisible = (_toolId: MobileDragToolId) => {
  return true
}
const mobileDraggingToolLabel = computed(() => {
  if (!draggingToolId.value) return ''
  return mobileToolLabelMap[draggingToolId.value]
})

watch(
  mobileLayoutSnapshot,
  (layout) => {
    mobileToolLayout.value = normalizeMobileLayout(layout)
  },
  { deep: true }
)

const sortMobileTools = (tools: MobileDragToolId[]) => {
  return [...tools].sort((a, b) => mobileToolOrder.indexOf(a) - mobileToolOrder.indexOf(b))
}

const clearLongPressTimer = () => {
  if (longPressTimer.value) {
    window.clearTimeout(longPressTimer.value)
    longPressTimer.value = null
  }
}

const mobileToolClass = (toolId: MobileDragToolId) => ({
  'is-long-pressing': longPressToolId.value === toolId && !draggingToolId.value,
  'is-dragging': draggingToolId.value === toolId
})

const startDraggingTool = (toolId: MobileDragToolId) => {
  draggingToolId.value = toolId
  suppressMobileToolClick.value = true
  showMobileTools.value = true
}

const resolveDropZoneByPoint = (x: number, y: number): MobileDropZone | null => {
  const target = document.elementFromPoint(x, y) as HTMLElement | null
  if (!target) return null
  if (mobileTopLeftZoneRef.value?.contains(target)) return 'top-left'
  if (mobileTopRightZoneRef.value?.contains(target)) return 'top-right'
  if (mobileTopBarRef.value?.contains(target)) {
    const topBarRect = mobileTopBarRef.value.getBoundingClientRect()
    const rightDropThreshold = topBarRect.right - 120
    return x >= rightDropThreshold ? 'top-right' : 'top-left'
  }
  if (mobileBottomZoneRef.value?.contains(target)) return 'bottom'
  return null
}

const moveMobileToolToZone = (toolId: MobileDragToolId, zone: MobileDropZone) => {
  const nextTopLeft = mobileTopLeftTools.value.filter((id) => id !== toolId)
  const nextTopRight = mobileTopRightTools.value.filter((id) => id !== toolId)
  const nextBottom = mobileBottomTools.value.filter((id) => id !== toolId)
  const wasInTop =
    mobileTopLeftTools.value.includes(toolId) || mobileTopRightTools.value.includes(toolId)
  const nextTopCount = nextTopLeft.length + nextTopRight.length

  if (!wasInTop && zone !== 'bottom' && nextTopCount >= MOBILE_TOP_MAX_TOOLS) {
    messageApi.warning(`上方最多放 ${MOBILE_TOP_MAX_TOOLS} 个按钮`)
    return
  }

  if (zone === 'top-left') {
    mobileTopLeftTools.value = sortMobileTools([...nextTopLeft, toolId])
    mobileTopRightTools.value = sortMobileTools(nextTopRight)
    mobileBottomTools.value = sortMobileTools(nextBottom)
    return
  }
  if (zone === 'top-right') {
    mobileTopRightTools.value = sortMobileTools([...nextTopRight, toolId])
    mobileTopLeftTools.value = sortMobileTools(nextTopLeft)
    mobileBottomTools.value = sortMobileTools(nextBottom)
    return
  }
  mobileBottomTools.value = sortMobileTools([...nextBottom, toolId])
  mobileTopLeftTools.value = sortMobileTools(nextTopLeft)
  mobileTopRightTools.value = sortMobileTools(nextTopRight)
}

const finalizeMobileToolDrag = (event: PointerEvent) => {
  if (!draggingToolId.value) return
  const dropZone = resolveDropZoneByPoint(event.clientX, event.clientY)
  if (dropZone) {
    moveMobileToolToZone(draggingToolId.value, dropZone)
  }
}

const resetMobilePressState = () => {
  clearLongPressTimer()
  longPressPointerId.value = null
  longPressToolId.value = null
  longPressStartPoint.value = null
  draggingToolId.value = null
  mobileHoverDropZone.value = null
  window.setTimeout(() => {
    suppressMobileToolClick.value = false
  }, 0)
}

const bindMobilePointerListeners = () => {
  window.addEventListener('pointermove', onMobileGlobalPointerMove, { passive: false })
  window.addEventListener('pointerup', onMobileGlobalPointerUp)
  window.addEventListener('pointercancel', onMobileGlobalPointerCancel)
}

const unbindMobilePointerListeners = () => {
  window.removeEventListener('pointermove', onMobileGlobalPointerMove)
  window.removeEventListener('pointerup', onMobileGlobalPointerUp)
  window.removeEventListener('pointercancel', onMobileGlobalPointerCancel)
}

const onMobileToolPointerDown = (toolId: MobileDragToolId, event: PointerEvent) => {
  if (!isMobile.value || event.button !== 0) return
  const target = event.target as HTMLElement | null
  if (target?.closest('.modal-overlay, .selector-popup')) {
    // Selector popover content is rendered inside the tool wrapper on mobile,
    // so interactions in the popup must not start toolbar drag logic.
    return
  }
  clearLongPressTimer()
  bindMobilePointerListeners()
  longPressPointerId.value = event.pointerId
  longPressToolId.value = toolId
  longPressStartPoint.value = { x: event.clientX, y: event.clientY }
  mobileDragPointer.value = { x: event.clientX, y: event.clientY }
  longPressTimer.value = window.setTimeout(() => {
    startDraggingTool(toolId)
  }, MOBILE_LONG_PRESS_MS)
}

const onMobileToolPointerMove = (event: PointerEvent) => {
  if (draggingToolId.value) return
  if (longPressPointerId.value !== event.pointerId || !longPressStartPoint.value) return
  const distanceX = Math.abs(event.clientX - longPressStartPoint.value.x)
  const distanceY = Math.abs(event.clientY - longPressStartPoint.value.y)
  if (distanceX > MOBILE_POINTER_MOVE_CANCEL_PX || distanceY > MOBILE_POINTER_MOVE_CANCEL_PX) {
    clearLongPressTimer()
    longPressToolId.value = null
  }
}

const onMobileToolPointerUp = (event: PointerEvent) => {
  if (draggingToolId.value) {
    finalizeMobileToolDrag(event)
  }
  unbindMobilePointerListeners()
  resetMobilePressState()
}

const onMobileToolPointerCancel = () => {
  unbindMobilePointerListeners()
  resetMobilePressState()
}

const onMobileGlobalPointerMove = (event: PointerEvent) => {
  if (longPressPointerId.value !== event.pointerId) return
  mobileDragPointer.value = { x: event.clientX, y: event.clientY }
  onMobileToolPointerMove(event)
  if (draggingToolId.value) {
    mobileHoverDropZone.value = resolveDropZoneByPoint(event.clientX, event.clientY)
    event.preventDefault()
  }
}

const onMobileGlobalPointerUp = (event: PointerEvent) => {
  if (longPressPointerId.value !== event.pointerId) return
  onMobileToolPointerUp(event)
}

const onMobileGlobalPointerCancel = (event: PointerEvent) => {
  if (longPressPointerId.value !== event.pointerId) return
  onMobileToolPointerCancel()
}

const runMobileToolAction = async (toolId: MobileDragToolId) => {
  if (toolId === 'upload') return fileUploadRef.value?.triggerUpload?.()
  if (toolId === 'voice') return toggleVoiceRecording()
  if (toolId === 'settings') return openProviderOptionsModal()
  if (toolId === 'speech') return toggleSpeech()
  if (toolId === 'playlist') return toggleAssistantPanel('playlist')
  if (toolId === 'stop') return stopAllGeneratingInCurrentChat()
}

const handleMobileToolClick = async (toolId: MobileDragToolId, event: MouseEvent) => {
  if (suppressMobileToolClick.value) {
    event.preventDefault()
    event.stopPropagation()
    return
  }
  await runMobileToolAction(toolId)
}

const handleMobileToolWrapperClickCapture = (event: MouseEvent) => {
  if (!suppressMobileToolClick.value) return
  event.preventDefault()
  event.stopPropagation()
}

const {
  start: startVoice,
  stop: stopVoice,
  state: voiceState,
  isActive: voiceIsActive
} = useContinuousVoiceRecorder({
  volumeThreshold: 0.02,
  silenceDuration: 800,
  onData: (data: Float32Array) => {
    if (!(window as any)._audioSampleRate) {
      ; (window as any)._audioSampleRate = new (
        window.AudioContext || (window as any).webkitAudioContext
      )().sampleRate
    }
    const sampleRate = (window as any)._audioSampleRate
    triggerHook('speech.stream.data', { data, sampleRate })
  },
  onStart: async () => {
    if (!(window as any)._audioSampleRate) {
      ; (window as any)._audioSampleRate = new (
        window.AudioContext || (window as any).webkitAudioContext
      )().sampleRate
    }
    const sampleRate = (window as any)._audioSampleRate
    await triggerHook('speech.stream.start', {
      sampleRate,
      providerId: defaultModels.value.speechProviderId || chatProviderId.value,
      onResult: (text: string) => {
        if (text) {
          message.value += (message.value ? ' ' : '') + text
          partialSpeechText.value = ''
          _sendMessage()
        }
      },
      onPartial: (text: string) => {
        partialSpeechText.value = text
      }
    })
  },
  onStop: async () => {
    try {
      await triggerHook('speech.stream.stop')
    } catch (error) {
      console.error('语音识别停止失败:', error)
    } finally {
      partialSpeechText.value = ''
    }
  }
})

// 监听语音状态变化
watch(voiceState, (newState) => {
  isListening.value = newState === 'listening'
  isRecording.value = newState === 'recording'
})

// 切换语音录制
const toggleVoiceRecording = async () => {
  if (voiceIsActive.value) {
    stopVoice()
  } else {
    if (!defaultModels.value.speechModelId) {
      messageApi.error('请先在设置中选择默认语音转文字模型')
      return
    }
    await startVoice()
  }
}

const toggleSpeech = () => {
  const newState = !speechEnabled.value

  if (newState) {
    if (!defaultModels.value.ttsModelId) {
      messageApi.error('请先在设置中选择默认文字转语音模型')
      return
    }

    const voice = currentChatAgent.value?.speechVoice
    if (!voice) {
      messageApi.error('请先在智能体设置或默认设置中选择语音音色')
      return
    }
  }

  updateSpeechEnabled(newState)
  if (!newState) {
    speechStore.stop()
    speechStore.clearQueue()
  }
}

const toggleAssistantPanel = (tab?: 'canvas' | 'playlist') => {
  const targetTab = tab ?? display.value.assistantSidebarTab
  const isSameTab = display.value.assistantSidebarTab === targetTab

  if (tab) {
    display.value.assistantSidebarTab = targetTab
  }

  if (display.value.speechSidebarCollapsed) {
    display.value.speechSidebarCollapsed = false
    return
  }

  if (isSameTab) {
    display.value.speechSidebarCollapsed = true
  }
}

const adjustTextareaHeight = (target: Event | HTMLTextAreaElement | null | undefined) => {
  const textarea =
    target instanceof HTMLTextAreaElement ? target : (target?.target as HTMLTextAreaElement | null)
  if (!textarea) return
  textarea.style.height = 'auto'
  textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
}

const isComposing = ref(false)

const desktopPlaceholder = computed(() => {
  if (isProcessingVoice.value) return '正在处理语音...'
  if (currentChatModel.value?.name && currentChatProvider.value?.name) {
    return `${currentChatAgent.value?.name || '未绑定智能体'} · ${currentChatProvider.value.name} · ${currentChatModel.value.name}`
  }
  return '请选择模型'
})

const mobilePlaceholder = computed(() => {
  if (isProcessingVoice.value) return '正在处理语音...'
  if (currentChatModel.value?.name)
    return `${currentChatAgent.value?.name || '对话'} · ${currentChatModel.value.name}`
  return '发消息或按住说话...'
})

const handleCompositionStart = () => {
  isComposing.value = true
}

const handleCompositionEnd = () => {
  isComposing.value = false
}

const applyMention = (payload: { message: string; cursor: number }) => {
  message.value = payload.message

  nextTick(() => {
    const textarea = textareaRef.value
    if (!textarea) return
    textarea.focus()
    textarea.setSelectionRange(payload.cursor, payload.cursor)
    adjustTextareaHeight(textarea)
  })
}

const previewMention = (payload: { message: string; cursor: number }) => {
  applyMention(payload)
}

const handleTextareaInput = (event: Event) => {
  adjustTextareaHeight(event)
  atPanelRef.value?.syncMentionState(message.value, textareaRef.value)
}

const handleTextareaKeydown = (event: KeyboardEvent) => {
  const mentionResult = atPanelRef.value?.handleKeydown(event, message.value, textareaRef.value)
  if (mentionResult?.handled) {
    if (mentionResult.payload) {
      applyMention(mentionResult.payload)
    }
    return
  }

  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    if (isComposing.value) return
    _sendMessage()
  }
}

// 正则匹配 @agent:xxx 或 @智能体:xxx
const AGENT_MENTION_REGEX = /@(?:agent|智能体):([^\s]+)/gi

const _sendMessage = async () => {
  const input = message.value.trim()
  const hasContent = input || selectedFiles.value.length > 0

  if (!hasContent) return

  let chatId = chatStore.currentChat?.id
  if (!chatId) {
    chatId = chatStore.createChat()
  }

  chatStore.ensureChatAgent(chatId)

  // 处理 @agent:xxx 智能体切换
  let processedInput = input
  const agentMentionMatches = input.match(AGENT_MENTION_REGEX)
  if (agentMentionMatches && agentMentionMatches.length > 0) {
    // 获取最后一个匹配的智能体提及（用户可能输入了多个）
    const lastMention = agentMentionMatches[agentMentionMatches.length - 1]
    const agentNameMatch = lastMention.match(/@(?:agent|智能体):([^\s]+)/i)
    if (agentNameMatch) {
      const agentName = agentNameMatch[1]
      // 查找匹配的智能体
      const targetAgent = agentStore.allAgents.find(
        (agent) => agent.name.toLowerCase() === agentName.toLowerCase()
      )
      if (targetAgent) {
        // 切换到目标智能体
        chatStore.setChatAgent(chatId, targetAgent.id)
        // 从消息中移除 @agent:xxx 字符串
        processedInput = input.replace(AGENT_MENTION_REGEX, '').trim()
      }
    }
  }

  const currentChat = chatStore.getChatById(chatId)
  const providerId = currentChat?.providerId
  const modelId = currentChat?.modelId
  const selectedModel =
    providerId && modelId ? settingsStore.getModelById(providerId, modelId).model : null

  if (!selectedModel) {
    messageApi.error('请先选择模型')
    return
  }

  // 构建消息parts
  const parts: Array<FileUIPart | TextUIPart> = []

  if (processedInput) {
    parts.push({ type: 'text', text: processedInput })
  }

  for (const file of selectedFiles.value) {
    const { path, url, ...aiPart } = file

    parts.push({
      ...aiPart,
      url: path ?? url
    } as FileUIPart)
  }

  // 清空输入
  message.value = ''
  atPanelRef.value?.scheduleClose()
  selectedFiles.value = []
  nextTick(() => {
    adjustTextareaHeight(textareaRef.value)
  })

  // 确保有聊天会话
  if (!chatStore.currentChat?.id && chatId) {
    chatStore.setActiveChat(chatId)
  }

  const { sendMessages } = useChat(chatId)

  // 检查是否正在生成回复
  if (chatStore.isChatGenerating(chatId)) {
    // 添加到预发送队列
    chatStore.addPendingMessage(chatId, parts)
  } else {
    // 直接发送
    sendMessages(parts)
  }
}

// 注册聚焦输入框快捷键
const { register, unregister } = useShortcuts()
onMounted(() => {
  register({
    id: 'global.focusInput',
    handler: () => {
      textareaRef.value?.focus()
    }
  })
})
onUnmounted(() => {
  unregister('global.focusInput')
  unbindMobilePointerListeners()
  clearLongPressTimer()
})
</script>

<template>
  <footer class="footer" :class="{ 'is-centered': display.chatCenteredLayout, 'is-mobile': isMobile }">
    <!-- 预发送消息列表 -->
    <div v-if="pendingMessages.length > 0" class="pending-messages-container">
      <div class="pending-messages-header">
        <PendingIcon class="pending-icon" />
        <span class="pending-title">预发送队列 ({{ pendingMessages.length }})</span>
        <span v-if="isGenerating" class="pending-status">等待AI回复中...</span>
      </div>
      <div class="pending-messages-list">
        <div v-for="item in pendingMessages" :key="item.id" class="pending-message-item">
          <span class="pending-message-text">{{ getPendingMessagePreview(item.parts) }}</span>
          <div class="pending-message-actions">
            <Button variant="text" size="sm" class="guide-btn" title="停止当前生成，并让这条消息下一条进入上下文"
              @click="guidePendingMessage(item.id)">
              <template #icon>
                <SendIcon />
              </template>
              引导
            </Button>
            <Button variant="icon" size="sm" class="remove-btn" @click="removePendingMessage(item.id)">
              <CloseIcon />
            </Button>
          </div>
        </div>
      </div>
    </div>

    <div class="input-container" ref="inputContainerRef"
      :class="{ 'drag-over': fileUploadRef?.isDragOver || fileUploadRef?.isOverDropZone }">
      <FileUpload ref="fileUploadRef" :files="selectedFiles" :dropZoneRef="inputContainerRef!" :inputRef="textareaRef!"
        @files-selected="handleFilesSelected" @remove="handleFileRemoved" />

      <div v-if="!isMobile">
        <div class="input-wrapper">
          <AtPanel ref="atPanelRef" @apply="applyMention" @preview="previewMention" />
          <textarea ref="textareaRef" class="input-field" rows="1" :placeholder="desktopPlaceholder" v-model="message"
            @input="handleTextareaInput" @keydown="handleTextareaKeydown"
            @focus="atPanelRef?.syncMentionState(message, textareaRef)" @blur="atPanelRef?.scheduleClose()"
            @compositionstart="handleCompositionStart" @compositionend="handleCompositionEnd"
            :disabled="isProcessingVoice"></textarea>
          <div v-if="partialSpeechText" class="partial-text">{{ partialSpeechText }}</div>
        </div>

        <div class="input-actions">
          <div class="action-left">
            <Button variant="icon" size="sm" @click="fileUploadRef?.triggerUpload!">
              <FileUploadIcon />
            </Button>
            <ThinkingModeButton :provider-type="currentChatProvider?.providerType" />

            <Button variant="icon" size="sm" title="参数设置" @click="openProviderOptionsModal">
              <SettingsIcon />
            </Button>
            <Button
              variant="icon"
              size="sm"
              :class="{ 'tool-features-active': currentChatToolFeaturesEnabled }"
              :title="currentChatToolFeaturesEnabled ? '本对话已启用技能、内置工具和 MCP' : '本对话已禁用自动技能、内置工具和 MCP，@技能引用仍可用'"
              @click="toggleCurrentChatToolFeatures"
            >
              <ToolFeaturesIcon />
            </Button>
            <div class="token-usage-popover">
              <Button
                variant="icon"
                size="sm"
                class="token-usage-btn"
                aria-label="当前上下文 Token 统计"
                :title="currentChatContextTokens.tooltip"
              >
                <InfoCircle />
              </Button>
              <div class="token-usage-panel">
                <div class="token-usage-panel-title">当前上下文 Token</div>
                <template v-if="currentChatContextTokens.hasContext">
                  <div class="token-usage-panel-row">
                    <span>总计</span>
                    <strong>{{ currentChatContextTokens.totalDisplay }}</strong>
                  </div>
                  <div class="token-usage-panel-row">
                    <span>用户/工具</span>
                    <span>{{ currentChatContextTokens.userToolDisplay }}</span>
                  </div>
                  <div class="token-usage-panel-row">
                    <span>助手历史</span>
                    <span>{{ currentChatContextTokens.assistantDisplay }}</span>
                  </div>
                  <div class="token-usage-panel-row">
                    <span>系统/摘要</span>
                    <span>{{ currentChatContextTokens.systemSummaryDisplay }}</span>
                  </div>
                  <div class="token-usage-panel-row">
                    <span>上下文消息</span>
                    <span>{{ currentChatContextTokens.contextMessageCountDisplay }}</span>
                  </div>
                </template>
                <div v-else class="token-usage-panel-empty">暂无可用统计</div>
              </div>
            </div>

            <Button variant="icon" size="sm" :class="{ 'voice-active': voiceIsActive }" @click="toggleVoiceRecording"
              :title="voiceIsActive ? (isRecording ? '正在录制' : '正在监听') : '语音输入'">
              <MicIcon v-if="!voiceIsActive" />
              <MicOffIcon v-else />
            </Button>

            <Button variant="icon" size="sm" :class="{ 'speech-active': speechEnabled }" @click="toggleSpeech"
              :title="speechEnabled ? '关闭语音播报' : '开启语音播报'">
              <VolumeIcon v-if="speechEnabled" />
              <VolumeMuteIcon v-else />
            </Button>

            <Button v-if="isScopeGenerating" variant="icon" size="sm" class="stop-all-btn" title="停止当前聊天内全部生成"
              @click="stopAllGeneratingInCurrentChat">
              <StopIcon />
            </Button>

            <ChatAgentSelector type="icon" />
            <ModelSelector type="icon" v-model:model-id="chatModelId" v-model:provider-id="chatProviderId" />
            <SelectorPopover v-model:visible="showChatSwitcher" v-model:search-query="chatSwitcherQuery" width="380px"
              position="top">
              <template #trigger>
                <button class="chat-switcher-trigger no-drag" :class="{ active: showChatSwitcher }" type="button"
                  title="聊天列表">
                  <HistoryIcon />
                </button>
              </template>
              <template #content>
                <div class="chat-switcher-panel">
                  <div class="chat-switcher-search-shell">
                    <Search class="chat-switcher-search-icon" />
                    <input v-model="chatSwitcherQuery" class="chat-switcher-search-input" placeholder="搜索最近任务"
                      type="text" />
                  </div>
                  <div class="chat-switcher-toolbar">
                    <button class="chat-switcher-filter" type="button">
                      <span>聊天列表</span>
                      <ChevronDown />
                    </button>
                    <Button variant="icon" size="sm" title="新建聊天" class="chat-switcher-add-btn"
                      @click.stop="openCreateChatInline">
                      <CommentAdd16Regular />
                    </Button>
                  </div>

                  <div v-if="chatSwitcherMode === 'create' || chatSwitcherMode === 'rename'"
                    class="chat-switcher-inline-card">
                    <div class="chat-switcher-inline-title">
                      {{ chatSwitcherMode === 'create' ? '新建聊天' : '重命名聊天' }}
                    </div>
                    <input v-model="chatSwitcherDraftTitle" class="chat-switcher-input"
                      :placeholder="chatSwitcherMode === 'create' ? '输入聊天名称' : '输入新的名称'" @keydown.enter.stop.prevent="
                        chatSwitcherMode === 'create'
                          ? submitCreateChatInline()
                          : submitRenameChatInline()
                        " />
                    <div class="chat-switcher-inline-actions">
                      <Button variant="secondary" size="sm" @click.stop="resetChatSwitcherState">取消</Button>
                      <Button variant="primary" size="sm"
                        :disabled="chatSwitcherMode === 'rename' && !chatSwitcherDraftTitle.trim()" @click.stop="
                          chatSwitcherMode === 'create'
                            ? submitCreateChatInline()
                            : submitRenameChatInline()
                          ">
                        {{ chatSwitcherMode === 'create' ? '创建' : '保存' }}
                      </Button>
                    </div>
                  </div>

                  <div v-else-if="chatSwitcherMode === 'delete' && chatSwitcherTargetChat"
                    class="chat-switcher-inline-card danger">
                    <div class="chat-switcher-inline-title">删除聊天</div>
                    <div class="chat-switcher-delete-text">
                      确定删除“{{ chatSwitcherTargetChat.title }}”吗？
                    </div>
                    <div class="chat-switcher-inline-actions">
                      <Button variant="secondary" size="sm" @click.stop="resetChatSwitcherState">取消</Button>
                      <Button variant="primary" size="sm" danger @click.stop="submitDeleteChatInline">删除</Button>
                    </div>
                  </div>

                  <div class="chat-switcher-list">
                    <div v-for="chat in filteredChats" :key="chat.id" class="chat-switcher-item"
                      :class="{ active: chatStore.activeChatId === chat.id }" @click="selectChatFromSwitcher(chat.id)"
                      @keydown.enter.prevent="selectChatFromSwitcher(chat.id)" tabindex="0" role="button">
                      <div class="chat-switcher-item-main">
                        <div class="chat-switcher-item-top">
                          <span class="chat-switcher-item-title">{{ chat.title }}</span>
                        </div>
                        <div class="chat-switcher-item-bottom" v-if="
                          getChatSecondaryText(chat) ||
                          chat.parentChatId ||
                          isChatGenerating(chat)
                        ">
                          <span v-if="getChatSecondaryText(chat)" class="chat-switcher-item-subtitle">
                            {{ getChatSecondaryText(chat) }}
                          </span>
                          <span v-if="chat.parentChatId" class="chat-switcher-badge">子会话</span>
                          <span v-if="isChatGenerating(chat)" class="chat-switcher-badge generating">生成中</span>
                        </div>
                      </div>
                      <div class="chat-switcher-item-actions" @click.stop>
                        <Button variant="icon" size="sm" title="重命名" @click.stop="openRenameChatInline(chat)">
                          <Edit />
                        </Button>
                        <Button variant="icon" size="sm" danger title="删除" @click.stop="openDeleteChatInline(chat)">
                          <Delete />
                        </Button>
                      </div>
                    </div>
                    <div v-if="!filteredChats.length" class="chat-switcher-empty">
                      没找到匹配的聊天
                    </div>
                  </div>
                </div>
              </template>
            </SelectorPopover>
            <button v-if="canChooseLocalWorkPath" type="button" class="workpath-trigger no-drag"
              :class="{ 'workpath-active': currentAgentWorkPath }" :title="workPathButtonTitle"
              @click="chooseCurrentAgentWorkPath" @contextmenu="openWorkPathContextMenu">
              {{ workPathButtonLabel }}
            </button>
          </div>
          <div class="action-right">
            <Button variant="primary" size="md" @click="_sendMessage">
              {{ isGenerating && pendingMessages.length > 0 ? '加入队列' : '发送' }}
            </Button>
          </div>
        </div>
      </div>

      <div v-else>
        <div class="mobile-input-bar" ref="mobileTopBarRef" :class="{ 'mobile-drop-active': isMobileToolDragging }">
          <div class="mobile-top-drop-zone mobile-top-left-zone" ref="mobileTopLeftZoneRef"
            :class="{ 'mobile-drop-hover': mobileHoverDropZone === 'top-left' }">
            <template v-for="toolId in mobileTopLeftTools" :key="`top-left-${toolId}`">
              <div v-if="isMobileToolVisible(toolId)" class="mobile-drag-tool" :class="mobileToolClass(toolId)"
                @pointerdown="onMobileToolPointerDown(toolId, $event)" @pointercancel="onMobileToolPointerCancel"
                @click.capture="handleMobileToolWrapperClickCapture">
                <Button v-if="toolId === 'upload'" variant="icon" size="sm"
                  @click="handleMobileToolClick('upload', $event)">
                  <FileUploadIcon />
                </Button>
                <Button v-else-if="toolId === 'voice'" variant="icon" size="sm"
                  :class="{ 'voice-active': voiceIsActive }"
                  :title="voiceIsActive ? (isRecording ? '正在录制' : '正在监听') : '语音输入'"
                  @click="handleMobileToolClick('voice', $event)">
                  <MicIcon v-if="!voiceIsActive" />
                  <MicOffIcon v-else />
                </Button>
                <ThinkingModeButton v-else-if="toolId === 'thinking'" :provider-type="currentChatProvider?.providerType" />
                <Button v-else-if="toolId === 'settings'" variant="icon" size="sm" title="参数设置"
                  @click="handleMobileToolClick('settings', $event)">
                  <SettingsIcon />
                </Button>
                <Button v-else-if="toolId === 'speech'" variant="icon" size="sm"
                  :class="{ 'speech-active': speechEnabled }" :title="speechEnabled ? '关闭语音播报' : '开启语音播报'"
                  @click="handleMobileToolClick('speech', $event)">
                  <VolumeIcon v-if="speechEnabled" />
                  <VolumeMuteIcon v-else />
                </Button>
                <Button v-else-if="toolId === 'playlist'" variant="icon" size="sm"
                  :class="{ 'speech-active': !display.speechSidebarCollapsed && display.assistantSidebarTab === 'playlist' }"
                  :title="display.speechSidebarCollapsed || display.assistantSidebarTab !== 'playlist' ? '打开播放列表' : '关闭播放列表'"
                  @click="handleMobileToolClick('playlist', $event)">
                  <PlaylistIcon />
                </Button>
                <ChatAgentSelector v-else-if="toolId === 'agent'" type="icon" />
                <ModelSelector v-else-if="toolId === 'model'" type="icon" v-model:model-id="chatModelId"
                  v-model:provider-id="chatProviderId" />
                <Button v-else-if="toolId === 'stop'" variant="icon" size="sm" class="stop-all-btn"
                  :class="{ 'is-idle': !isScopeGenerating }" title="停止当前聊天内全部生成"
                  @click="handleMobileToolClick('stop', $event)">
                  <StopIcon />
                </Button>
              </div>
            </template>
          </div>
          <div class="mobile-input-wrapper">
            <AtPanel ref="atPanelRef" mobile @apply="applyMention" @preview="previewMention" />
            <textarea ref="textareaRef" class="input-field mobile-input-field" rows="1" :placeholder="mobilePlaceholder"
              v-model="message" @input="handleTextareaInput" @keydown="handleTextareaKeydown"
              @focus="atPanelRef?.syncMentionState(message, textareaRef)" @blur="atPanelRef?.scheduleClose()"
              @compositionstart="handleCompositionStart" @compositionend="handleCompositionEnd"
              :disabled="isProcessingVoice"></textarea>
            <div v-if="partialSpeechText" class="partial-text mobile-partial-text">
              {{ partialSpeechText }}
            </div>
          </div>
          <div class="mobile-top-drop-zone mobile-top-right-zone" v-if="
            mobileTopRightTools.length > 0 ||
            (isMobileToolDragging && mobileHoverDropZone === 'top-right')
          " ref="mobileTopRightZoneRef" :class="{ 'mobile-drop-hover': mobileHoverDropZone === 'top-right' }">
            <template v-for="toolId in mobileTopRightTools" :key="`top-right-${toolId}`">
              <div v-if="isMobileToolVisible(toolId)" class="mobile-drag-tool" :class="mobileToolClass(toolId)"
                @pointerdown="onMobileToolPointerDown(toolId, $event)" @pointercancel="onMobileToolPointerCancel"
                @click.capture="handleMobileToolWrapperClickCapture">
                <Button v-if="toolId === 'upload'" variant="icon" size="sm"
                  @click="handleMobileToolClick('upload', $event)">
                  <FileUploadIcon />
                </Button>
                <Button v-else-if="toolId === 'voice'" variant="icon" size="sm"
                  :class="{ 'voice-active': voiceIsActive }"
                  :title="voiceIsActive ? (isRecording ? '正在录制' : '正在监听') : '语音输入'"
                  @click="handleMobileToolClick('voice', $event)">
                  <MicIcon v-if="!voiceIsActive" />
                  <MicOffIcon v-else />
                </Button>
                <ThinkingModeButton v-else-if="toolId === 'thinking'" :provider-type="currentChatProvider?.providerType" />
                <Button v-else-if="toolId === 'settings'" variant="icon" size="sm" title="参数设置"
                  @click="handleMobileToolClick('settings', $event)">
                  <SettingsIcon />
                </Button>
                <Button v-else-if="toolId === 'speech'" variant="icon" size="sm"
                  :class="{ 'speech-active': speechEnabled }" :title="speechEnabled ? '关闭语音播报' : '开启语音播报'"
                  @click="handleMobileToolClick('speech', $event)">
                  <VolumeIcon v-if="speechEnabled" />
                  <VolumeMuteIcon v-else />
                </Button>
                <Button v-else-if="toolId === 'playlist'" variant="icon" size="sm"
                  :class="{ 'speech-active': !display.speechSidebarCollapsed && display.assistantSidebarTab === 'playlist' }"
                  :title="display.speechSidebarCollapsed || display.assistantSidebarTab !== 'playlist' ? '打开播放列表' : '关闭播放列表'"
                  @click="handleMobileToolClick('playlist', $event)">
                  <PlaylistIcon />
                </Button>
                <ChatAgentSelector v-else-if="toolId === 'agent'" type="icon" />
                <ModelSelector v-else-if="toolId === 'model'" type="icon" v-model:model-id="chatModelId"
                  v-model:provider-id="chatProviderId" />
                <Button v-else-if="toolId === 'stop'" variant="icon" size="sm" class="stop-all-btn"
                  :class="{ 'is-idle': !isScopeGenerating }" title="停止当前聊天内全部生成"
                  @click="handleMobileToolClick('stop', $event)">
                  <StopIcon />
                </Button>
              </div>
            </template>
          </div>
          <Button variant="icon" size="sm" @click="showMobileTools = !showMobileTools"
            :title="showMobileTools ? '收起工具' : '展开工具'">
            <ChevronDown :class="{ 'mobile-toggle-open': showMobileTools }" />
          </Button>
          <Button variant="primary" size="sm" class="mobile-send-btn" @click="_sendMessage">
            {{ isGenerating && pendingMessages.length > 0 ? '队列' : '发送' }}
          </Button>
        </div>

        <div v-if="showMobileTools" class="mobile-tools-panel" ref="mobileBottomZoneRef" :class="{
          'mobile-drop-active': isMobileToolDragging,
          'mobile-drop-hover': mobileHoverDropZone === 'bottom'
        }">
          <template v-for="toolId in mobileBottomTools" :key="`bottom-${toolId}`">
            <div v-if="isMobileToolVisible(toolId)" class="mobile-drag-tool" :class="mobileToolClass(toolId)"
              @pointerdown="onMobileToolPointerDown(toolId, $event)" @pointercancel="onMobileToolPointerCancel"
              @click.capture="handleMobileToolWrapperClickCapture">
              <Button v-if="toolId === 'upload'" variant="icon" size="sm"
                @click="handleMobileToolClick('upload', $event)">
                <FileUploadIcon />
              </Button>
              <Button v-else-if="toolId === 'voice'" variant="icon" size="sm" :class="{ 'voice-active': voiceIsActive }"
                :title="voiceIsActive ? (isRecording ? '正在录制' : '正在监听') : '语音输入'"
                @click="handleMobileToolClick('voice', $event)">
                <MicIcon v-if="!voiceIsActive" />
                <MicOffIcon v-else />
              </Button>
              <ThinkingModeButton v-else-if="toolId === 'thinking'" :provider-type="currentChatProvider?.providerType" />
              <Button v-else-if="toolId === 'settings'" variant="icon" size="sm" title="参数设置"
                @click="handleMobileToolClick('settings', $event)">
                <SettingsIcon />
              </Button>
              <Button v-else-if="toolId === 'speech'" variant="icon" size="sm"
                :class="{ 'speech-active': speechEnabled }" :title="speechEnabled ? '关闭语音播报' : '开启语音播报'"
                @click="handleMobileToolClick('speech', $event)">
                <VolumeIcon v-if="speechEnabled" />
                <VolumeMuteIcon v-else />
              </Button>
              <Button v-else-if="toolId === 'playlist'" variant="icon" size="sm"
                :class="{ 'speech-active': !display.speechSidebarCollapsed && display.assistantSidebarTab === 'playlist' }"
                :title="display.speechSidebarCollapsed || display.assistantSidebarTab !== 'playlist' ? '打开播放列表' : '关闭播放列表'"
                @click="handleMobileToolClick('playlist', $event)">
                <PlaylistIcon />
              </Button>
              <ChatAgentSelector v-else-if="toolId === 'agent'" type="icon" />
              <ModelSelector v-else-if="toolId === 'model'" type="icon" v-model:model-id="chatModelId"
                v-model:provider-id="chatProviderId" />
              <Button v-else-if="toolId === 'stop'" variant="icon" size="sm" class="stop-all-btn"
                :class="{ 'is-idle': !isScopeGenerating }" title="停止当前聊天内全部生成"
                @click="handleMobileToolClick('stop', $event)">
                <StopIcon />
              </Button>
            </div>
          </template>
        </div>
      </div>

      <div v-if="isMobileToolDragging && draggingToolId" class="mobile-drag-ghost" :style="{
        left: `${mobileDragPointer.x}px`,
        top: `${mobileDragPointer.y}px`
      }">
        <span>{{ mobileDraggingToolLabel }}</span>
      </div>

      <!-- 拖拽提示 -->
      <div v-if="fileUploadRef?.isDragOver || fileUploadRef?.isOverDropZone" class="drag-overlay">
        <div class="drag-message">
          <FileUploadIcon />
          <span>释放以上传文件</span>
        </div>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.footer {
  padding: 10px;
  background: transparent;
  width: 100%;
  transition:
    max-width 0.3s ease,
    margin 0.3s ease;
}

.footer.is-centered {
  max-width: 800px;
  margin: 0 auto;
}

/* 预发送消息列表样式 */
.pending-messages-container {
  margin-bottom: 8px;
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 8px 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
}

.pending-messages-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-size: 11px;
  color: var(--text-secondary);
}

.chat-switcher-panel {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chat-switcher-trigger {
  width: 24px;
  height: 24px;
  min-width: 24px;
  min-height: 24px;
  padding: 4px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.18s ease;
}

.chat-switcher-trigger:hover,
.chat-switcher-trigger.active {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.chat-switcher-search-shell {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 10px;
  border-radius: 6px;
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  transition: border-color 0.2s;
}

.chat-switcher-search-shell:focus-within {
  border-color: var(--border-focus);
}

.chat-switcher-search-icon {
  width: 14px;
  height: 14px;
  color: var(--text-tertiary);
}

.chat-switcher-search-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-size: 13px;
}

.chat-switcher-search-input::placeholder {
  color: var(--text-tertiary);
}

.chat-switcher-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 28px;
  padding: 0 4px;
}

.chat-switcher-filter {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.15s ease;
}

.chat-switcher-filter:hover {
  color: var(--text-primary);
}

.chat-switcher-add-btn {
  flex-shrink: 0;
  color: var(--text-secondary);
}

.chat-switcher-add-btn:hover {
  color: var(--text-primary);
}

.chat-switcher-inline-card {
  padding: 10px;
  border-radius: 6px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-hover);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chat-switcher-inline-card.danger {
  border-color: rgba(var(--color-danger-rgb, 239, 68, 68), 0.3);
  background: rgba(var(--color-danger-rgb, 239, 68, 68), 0.08);
}

.chat-switcher-inline-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.chat-switcher-input {
  width: 100%;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 12px;
  padding: 6px 10px;
  outline: none;
  transition: all 0.2s;
}

.chat-switcher-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(var(--color-primary-rgb, 0, 123, 255), 0.15);
}

.chat-switcher-inline-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.chat-switcher-delete-text {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.chat-switcher-list {
  max-height: 300px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-right: 2px;
}

.chat-switcher-list::-webkit-scrollbar {
  width: 4px;
}

.chat-switcher-list::-webkit-scrollbar-track {
  background: transparent;
}

.chat-switcher-list::-webkit-scrollbar-thumb {
  background: var(--border-subtle);
  border-radius: 2px;
}

.chat-switcher-list::-webkit-scrollbar-thumb:hover {
  background: var(--text-tertiary);
}

.chat-switcher-item {
  width: 100%;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  padding: 0 8px;
  height: 30px;
  display: flex;
  align-items: center;
  gap: 6px;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;
}

.chat-switcher-item:hover {
  background: var(--bg-hover);
}

.chat-switcher-item.active {
  background: var(--bg-active);
  border-color: var(--border-subtle);
}

.chat-switcher-item-main {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.chat-switcher-item-top {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
}

.chat-switcher-item-title {
  min-width: 0;
  flex: 1;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-switcher-item-bottom {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 4px;
}

.chat-switcher-item-subtitle {
  max-width: 120px;
  font-size: 11px;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-switcher-badge {
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--bg-hover);
  color: var(--text-secondary);
  font-size: 10px;
  line-height: 1.2;
}

.chat-switcher-badge.generating {
  background: rgba(var(--color-success-rgb, 16, 185, 129), 0.15);
  color: var(--color-success);
}

.chat-switcher-item-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.chat-switcher-item:hover .chat-switcher-item-actions,
.chat-switcher-item.active .chat-switcher-item-actions {
  opacity: 1;
}

.chat-switcher-item-actions :deep(.btn--icon) {
  width: 20px;
  height: 20px;
  min-width: 20px;
  min-height: 20px;
  border-radius: 4px;
}

.chat-switcher-item-actions :deep(.btn--icon svg) {
  width: 12px;
  height: 12px;
}

.chat-switcher-empty {
  padding: 24px 12px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 12px;
}

.pending-icon {
  width: 14px;
  height: 14px;
  color: var(--color-primary);
}

.pending-title {
  font-weight: 500;
}

.pending-status {
  margin-left: auto;
  color: var(--text-tertiary);
  font-style: italic;
}

.pending-messages-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pending-message-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: var(--bg-hover);
  border-radius: 8px;
  font-size: 12px;
  transition: background-color 0.2s;
}

.pending-message-item:hover {
  background: var(--bg-active);
}

.pending-message-text {
  color: var(--text-primary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-right: 8px;
}

.pending-message-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.guide-btn {
  color: var(--color-primary);
}

.guide-btn:hover {
  color: var(--color-primary);
  opacity: 0.9;
}

.remove-btn {
  opacity: 0.6;
  transition: opacity 0.2s;
}

.remove-btn:hover {
  opacity: 1;
  color: var(--color-danger);
}

.input-container {
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
  display: flex;
  flex-direction: column;
  transition:
    border 0.2s,
    box-shadow 0.2s;
  position: relative;
}

.input-container:focus-within {
  border-color: var(--border-focus);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
}

.input-container.drag-over {
  border-color: var(--color-primary);
  background-color: rgba(var(--color-primary-rgb, 0, 123, 255), 0.05);
}

.drag-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(var(--color-primary-rgb, 0, 123, 255), 0.1);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  pointer-events: none;
}

.drag-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--color-primary);
  font-weight: 500;
}

.drag-message svg {
  width: 32px;
  height: 32px;
}

.input-wrapper {
  position: relative;
  width: 100%;
}

.partial-text {
  position: absolute;
  left: 8px;
  top: 8px;
  color: var(--text-tertiary);
  pointer-events: none;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  opacity: 0.7;
}

.input-field {
  border: none;
  outline: none;
  width: 100%;
  padding: 8px;
  font-size: 12px;
  font-family: var(--font-stack);
  resize: none;
  min-height: 24px;
  max-height: 120px;
  overflow-y: auto;
  line-height: 1.4;
  background: transparent;
  color: var(--text-primary);
}

.input-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 6px;
  margin-top: 4px;
  border-top: 1px solid var(--border-color-light);
}

.action-left {
  display: flex;
  align-items: center;
  gap: 4px;
}

.action-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.token-usage-popover {
  position: relative;
  display: inline-flex;
}

.token-usage-btn {
  color: var(--text-tertiary);
}

.token-usage-btn:hover {
  color: var(--text-primary);
}

.token-usage-panel {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 10px);
  transform: translateX(-50%) translateY(4px);
  min-width: 150px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border-subtle);
  background: color-mix(in srgb, var(--bg-card) 96%, white);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.14);
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
  z-index: 20;
}

.token-usage-popover:hover .token-usage-panel,
.token-usage-popover:focus-within .token-usage-panel {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

.token-usage-panel-title {
  margin-bottom: 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-primary);
}

.token-usage-panel-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 11px;
  color: var(--text-secondary);
}

.token-usage-panel-row+.token-usage-panel-row {
  margin-top: 6px;
}

.token-usage-panel-row strong {
  color: var(--text-primary);
  font-weight: 700;
}

.token-usage-panel-empty {
  font-size: 11px;
  color: var(--text-tertiary);
}

.stop-all-btn:not(.is-idle) {
  color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 12%, transparent);
}

.stop-all-btn:not(.is-idle):hover {
  background: color-mix(in srgb, var(--color-danger) 18%, transparent);
}

.stop-all-btn.is-idle {
  color: var(--text-secondary);
  background: transparent;
  opacity: 0.45;
}

.tool-features-active {
  color: var(--color-primary);
  background-color: rgba(var(--color-primary-rgb, 0, 123, 255), 0.1);
}

.options-active {
  color: var(--color-primary);
  background-color: rgba(var(--color-primary-rgb, 0, 123, 255), 0.1);
}

.voice-active {
  color: var(--color-primary);
  background-color: rgba(var(--color-primary-rgb, 0, 123, 255), 0.1);
  animation: pulse 1.5s infinite;
}

.speech-active {
  color: var(--color-primary);
  background-color: rgba(var(--color-primary-rgb, 0, 123, 255), 0.1);
}

.workpath-trigger {
  height: 24px;
  min-height: 24px;
  max-width: 120px;
  padding: 2px 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-stack);
  font-size: 11px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1;
  cursor: pointer;
  transition: all 0.2s ease;
}

.workpath-trigger:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.workpath-active {
  color: var(--color-primary);
  background-color: rgba(var(--color-primary-rgb, 0, 123, 255), 0.1);
}

@keyframes pulse {

  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.6;
  }
}

.mobile-input-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-input);
  border: 1px solid var(--border-color-light);
  border-radius: 16px;
  padding: 7px;
}

.mobile-top-drop-zone {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 10px;
}

.mobile-top-left-zone,
.mobile-top-right-zone {
  flex-shrink: 0;
}

.mobile-input-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  position: relative;
  min-width: 0;
}

.mobile-input-field {
  min-height: 38px;
  font-size: 14px;
  padding: 8px 8px;
  white-space: nowrap;
  overflow-x: auto;
  overflow-y: hidden;
}

.mobile-partial-text {
  top: 7px;
}

.mobile-tools-panel {
  margin-top: 8px;
  display: grid;
  grid-template-columns: repeat(6, minmax(40px, 1fr));
  justify-items: center;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border-radius: 16px;
  border: 1px solid var(--border-color-light);
  background: var(--bg-input);
}

.mobile-drag-tool {
  display: inline-flex;
  touch-action: none;
  transition:
    transform 0.12s ease,
    opacity 0.12s ease;
  user-select: none;
}

.mobile-drag-tool.is-long-pressing {
  opacity: 0.75;
}

.mobile-drag-tool.is-dragging {
  opacity: 0.55;
  transform: scale(0.94);
}

.mobile-drop-active {
  outline: 1px dashed color-mix(in srgb, var(--color-primary) 52%, transparent);
  outline-offset: 2px;
}

.mobile-drop-hover {
  background: color-mix(in srgb, var(--color-primary) 12%, var(--bg-input));
}

.mobile-drag-ghost {
  position: fixed;
  z-index: 30;
  transform: translate(-50%, -50%);
  pointer-events: none;
  min-width: 56px;
  height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 45%, var(--border-subtle));
  background: color-mix(in srgb, var(--bg-card) 92%, #ffffff);
  color: var(--text-primary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.16);
}

.mobile-send-btn {
  flex-shrink: 0;
  border-radius: 12px;
  min-width: 58px;
  height: 40px;
}

.mobile-toggle-open {
  transform: rotate(180deg);
  transition: transform 0.2s ease;
}

.footer.is-mobile .input-container {
  background: transparent;
  border: none;
  box-shadow: none;
  padding: 0;
}

.footer.is-mobile {
  padding-bottom: calc(8px + max(env(safe-area-inset-bottom), var(--safe-area-bottom, 0px)));
}

@media (max-width: 767px) {
  .footer {
    padding: 8px;
  }

  .input-container {
    border-radius: 22px;
    padding: 10px;
    background: var(--bg-card);
    border: none;
    box-shadow: none;
  }

  .mobile-tools-panel :deep(button),
  .mobile-input-bar :deep(button:not(.mobile-send-btn)) {
    width: 40px;
    height: 40px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
  }
}

:global(.dark-mode) .mobile-input-bar {
  background: color-mix(in srgb, var(--bg-card) 82%, #141519);
  border-color: var(--border-subtle);
}

:global(.dark-mode) .mobile-tools-panel {
  background: color-mix(in srgb, var(--bg-card) 82%, #141519);
  border-color: var(--border-subtle);
}

:global(.dark-mode) .footer.is-mobile .input-container {
  background: transparent;
  border: none;
  box-shadow: none;
}
</style>
