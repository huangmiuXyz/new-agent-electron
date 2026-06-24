<template>
  <span ref="wrapperRef" class="markdown-stream-wrapper">
    <IncremarkRenderer
      :blocks="blocks"
      :components="codeBlockComponents"
    />
    <span
      v-if="streaming"
      class="markdown-stream-caret"
      :style="caretStyle"
      aria-hidden="true"
    ></span>
  </span>
</template>
<script setup lang="ts">
import { useIncremark } from '@incremark/vue'
import { TextUIPart } from 'ai'
import CodeBlockAdapter from './CodeBlockAdapter.vue'
import IncremarkRenderer from './IncremarkRenderer.vue'

const props = defineProps<{
  block: TextUIPart
  message: BaseMessage
  streaming?: boolean
}>()

const codeBlockComponents = {
  code: CodeBlockAdapter
}

const incremark = useIncremark({
  gfm: true
})

const { blocks } = incremark

const wrapperRef = ref<HTMLElement | null>(null)
const caretStyle = ref<Record<string, string>>({})
let caretFrameId: number | null = null

const findLastTextNode = (root: HTMLElement): Text | null => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const text = node.textContent ?? ''
      return text.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
    }
  })

  let lastNode: Text | null = null
  while (walker.nextNode()) {
    lastNode = walker.currentNode as Text
  }
  return lastNode
}

const updateCaretPosition = () => {
  if (!props.streaming || !wrapperRef.value) return

  const wrapper = wrapperRef.value
  const lastTextNode = findLastTextNode(wrapper)
  if (!lastTextNode || !lastTextNode.textContent) return

  const range = document.createRange()
  const length = lastTextNode.textContent.length
  range.setStart(lastTextNode, Math.max(0, length - 1))
  range.setEnd(lastTextNode, length)

  const rect = range.getBoundingClientRect()
  const wrapperRect = wrapper.getBoundingClientRect()
  range.detach()

  if (rect.width === 0 && rect.height === 0) return

  caretStyle.value = {
    left: `${rect.right - wrapperRect.left + 2}px`,
    top: `${rect.top - wrapperRect.top + 2}px`,
    height: `${Math.max(14, rect.height - 2)}px`
  }
}

const scheduleCaretPosition = () => {
  if (caretFrameId !== null) return
  caretFrameId = requestAnimationFrame(() => {
    caretFrameId = null
    updateCaretPosition()
  })
}

watch(
  () => [props.streaming, props.block.text],
  () => {
    nextTick(scheduleCaretPosition)
  },
  { immediate: true }
)

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
    nextTick(scheduleCaretPosition)
    return
  }

  // 积压越多速度越快，同时按帧间隔平滑消费，避免大 chunk 突然跳字。
  const batchSize = getNextBatchSize(pendingChunk.length, frameTime)
  const batch = pendingChunk.slice(0, batchSize)
  pendingChunk = pendingChunk.slice(batchSize)

  incremark.append(batch)

  nextTick(scheduleCaretPosition)
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
  if (caretFrameId !== null) {
    cancelAnimationFrame(caretFrameId)
    caretFrameId = null
  }
})
</script>

<style scoped>
.markdown-stream-wrapper {
  display: block;
  max-width: 100%;
  position: relative;
}

.markdown-stream-caret {
  position: absolute;
  width: 2px;
  min-height: 14px;
  background-color: var(--accent-color);
  border-radius: 1px;
  pointer-events: none;
  animation: motion-caret-blink 1s steps(2, start) infinite;
}
</style>
