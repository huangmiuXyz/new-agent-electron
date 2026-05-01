<template>
  <IncremarkRenderer
    :blocks="blocks"
    :customCodeBlocks="customCodeBlocks"
    :codeBlockConfigs="codeBlockConfigs"
  />
</template>
<script setup lang="ts">
import { useIncremark } from '@incremark/vue'
import { TextUIPart } from 'ai'
import CustomCodeBlock from './CustomCodeBlock.vue'
import IncremarkRenderer from './IncremarkRenderer.vue'
import { CUSTOM_CODE_BLOCK_COMPLETED_KEY } from './customCodeBlockCompletion'

const props = defineProps<{
  block: TextUIPart
  message: BaseMessage
}>()
const isBlockCompleted = computed(() => props.block.state === 'done')
provide(CUSTOM_CODE_BLOCK_COMPLETED_KEY, isBlockCompleted)

const customCodeBlocks = {
  html: CustomCodeBlock,
  htm: CustomCodeBlock
}

const codeBlockConfigs = {
  html: { takeOver: true },
  htm: { takeOver: true }
}

const incremark = useIncremark({
  gfm: true
})

const { blocks } = incremark

let lastSourceText = ''
let finalized = false
let pendingChunk = ''
let appendFrameId: number | null = null
let finalizeTimer: ReturnType<typeof setTimeout> | null = null

const FINALIZE_DELAY_MS = 120

const flushPendingChunk = () => {
  if (!pendingChunk) return
  incremark.append(pendingChunk)
  pendingChunk = ''
}

const cancelAppendFrame = () => {
  if (appendFrameId !== null) {
    cancelAnimationFrame(appendFrameId)
    appendFrameId = null
  }
}

const cancelFinalizeTimer = () => {
  if (finalizeTimer) {
    clearTimeout(finalizeTimer)
    finalizeTimer = null
  }
}

const scheduleAppend = () => {
  if (appendFrameId !== null) return
  appendFrameId = requestAnimationFrame(() => {
    appendFrameId = null
    flushPendingChunk()
    if (pendingChunk) {
      scheduleAppend()
    }
  })
}

const finalizeFromFullText = () => {
  const finalText = props.block.text || ''
  pendingChunk = ''
  cancelAppendFrame()
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
  cancelAppendFrame()
  incremark.reset()
  finalized = false
  lastSourceText = ''

  if (nextText) {
    pendingChunk = nextText
    lastSourceText = nextText
    scheduleAppend()
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
  cancelAppendFrame()
  cancelFinalizeTimer()
})

</script>
