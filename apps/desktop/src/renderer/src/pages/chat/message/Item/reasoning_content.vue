<template>
  <div
    class="reasoning-block"
    :class="{ 'is-open': isReasoningExpanded }"
    @contextmenu="openReasoningContextMenu"
  >
    <div class="reasoning-header" @click="toggleReasoning">
      <div class="reasoning-label">
        <span class="reasoning-mark" aria-hidden="true">
          <Bulb class="reasoning-bulb" />
        </span>
        <span class="reasoning-text">思考过程</span>
      </div>
      <svg class="reasoning-toggle-icon" xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 256 256"
        fill="currentColor">
        <path
          d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z">
        </path>
      </svg>
    </div>
    <div class="reasoning-body" v-show="isReasoningExpanded">
      <VirtualParagraphText
        class="reasoning-virtual-text"
        :text="displayedReasoning"
        :height="reasoningViewportHeight"
        split-mode="blank-line"
        :font-size="11"
        :line-height="17"
        :bottomThreshold="1"
        :paragraph-padding-block="4"
        :paragraph-gap="2"
        :min-paragraph-height="21"
        stick-to-bottom
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { estimateParagraphHeight, splitTextIntoParagraphs } from '@renderer/composables/useParagraphVirtualText'

const { display } = storeToRefs(useSettingsStore())
const Bulb = useIcon('Bulb')
const Copy = useIcon('Copy')
const { showContextMenu } = useContextMenu()

const props = defineProps<{
  reasoning_content: string
  streaming?: boolean
  isLastReasoning?: boolean
}>()

const userInteracted = ref(false)
const userToggle = ref(display.value.expandThoughtByDefault)

watch(
  () => props.isLastReasoning,
  (val, oldVal) => {
    if (!val && oldVal) {
      userToggle.value = false
      userInteracted.value = false
    }
  }
)

const isReasoningExpanded = computed({
  get: () => {
    if (props.isLastReasoning && !userInteracted.value) return true
    return userToggle.value
  },
  set: (val: boolean) => {
    userInteracted.value = true
    userToggle.value = val
  }
})

// 逐字出现打字机效果
const displayedReasoning = ref('')
let reasoningCharFrameId: number | null = null
let lastReasoningSourceText = ''
let reasoningFrameAt = 0
let reasoningBudget = 0

const MIN_REASONING_CHARS_PER_SECOND = 90
const MAX_REASONING_CHARS_PER_SECOND = 1800
const REASONING_BACKLOG_SPEED_FACTOR = 4

const resetReasoningTiming = () => {
  reasoningFrameAt = 0
  reasoningBudget = 0
}

const getNextReasoningBatchSize = (remaining: number, frameTime: number) => {
  const elapsedMs = reasoningFrameAt ? frameTime - reasoningFrameAt : 16
  reasoningFrameAt = frameTime

  const clampedElapsedMs = Math.min(Math.max(elapsedMs, 8), 48)
  const charsPerSecond = Math.min(
    MAX_REASONING_CHARS_PER_SECOND,
    Math.max(MIN_REASONING_CHARS_PER_SECOND, remaining * REASONING_BACKLOG_SPEED_FACTOR)
  )

  reasoningBudget += (charsPerSecond * clampedElapsedMs) / 1000
  const batchSize = Math.min(remaining, Math.max(1, Math.floor(reasoningBudget)))
  reasoningBudget = Math.max(0, reasoningBudget - batchSize)

  return batchSize
}

const cancelReasoningCharFrame = () => {
  if (reasoningCharFrameId !== null) {
    cancelAnimationFrame(reasoningCharFrameId)
    reasoningCharFrameId = null
  }
  resetReasoningTiming()
}

const scheduleReasoningNextChar = () => {
  if (reasoningCharFrameId !== null) return
  reasoningCharFrameId = requestAnimationFrame((frameTime) => {
    reasoningCharFrameId = null
    const full = props.reasoning_content
    const current = displayedReasoning.value
    if (current.length >= full.length) {
      resetReasoningTiming()
      return
    }

    // 积压越多速度越快，同时按帧间隔平滑消费，避免大 chunk 突然跳字。
    const remaining = full.length - current.length
    const batchSize = getNextReasoningBatchSize(remaining, frameTime)
    displayedReasoning.value = full.slice(0, current.length + batchSize)
    if (displayedReasoning.value.length < full.length) {
      scheduleReasoningNextChar()
    } else {
      resetReasoningTiming()
    }
  })
}

