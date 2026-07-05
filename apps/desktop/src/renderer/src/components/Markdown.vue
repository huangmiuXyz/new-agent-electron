<template>
  <span class="markdown-stream-wrapper">
    <IncremarkRenderer
      :blocks="blocks"
      :components="codeBlockComponents"
      :text="block.text"
      :disable-translation="disableTranslation"
    />
  </span>
</template>
<script setup lang="ts">
import { useIncremark } from '@incremark/vue'
import { TextUIPart } from 'ai'
import CodeBlockAdapter from './CodeBlockAdapter.vue'
import IncremarkRenderer from './IncremarkRenderer.vue'

const props = withDefaults(defineProps<{
  block: TextUIPart
  message: BaseMessage
  streaming?: boolean
  disableTranslation?: boolean
}>(), {
  disableTranslation: true
})

const codeBlockComponents = {
  code: CodeBlockAdapter
}

const incremark = useIncremark({
  gfm: true
})

const { blocks } = incremark

let lastSourceText = ''
let finalized = false
let pendingChunk = ''
let charFrameId: number | null = null
let charFrameAt = 0
let charBudget = 0
let finalizeTimer: ReturnType<typeof setTimeout> | null = null

const FINALIZE_DELAY_MS = 120
const MIN_STREAM_CHARS_PER_SECOND = 90
const MAX_STREAM_CHARS_PER_SECOND = 1800
const STREAM_BACKLOG_SPEED_FACTOR = 4

const resetCharTiming = () => {
  charFrameAt = 0
  charBudget = 0
}

const getNextBatchSize = (remaining: number, frameTime: number) => {
  const elapsedMs = charFrameAt ? frameTime - charFrameAt : 16
  charFrameAt = frameTime

  const clampedElapsedMs = Math.min(Math.max(elapsedMs, 8), 48)
  const charsPerSecond = Math.min(
    MAX_STREAM_CHARS_PER_SECOND,
    Math.max(MIN_STREAM_CHARS_PER_SECOND, remaining * STREAM_BACKLOG_SPEED_FACTOR)
  )

  charBudget += (charsPerSecond * clampedElapsedMs) / 1000
  const batchSize = Math.min(remaining, Math.max(1, Math.floor(charBudget)))
  charBudget = Math.max(0, charBudget - batchSize)

  return batchSize
}

const cancelCharFrame = () => {
  if (charFrameId !== null) {
    cancelAnimationFrame(charFrameId)
    charFrameId = null
  }
  resetCharTiming()
}

const processNextChar = (frameTime: number) => {
  charFrameId = null
  if (!pendingChunk) {
    resetCharTiming()
    return
  }

  // 积压越多速度越快，同时按帧间隔平滑消费，避免大 chunk 突然跳字。
  const batchSize = getNextBatchSize(pendingChunk.length, frameTime)
  const batch = pendingChunk.slice(0, batchSize)
  pendingChunk = pendingChunk.slice(batchSize)

  incremark.append(batch)

  if (pendingChunk) {
    charFrameId = requestAnimationFrame(processNextChar)
  } else {
    resetCharTiming()
  }
}

const scheduleNextChar = () => {
  if (charFrameId !== null) return
  if (!pendingChunk) return
  charFrameId = requestAnimationFrame(processNextChar)
}

const cancelFinalizeTimer = () => {
  if (finalizeTimer) {
    clearTimeout(finalizeTimer)
    finalizeTimer = null
  }
}

const scheduleAppend = () => {
  // 已有逐字定时器在跑，新 chunk 会被 pendingChunk 累积，
  // 定时器自然逐个消费，无需额外动作。
  if (charFrameId !== null) return
  scheduleNextChar()
}

const finalizeFromFullText = () => {
  const finalText = props.block.text || ''
  pendingChunk = ''
  cancelCharFrame()
  incremark.reset()
  lastSourceText = ''

  if (finalText) {
    incremark.append(finalText)
    lastSourceText = finalText
  }

  incremark.finalize()
  finalized = true
}

const resetAndReplay = (nextText: string) => {
  pendingChunk = ''
  cancelCharFrame()
  incremark.reset()
  finalized = false
  lastSourceText = ''

  if (nextText) {
    pendingChunk = nextText
    lastSourceText = nextText
    scheduleNextChar()
  }
}

const updateMarkdown = (newText: string) => {
  const nextText = newText || ''

  // Non-streaming: render full text directly without typing animation
  if (!props.streaming) {
    if (nextText === lastSourceText) return
    pendingChunk = ''
    cancelCharFrame()
    cancelFinalizeTimer()
    incremark.reset()
    lastSourceText = nextText
    if (nextText) incremark.append(nextText)
    incremark.finalize()
    finalized = true
    return
  }

  // If late tokens arrive after finalize, replay from scratch to avoid losing the tail.
  if (finalized && nextText !== lastSourceText) {
    resetAndReplay(nextText)
    return
  }

  if (nextText === lastSourceText) return

  if (nextText.startsWith(lastSourceText)) {
    const chunk = nextText.slice(lastSourceText.length)
    lastSourceText = nextText
    if (chunk) {
      pendingChunk += chunk
      scheduleAppend()
    }
    return
  }

  // Upstream may mutate existing content instead of append-only updates.
  resetAndReplay(nextText)
}

const scheduleFinalize = () => {
  cancelFinalizeTimer()
  finalizeTimer = setTimeout(() => {
    if (props.block.state !== 'done') return
    finalizeFromFullText()
  }, FINALIZE_DELAY_MS)
}

watch(
  () => props.block.text,
  (text) => {
    updateMarkdown(text || '')
    if (props.block.state === 'done') {
      scheduleFinalize()
    }
  },
  { immediate: true }
)

watch(
  () => props.block.state,
  (state) => {
    if (state === 'done') {
      scheduleFinalize()
    } else {
      finalized = false
      cancelFinalizeTimer()
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  pendingChunk = ''
  cancelCharFrame()
  cancelFinalizeTimer()
  // 清理 incremark 内部状态（parser、completedBlocks、pendingBlocks、ast），
  // 避免长流式消息卸载后解析状态驻留导致内存泄漏
  incremark.reset()
})
</script>

<style scoped>
.markdown-stream-wrapper {
  display: block;
  max-width: 100%;
  position: relative;
}
</style>
