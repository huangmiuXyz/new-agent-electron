<script setup lang="tsx">
import { FileUIPart, TextUIPart } from 'ai'
import AtPanel from './AtPanel.vue'
import { useContinuousVoiceRecorder } from '@renderer/composables/useContinuousVoiceRecorder'
import { useShortcuts } from '@renderer/composables/useShortcuts'
import { usePlugins } from '@renderer/composables/usePlugins'
import { createRegistry } from '@renderer/services/chatService/registry'
import { getFlatTokenUsage } from '@renderer/services/chatService/tokenUsage'
import { discoverSkills, type SkillMetadata } from '@renderer/services/skillsService'
import { z } from 'zod'

const message = ref('')
const chatStore = useChatsStores()
const { triggerHook } = usePlugins()
const selectedFiles = ref<Array<UploadFile>>([])

const {
  thinkingMode,
  speechEnabled,
  providerOptions: allProviderOptions,
  display,
  defaultModels
} = storeToRefs(useSettingsStore())
const agentStore = useAgentStore()
const { updateThinkingMode, updateSpeechEnabled, updateProviderOptions } = useSettingsStore()
const settingsStore = useSettingsStore()
const currentChatAgent = computed(() => {
  const agentId = chatStore.currentChat?.agentId
  return agentId ? agentStore.getAgentById(agentId) : null
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
    if (!providerId || !settingsStore.getProviderById(providerId)?.models?.some((m) => m.id === value)) {
      const provider = settingsStore.getAllProviders.find((p) => p.models?.some((m) => m.id === value))
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
const currentChatTokenUsage = computed(() => {
  const totals = (chatStore.currentChat?.messages || [])
    .filter((message) => !message.metadata?.deletedAt)
    .reduce(
      (acc, message) => {
        const usage = getFlatTokenUsage(message.metadata?.usage)
        acc.total += usage.totalTokens || 0
        acc.input += usage.inputTokens || 0
        acc.output += usage.outputTokens || 0
        return acc
      },
      { total: 0, input: 0, output: 0 }
    )

  return {
    ...totals,
    hasUsage: totals.total > 0 || totals.input > 0 || totals.output > 0,
    totalDisplay: numberFormatter.format(totals.total),
    inputDisplay: numberFormatter.format(totals.input),
    outputDisplay: numberFormatter.format(totals.output),
    tooltip: totals.total > 0 || totals.input > 0 || totals.output > 0
      ? [
          '当前聊天总 Token',
          `总计: ${numberFormatter.format(totals.total)}`,
          `输入: ${numberFormatter.format(totals.input)}`,
          `输出: ${numberFormatter.format(totals.output)}`
        ].join('\n')
      : '当前聊天总 Token\n暂无可用统计'
  }
})

const speechStore = useSpeechStore()
const modal = useModal()

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

// 图标
const FileUploadIcon = useIcon('Folder')
const Bulb = useIcon('Bulb')
const MicIcon = useIcon('Mic')
const MicOffIcon = useIcon('MicOff')
const VolumeIcon = useIcon('VolumeMedium')
const VolumeMuteIcon = useIcon('VolumeMute')
const CloseIcon = useIcon('Close')
const PendingIcon = useIcon('FormatListBulleted')
const SettingsIcon = useIcon('Settings')
const PlaylistIcon = useIcon('Menu')
const StopIcon = useIcon('Stop')
const ChevronDown = useIcon('ChevronDown')

// 引入子组件
const fileUploadRef = useTemplateRef('fileUploadRef')
const inputContainerRef = useTemplateRef('inputContainerRef')
const textareaRef = useTemplateRef('textareaRef')

const SKILL_MENTION_REGEX = /(^|[\s([{'"“‘])@([a-z0-9-]*)$/i
const SKILL_MENTION_NAMESPACE_REGEX = /(^|[\s([{'"“‘])@(skills|技能):([a-z0-9-]*)$/i

const availableSkills = computed<SkillMetadata[]>(() => {
  void currentChatAgent.value?.id
  void currentChatAgent.value?.skillDirectory
  void chatStore.currentChat?.id
  return discoverSkills()
})
const isSkillMentionOpen = ref(false)
const isSkillMentionChildOpen = ref(false)
const skillMentionQuery = ref('')
const skillMentionActiveIndex = ref(0)
const skillMentionRange = ref<{ start: number, end: number } | null>(null)
let skillMentionCloseTimer: ReturnType<typeof setTimeout> | null = null

const filteredMentionSkills = computed(() => {
  const query = skillMentionQuery.value.trim().toLowerCase()
  const exactMatches = availableSkills.value.filter((skill) => skill.name.toLowerCase() === query)
  const fuzzyMatches = availableSkills.value.filter((skill) => {
    const name = skill.name.toLowerCase()
    const description = skill.description.toLowerCase()
    if (!query) return true
    return name.includes(query) || description.includes(query)
  })
  return query ? [...exactMatches, ...fuzzyMatches.filter((skill) => !exactMatches.includes(skill))] : fuzzyMatches
})

const closeSkillMention = () => {
  isSkillMentionOpen.value = false
  isSkillMentionChildOpen.value = false
  skillMentionQuery.value = ''
  skillMentionActiveIndex.value = 0
  skillMentionRange.value = null
}

const openSkillMentionChild = () => {
  if (!isSkillMentionOpen.value) return
  isSkillMentionChildOpen.value = true
  if (skillMentionActiveIndex.value >= filteredMentionSkills.value.length) {
    skillMentionActiveIndex.value = 0
  }
}

const clearSkillMentionCloseTimer = () => {
  if (!skillMentionCloseTimer) return
  clearTimeout(skillMentionCloseTimer)
  skillMentionCloseTimer = null
}

const scheduleSkillMentionClose = () => {
  clearSkillMentionCloseTimer()
  skillMentionCloseTimer = setTimeout(() => {
    closeSkillMention()
  }, 120)
}

const updateSkillMentionState = () => {
  const textarea = textareaRef.value
  if (!textarea) {
    closeSkillMention()
    return
  }

  const cursor = textarea.selectionStart ?? message.value.length
  const beforeCursor = message.value.slice(0, cursor)
  const namespacedMatch = beforeCursor.match(SKILL_MENTION_NAMESPACE_REGEX)
  if (namespacedMatch) {
    const query = namespacedMatch[3] || ''
    const start = cursor - query.length - namespacedMatch[2].length - 2
    skillMentionQuery.value = query
    skillMentionRange.value = { start, end: cursor }
    isSkillMentionOpen.value = availableSkills.value.length > 0
    isSkillMentionChildOpen.value = isSkillMentionOpen.value
    return
  }

  const match = beforeCursor.match(SKILL_MENTION_REGEX)

  if (!match) {
    closeSkillMention()
    return
  }

  const query = match[2] || ''
  const start = cursor - query.length - 1
  skillMentionQuery.value = query
  skillMentionRange.value = { start, end: cursor }
  isSkillMentionOpen.value = availableSkills.value.length > 0
  isSkillMentionChildOpen.value = isSkillMentionOpen.value
}

const insertSkillMention = (skill: SkillMetadata) => {
  const textarea = textareaRef.value
  const range = skillMentionRange.value
  if (!textarea || !range) return

  const mentionText = `@skills:${skill.name} `
  message.value = `${message.value.slice(0, range.start)}${mentionText}${message.value.slice(range.end)}`
  closeSkillMention()

  nextTick(() => {
    const cursor = range.start + mentionText.length
    textarea.focus()
    textarea.setSelectionRange(cursor, cursor)
    adjustTextareaHeight(textarea)
  })
}

watch(filteredMentionSkills, (skills) => {
  if (!skills.length) {
    skillMentionActiveIndex.value = 0
    return
  }
  if (skillMentionActiveIndex.value >= skills.length) {
    skillMentionActiveIndex.value = 0
  }
})

watch(message, () => {
  if (!isSkillMentionOpen.value) return
  nextTick(() => {
    updateSkillMentionState()
  })
})

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

const stopAllGeneratingInCurrentChat = () => {
  const chatId = chatStore.currentChat?.id
  if (!chatId) return
  chatStore.stopGeneratingInChatScope(chatId)
}

// 获取预发送消息的文本预览
const getPendingMessagePreview = (parts: Array<FileUIPart | TextUIPart>): string => {
  const textParts = parts.filter((p): p is TextUIPart => p.type === 'text')
  const fileParts = parts.filter((p): p is FileUIPart => p.type === 'file')

  let preview = textParts.map(p => p.text).join(' ')
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
  bottom: [
    'thinking',
    'settings',
    'speech',
    'playlist',
    'agent',
    'model',
    'stop'
  ]
}
const mobileToolLayout = useLocalStorage<MobileToolLayoutStorage>(MOBILE_TOOL_LAYOUT_STORAGE_KEY, defaultMobileLayout)

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
  const uniqueBottom = bottom.filter((toolId) => !uniqueTopLeft.includes(toolId) && !uniqueTopRight.includes(toolId))
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
const longPressStartPoint = ref<{ x: number, y: number } | null>(null)
const draggingToolId = ref<MobileDragToolId | null>(null)
const suppressMobileToolClick = ref(false)
const mobileDragPointer = ref<{ x: number, y: number }>({ x: 0, y: 0 })
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
  const wasInTop = mobileTopLeftTools.value.includes(toolId) || mobileTopRightTools.value.includes(toolId)
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
  if (toolId === 'thinking') return updateThinkingMode(!thinkingMode.value)
  if (toolId === 'settings') return openProviderOptionsModal()
  if (toolId === 'speech') return toggleSpeech()
  if (toolId === 'playlist') {
    display.value.speechSidebarCollapsed = !display.value.speechSidebarCollapsed
    return
  }
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

const { start: startVoice, stop: stopVoice, state: voiceState, isActive: voiceIsActive } = useContinuousVoiceRecorder({
  volumeThreshold: 0.02,
  silenceDuration: 800,
  onData: (data: Float32Array) => {
    if (!(window as any)._audioSampleRate) {
      (window as any)._audioSampleRate = new (window.AudioContext || (window as any).webkitAudioContext)().sampleRate
    }
    const sampleRate = (window as any)._audioSampleRate
    triggerHook('speech.stream.data', { data, sampleRate })
  },
  onStart: async () => {
    if (!(window as any)._audioSampleRate) {
      (window as any)._audioSampleRate = new (window.AudioContext || (window as any).webkitAudioContext)().sampleRate
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

const adjustTextareaHeight = (target: Event | HTMLTextAreaElement | null | undefined) => {
  const textarea = target instanceof HTMLTextAreaElement
    ? target
    : (target?.target as HTMLTextAreaElement | null)
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
  if (currentChatModel.value?.name) return `${currentChatAgent.value?.name || '对话'} · ${currentChatModel.value.name}`
  return '发消息或按住说话...'
})

const handleCompositionStart = () => {
  isComposing.value = true
}

const handleCompositionEnd = () => {
  isComposing.value = false
}

const handleTextareaInput = (event: Event) => {
  adjustTextareaHeight(event)
  updateSkillMentionState()
}

const handleTextareaKeydown = (event: KeyboardEvent) => {
  if (isSkillMentionOpen.value && isSkillMentionChildOpen.value && filteredMentionSkills.value.length > 0) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      skillMentionActiveIndex.value = (skillMentionActiveIndex.value + 1) % filteredMentionSkills.value.length
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      skillMentionActiveIndex.value =
        (skillMentionActiveIndex.value - 1 + filteredMentionSkills.value.length) % filteredMentionSkills.value.length
      return
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      insertSkillMention(filteredMentionSkills.value[skillMentionActiveIndex.value])
      return
    }
  }

  if (event.key === 'Escape' && isSkillMentionOpen.value) {
    event.preventDefault()
    if (isSkillMentionChildOpen.value) {
      isSkillMentionChildOpen.value = false
      return
    }
    closeSkillMention()
    return
  }

  if (isSkillMentionOpen.value && !isSkillMentionChildOpen.value && (event.key === 'Enter' || event.key === 'Tab' || event.key === 'ArrowRight')) {
    event.preventDefault()
    openSkillMentionChild()
    return
  }

  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    if (isComposing.value) return
    _sendMessage()
  }
}

const _sendMessage = async () => {
  if (!currentChatModel.value) {
    messageApi.error('请先选择模型')
    return
  }

  const input = message.value.trim()
  const hasContent = input || selectedFiles.value.length > 0

  if (!hasContent) return

  // 构建消息parts
  const parts: Array<FileUIPart | TextUIPart> = []

  if (input) {
    parts.push({ type: 'text', text: input })
  }

  for (const file of selectedFiles.value) {
    const { path, name, url, ...aiPart } = file

    const res = await fetch(path ?? url!)
    const buffer = new Uint8Array(await res.arrayBuffer())

    // 通过文件扩展名判断是否为文本文件
    if (isTextFile(name!)) {
      const text = new TextDecoder('utf-8').decode(buffer)
      parts.push({ type: 'text', text })
    }

    parts.push({
      ...aiPart,
      url: path ?? url
    } as FileUIPart)
  }

  // 清空输入
  message.value = ''
  closeSkillMention()
  selectedFiles.value = []
  nextTick(() => {
    adjustTextareaHeight(textareaRef.value)
  })

  // 确保有聊天会话
  if (chatStore.chats.length === 0) {
    chatStore.createChat()
  }

  const chatId = chatStore.currentChat!.id!
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
  clearSkillMentionCloseTimer()
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
          <Button variant="icon" size="sm" class="remove-btn" @click="removePendingMessage(item.id)">
            <CloseIcon />
          </Button>
        </div>
      </div>
    </div>

    <div class="input-container" ref="inputContainerRef"
      :class="{ 'drag-over': fileUploadRef?.isDragOver || fileUploadRef?.isOverDropZone }">
      <FileUpload ref="fileUploadRef" :files="selectedFiles" :dropZoneRef="inputContainerRef!" :inputRef="textareaRef!"
        @files-selected="handleFilesSelected" @remove="handleFileRemoved" />

      <div v-if="!isMobile">
        <div class="input-wrapper">
          <AtPanel
            v-if="isSkillMentionOpen"
            :skills="filteredMentionSkills"
            :active-index="skillMentionActiveIndex"
            :child-open="isSkillMentionChildOpen"
            @open-child="openSkillMentionChild"
            @select="insertSkillMention"
          />
          <textarea ref="textareaRef" class="input-field" rows="1"
            :placeholder="desktopPlaceholder"
            v-model="message" @input="handleTextareaInput" @keydown="handleTextareaKeydown"
            @focus="updateSkillMentionState" @click="updateSkillMentionState" @blur="scheduleSkillMentionClose"
            @compositionstart="handleCompositionStart" @compositionend="handleCompositionEnd"
            :disabled="isProcessingVoice"></textarea>
          <div v-if="partialSpeechText" class="partial-text">{{ partialSpeechText }}</div>
        </div>

        <div class="input-actions">
          <div class="action-left">
            <Button variant="icon" size="sm" @click="fileUploadRef?.triggerUpload!">
              <FileUploadIcon />
            </Button>
            <Button variant="icon" size="sm" :class="{ 'thinking-active': thinkingMode }"
              @click="updateThinkingMode(!thinkingMode)" title="思考模式">
              <Bulb />
            </Button>

            <Button variant="icon" size="sm" title="参数设置" @click="openProviderOptionsModal">
              <SettingsIcon />
            </Button>
            <div class="token-usage-popover">
              <Button
                variant="icon"
                size="sm"
                class="token-usage-btn"
                aria-label="当前聊天 Token 统计"
              >
                <InfoCircle />
              </Button>
              <div class="token-usage-panel">
                <div class="token-usage-panel-title">当前聊天 Token</div>
                <template v-if="currentChatTokenUsage.hasUsage">
                  <div class="token-usage-panel-row">
                    <span>总计</span>
                    <strong>{{ currentChatTokenUsage.totalDisplay }}</strong>
                  </div>
                  <div class="token-usage-panel-row">
                    <span>输入</span>
                    <span>{{ currentChatTokenUsage.inputDisplay }}</span>
                  </div>
                  <div class="token-usage-panel-row">
                    <span>输出</span>
                    <span>{{ currentChatTokenUsage.outputDisplay }}</span>
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

            <Button variant="icon" size="sm" :class="{ 'speech-active': !display.speechSidebarCollapsed }"
              @click="() => { display.speechSidebarCollapsed = !display.speechSidebarCollapsed }"
              :title="display.speechSidebarCollapsed ? '打开播放列表' : '关闭播放列表'">
              <PlaylistIcon />
            </Button>

            <Button
              v-if="isScopeGenerating"
              variant="icon"
              size="sm"
              class="stop-all-btn"
              title="停止当前聊天内全部生成"
              @click="stopAllGeneratingInCurrentChat"
            >
              <StopIcon />
            </Button>

            <ChatAgentSelector type="icon" />
            <ModelSelector type="icon" v-model:model-id="chatModelId" v-model:provider-id="chatProviderId" />
          </div>
          <div class="action-right">
            <Button variant="primary" size="md" @click="_sendMessage">
              {{ isGenerating && pendingMessages.length > 0 ? '加入队列' : '发送' }}
            </Button>
          </div>
        </div>
      </div>

      <div v-else>
        <div class="mobile-input-bar" ref="mobileTopBarRef"
          :class="{ 'mobile-drop-active': isMobileToolDragging }">
          <div class="mobile-top-drop-zone mobile-top-left-zone" ref="mobileTopLeftZoneRef"
            :class="{ 'mobile-drop-hover': mobileHoverDropZone === 'top-left' }">
            <template v-for="toolId in mobileTopLeftTools" :key="`top-left-${toolId}`">
              <div v-if="isMobileToolVisible(toolId)" class="mobile-drag-tool" :class="mobileToolClass(toolId)"
                @pointerdown="onMobileToolPointerDown(toolId, $event)" @pointercancel="onMobileToolPointerCancel"
                @click.capture="handleMobileToolWrapperClickCapture">
                <Button v-if="toolId === 'upload'" variant="icon" size="sm" @click="handleMobileToolClick('upload', $event)">
                  <FileUploadIcon />
                </Button>
                <Button v-else-if="toolId === 'voice'" variant="icon" size="sm" :class="{ 'voice-active': voiceIsActive }"
                  :title="voiceIsActive ? (isRecording ? '正在录制' : '正在监听') : '语音输入'"
                  @click="handleMobileToolClick('voice', $event)">
                  <MicIcon v-if="!voiceIsActive" />
                  <MicOffIcon v-else />
                </Button>
                <Button v-else-if="toolId === 'thinking'" variant="icon" size="sm" :class="{ 'thinking-active': thinkingMode }"
                  title="思考模式" @click="handleMobileToolClick('thinking', $event)">
                  <Bulb />
                </Button>
                <Button v-else-if="toolId === 'settings'" variant="icon" size="sm" title="参数设置"
                  @click="handleMobileToolClick('settings', $event)">
                  <SettingsIcon />
                </Button>
                <Button v-else-if="toolId === 'speech'" variant="icon" size="sm" :class="{ 'speech-active': speechEnabled }"
                  :title="speechEnabled ? '关闭语音播报' : '开启语音播报'" @click="handleMobileToolClick('speech', $event)">
                  <VolumeIcon v-if="speechEnabled" />
                  <VolumeMuteIcon v-else />
                </Button>
                <Button v-else-if="toolId === 'playlist'" variant="icon" size="sm"
                  :class="{ 'speech-active': !display.speechSidebarCollapsed }"
                  :title="display.speechSidebarCollapsed ? '打开播放列表' : '关闭播放列表'"
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
            <AtPanel
              v-if="isSkillMentionOpen"
              :skills="filteredMentionSkills"
              :active-index="skillMentionActiveIndex"
              :child-open="isSkillMentionChildOpen"
              mobile
              @open-child="openSkillMentionChild"
              @select="insertSkillMention"
            />
            <textarea ref="textareaRef" class="input-field mobile-input-field" rows="1"
              :placeholder="mobilePlaceholder"
              v-model="message" @input="handleTextareaInput" @keydown="handleTextareaKeydown"
              @focus="updateSkillMentionState" @click="updateSkillMentionState" @blur="scheduleSkillMentionClose"
              @compositionstart="handleCompositionStart" @compositionend="handleCompositionEnd"
              :disabled="isProcessingVoice"></textarea>
            <div v-if="partialSpeechText" class="partial-text mobile-partial-text">{{ partialSpeechText }}</div>
          </div>
          <div class="mobile-top-drop-zone mobile-top-right-zone"
            v-if="mobileTopRightTools.length > 0 || (isMobileToolDragging && mobileHoverDropZone === 'top-right')"
            ref="mobileTopRightZoneRef"
            :class="{ 'mobile-drop-hover': mobileHoverDropZone === 'top-right' }">
            <template v-for="toolId in mobileTopRightTools" :key="`top-right-${toolId}`">
              <div v-if="isMobileToolVisible(toolId)" class="mobile-drag-tool" :class="mobileToolClass(toolId)"
                @pointerdown="onMobileToolPointerDown(toolId, $event)" @pointercancel="onMobileToolPointerCancel"
                @click.capture="handleMobileToolWrapperClickCapture">
                <Button v-if="toolId === 'upload'" variant="icon" size="sm" @click="handleMobileToolClick('upload', $event)">
                  <FileUploadIcon />
                </Button>
                <Button v-else-if="toolId === 'voice'" variant="icon" size="sm" :class="{ 'voice-active': voiceIsActive }"
                  :title="voiceIsActive ? (isRecording ? '正在录制' : '正在监听') : '语音输入'"
                  @click="handleMobileToolClick('voice', $event)">
                  <MicIcon v-if="!voiceIsActive" />
                  <MicOffIcon v-else />
                </Button>
                <Button v-else-if="toolId === 'thinking'" variant="icon" size="sm" :class="{ 'thinking-active': thinkingMode }"
                  title="思考模式" @click="handleMobileToolClick('thinking', $event)">
                  <Bulb />
                </Button>
                <Button v-else-if="toolId === 'settings'" variant="icon" size="sm" title="参数设置"
                  @click="handleMobileToolClick('settings', $event)">
                  <SettingsIcon />
                </Button>
                <Button v-else-if="toolId === 'speech'" variant="icon" size="sm" :class="{ 'speech-active': speechEnabled }"
                  :title="speechEnabled ? '关闭语音播报' : '开启语音播报'" @click="handleMobileToolClick('speech', $event)">
                  <VolumeIcon v-if="speechEnabled" />
                  <VolumeMuteIcon v-else />
                </Button>
                <Button v-else-if="toolId === 'playlist'" variant="icon" size="sm"
                  :class="{ 'speech-active': !display.speechSidebarCollapsed }"
                  :title="display.speechSidebarCollapsed ? '打开播放列表' : '关闭播放列表'"
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

        <div v-if="showMobileTools" class="mobile-tools-panel" ref="mobileBottomZoneRef"
          :class="{ 'mobile-drop-active': isMobileToolDragging, 'mobile-drop-hover': mobileHoverDropZone === 'bottom' }">
          <template v-for="toolId in mobileBottomTools" :key="`bottom-${toolId}`">
            <div v-if="isMobileToolVisible(toolId)" class="mobile-drag-tool" :class="mobileToolClass(toolId)"
              @pointerdown="onMobileToolPointerDown(toolId, $event)" @pointercancel="onMobileToolPointerCancel"
              @click.capture="handleMobileToolWrapperClickCapture">
              <Button v-if="toolId === 'upload'" variant="icon" size="sm" @click="handleMobileToolClick('upload', $event)">
                <FileUploadIcon />
              </Button>
              <Button v-else-if="toolId === 'voice'" variant="icon" size="sm" :class="{ 'voice-active': voiceIsActive }"
                :title="voiceIsActive ? (isRecording ? '正在录制' : '正在监听') : '语音输入'"
                @click="handleMobileToolClick('voice', $event)">
                <MicIcon v-if="!voiceIsActive" />
                <MicOffIcon v-else />
              </Button>
              <Button v-else-if="toolId === 'thinking'" variant="icon" size="sm" :class="{ 'thinking-active': thinkingMode }"
                title="思考模式" @click="handleMobileToolClick('thinking', $event)">
                <Bulb />
              </Button>
              <Button v-else-if="toolId === 'settings'" variant="icon" size="sm" title="参数设置"
                @click="handleMobileToolClick('settings', $event)">
                <SettingsIcon />
              </Button>
              <Button v-else-if="toolId === 'speech'" variant="icon" size="sm" :class="{ 'speech-active': speechEnabled }"
                :title="speechEnabled ? '关闭语音播报' : '开启语音播报'" @click="handleMobileToolClick('speech', $event)">
                <VolumeIcon v-if="speechEnabled" />
                <VolumeMuteIcon v-else />
              </Button>
              <Button v-else-if="toolId === 'playlist'" variant="icon" size="sm"
                :class="{ 'speech-active': !display.speechSidebarCollapsed }"
                :title="display.speechSidebarCollapsed ? '打开播放列表' : '关闭播放列表'"
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
  transition: max-width 0.3s ease, margin 0.3s ease;
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
  transition: opacity 0.16s ease, transform 0.16s ease;
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

.token-usage-panel-row + .token-usage-panel-row {
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

.thinking-active {
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
  transition: transform 0.12s ease, opacity 0.12s ease;
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