watch(
  () => props.reasoning_content,
  (newText) => {
    lastReasoningSourceText = newText

    if (!props.streaming) {
      cancelReasoningCharFrame()
      displayedReasoning.value = newText
      return
    }

    if (!newText.startsWith(displayedReasoning.value)) {
      cancelReasoningCharFrame()
      displayedReasoning.value = newText ? newText.slice(0, 1) : ''
      scheduleReasoningNextChar()
      return
    }

    if (!displayedReasoning.value && newText) {
      displayedReasoning.value = newText.slice(0, 1)
    }

    scheduleReasoningNextChar()
  },
  { immediate: true }
)

watch(
  () => props.streaming,
  (isStreaming) => {
    if (!isStreaming) {
      cancelReasoningCharFrame()
      displayedReasoning.value = props.reasoning_content
      lastReasoningSourceText = props.reasoning_content
      return
    }

    if (props.reasoning_content !== lastReasoningSourceText) {
      lastReasoningSourceText = props.reasoning_content
      displayedReasoning.value = props.reasoning_content ? props.reasoning_content.slice(0, 1) : ''
      scheduleReasoningNextChar()
    }
  }
)

onBeforeUnmount(() => {
  cancelReasoningCharFrame()
})

const reasoningViewportHeight = computed(() => {
  const paragraphs = splitTextIntoParagraphs(displayedReasoning.value)
  const estimatedHeight = paragraphs.reduce(
    (total, paragraph) =>
      total +
      estimateParagraphHeight(paragraph.text, {
        containerWidth: 520,
        fontSize: 11,
        lineHeight: 17,
        paddingBlock: 4,
        gap: 2,
        minHeight: 21
      }),
    0
  )

  return Math.min(estimatedHeight, isMobile.value ? 260 : 360)
})

const toggleReasoning = () => {
  isReasoningExpanded.value = !isReasoningExpanded.value
}

const copyReasoningContent = () => {
  const text = props.reasoning_content.trim()
  if (!text) {
    messageApi.warning('暂无可复制的思考过程')
    return
  }

  copyText(text)
}

const openReasoningContextMenu = (event: MouseEvent) => {
  const hasReasoningContent = props.reasoning_content.trim().length > 0

  showContextMenu(event, [
    {
      label: '复制思考过程',
      icon: Copy,
      disabled: !hasReasoningContent,
      onClick: copyReasoningContent
    }
  ])
}
</script>

<style scoped>
.reasoning-block {
  width: 100%;
  max-width: 100%;
  margin: 2px 0 6px;
}

.reasoning-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 4px;
  width: 100%;
  min-height: 20px;
  padding: 2px 4px;
  border-radius: 4px;
  cursor: pointer;
  user-select: none;
  background-color: transparent;
  transition: background-color 0.2s;
}

.reasoning-header:hover {
  background-color: var(--bg-hover);
}

.reasoning-label {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
}

.reasoning-text {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.reasoning-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  flex: none;
  opacity: 0.8;
  margin-bottom: 2px;
}

.reasoning-bulb {
  width: 12px;
  height: 12px;
}

.reasoning-toggle-icon {
  color: var(--text-tertiary);
  transition: transform 0.2s ease;
}

.reasoning-block.is-open .reasoning-toggle-icon {
  transform: rotate(180deg);
}

.reasoning-body {
  padding-left: 10px;
  color: var(--text-secondary);
  background-color: transparent;
  border-top: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  border-left: 2px solid var(--border-color-light);
  margin-left: 9px;
}

.reasoning-virtual-text {
  color: var(--text-secondary);
  font-family: inherit;
  scrollbar-width: thin;
}

.reasoning-virtual-text :deep(.virtual-paragraph-text__paragraph) {
  color: var(--text-secondary);
}

@media (max-width: 767px) {
  .reasoning-virtual-text {
    touch-action: pan-y;
    -webkit-overflow-scrolling: touch;
  }
}
</style>
