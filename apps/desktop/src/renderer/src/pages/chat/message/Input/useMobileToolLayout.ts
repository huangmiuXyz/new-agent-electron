import { computed, ref, watch, type Ref } from 'vue'
import { useLocalStorage } from '@vueuse/core'

export type MobileDragToolId =
  | 'upload'
  | 'inputAudio'
  | 'voice'
  | 'thinking'
  | 'settings'
  | 'speech'
  | 'playlist'
  | 'agent'
  | 'model'
  | 'stop'

type MobileDropZone = 'top-left' | 'top-right' | 'bottom'

type MobileToolLayoutStorage = {
  topLeft: MobileDragToolId[]
  topRight: MobileDragToolId[]
  bottom: MobileDragToolId[]
}

const MOBILE_LONG_PRESS_MS = 380
const MOBILE_POINTER_MOVE_CANCEL_PX = 10
const MOBILE_TOP_MAX_TOOLS = 4
const MOBILE_TOOL_LAYOUT_STORAGE_KEY = 'chat.mobile.tool-layout.v1'

const mobileToolOrder: MobileDragToolId[] = [
  'upload',
  'inputAudio',
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
  inputAudio: '音频',
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
  topLeft: ['upload', 'inputAudio', 'voice'],
  topRight: [],
  bottom: ['thinking', 'settings', 'speech', 'playlist', 'agent', 'model', 'stop']
}

const normalizeMobileToolList = (list: unknown): MobileDragToolId[] => {
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

const normalizeMobileLayout = (layout: unknown): MobileToolLayoutStorage => {
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
  return {
    topLeft: keptTop.filter((toolId) => uniqueTopLeft.includes(toolId)),
    topRight: keptTop.filter((toolId) => uniqueTopRight.includes(toolId)),
    bottom: [...overflowTop, ...uniqueBottom, ...missing]
  }
}

export const useMobileToolLayout = (options: {
  isMobile: Ref<boolean>
  showMobileTools: Ref<boolean>
  topBarRef: Ref<HTMLElement | null>
  topLeftZoneRef: Ref<HTMLElement | null>
  topRightZoneRef: Ref<HTMLElement | null>
  bottomZoneRef: Ref<HTMLElement | null>
}) => {
  const mobileToolLayout = useLocalStorage<MobileToolLayoutStorage>(
    MOBILE_TOOL_LAYOUT_STORAGE_KEY,
    defaultMobileLayout
  )
  const normalizedMobileLayout = normalizeMobileLayout(mobileToolLayout.value)
  const mobileTopLeftTools = ref<MobileDragToolId[]>(normalizedMobileLayout.topLeft)
  const mobileTopRightTools = ref<MobileDragToolId[]>(normalizedMobileLayout.topRight)
  const mobileBottomTools = ref<MobileDragToolId[]>(normalizedMobileLayout.bottom)
  const longPressTimer = ref<number | null>(null)
  const longPressPointerId = ref<number | null>(null)
  const longPressToolId = ref<MobileDragToolId | null>(null)
  const longPressStartPoint = ref<{ x: number; y: number } | null>(null)
  const draggingToolId = ref<MobileDragToolId | null>(null)
  const suppressMobileToolClick = ref(false)
  const mobileDragPointer = ref({ x: 0, y: 0 })
  const mobileHoverDropZone = ref<MobileDropZone | null>(null)

  const mobileLayoutSnapshot = computed<MobileToolLayoutStorage>(() => ({
    topLeft: [...mobileTopLeftTools.value],
    topRight: [...mobileTopRightTools.value],
    bottom: [...mobileBottomTools.value]
  }))
  const isMobileToolDragging = computed(() => !!draggingToolId.value)
  const mobileDraggingToolLabel = computed(() =>
    draggingToolId.value ? mobileToolLabelMap[draggingToolId.value] : ''
  )

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

  const resolveDropZoneByPoint = (x: number, y: number): MobileDropZone | null => {
    const target = document.elementFromPoint(x, y) as HTMLElement | null
    if (!target) return null
    if (options.topLeftZoneRef.value?.contains(target)) return 'top-left'
    if (options.topRightZoneRef.value?.contains(target)) return 'top-right'
    if (options.topBarRef.value?.contains(target)) {
      const topBarRect = options.topBarRef.value.getBoundingClientRect()
      return x >= topBarRect.right - 120 ? 'top-right' : 'top-left'
    }
    if (options.bottomZoneRef.value?.contains(target)) return 'bottom'
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
    if (dropZone) moveMobileToolToZone(draggingToolId.value, dropZone)
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

  const startDraggingTool = (toolId: MobileDragToolId) => {
    draggingToolId.value = toolId
    suppressMobileToolClick.value = true
    options.showMobileTools.value = true
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
    if (!options.isMobile.value || event.button !== 0) return
    const target = event.target as HTMLElement | null
    if (target?.closest('.modal-overlay, .selector-popup')) return
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

  const onMobileToolPointerUp = (event: PointerEvent) => {
    if (draggingToolId.value) finalizeMobileToolDrag(event)
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

  const handleMobileToolWrapperClickCapture = (event: MouseEvent) => {
    if (!suppressMobileToolClick.value) return
    event.preventDefault()
    event.stopPropagation()
  }

  return {
    mobileTopLeftTools,
    mobileTopRightTools,
    mobileBottomTools,
    draggingToolId,
    mobileDragPointer,
    mobileHoverDropZone,
    isMobileToolDragging,
    mobileDraggingToolLabel,
    mobileToolClass,
    onMobileToolPointerDown,
    onMobileToolPointerCancel,
    handleMobileToolWrapperClickCapture,
    suppressMobileToolClick,
    clearLongPressTimer,
    unbindMobilePointerListeners
  }
}
