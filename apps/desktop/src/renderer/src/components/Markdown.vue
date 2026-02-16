<template>
  <ThemeProvider :theme="incremarkTheme">
    <Incremark class="incremark" :blocks="blocks" :customCodeBlocks="customCodeBlocks"
      :codeBlockConfigs="codeBlockConfigs" />
  </ThemeProvider>
</template>
<script setup lang="ts">
import { useIncremark, Incremark, ThemeProvider } from '@incremark/vue'
import { TextUIPart } from 'ai'
import { useSettingsStore } from '../stores/settings'
import CustomCodeBlock from './CustomCodeBlock.vue'

const props = defineProps<{
  block: TextUIPart
  message: BaseMessage
}>()
const incremarkTheme = ref<any>('default')
const settingsStore = useSettingsStore()
const { display } = storeToRefs(settingsStore)

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

const lastSourceText = ref('')
const finalized = ref(false)
const pendingChunk = ref('')
let appendFrameId: number | null = null
let finalizeTimer: ReturnType<typeof setTimeout> | null = null

const FINALIZE_DELAY_MS = 120

const flushPendingChunk = () => {
  if (!pendingChunk.value) return
  incremark.append(pendingChunk.value)
  pendingChunk.value = ''
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
    if (pendingChunk.value) {
      scheduleAppend()
    }
  })
}

const finalizeFromFullText = () => {
  const finalText = props.block.text || ''
  pendingChunk.value = ''
  cancelAppendFrame()
  incremark.reset()
  lastSourceText.value = ''

  if (finalText) {
    incremark.append(finalText)
    lastSourceText.value = finalText
  }

  incremark.finalize()
  finalized.value = true
}

const resetAndReplay = (nextText: string) => {
  pendingChunk.value = ''
  cancelAppendFrame()
  incremark.reset()
  finalized.value = false
  lastSourceText.value = ''

  if (nextText) {
    pendingChunk.value = nextText
    lastSourceText.value = nextText
    scheduleAppend()
  }
}

const updateMarkdown = (newText: string) => {
  const nextText = newText || ''

  // If late tokens arrive after finalize, replay from scratch to avoid losing the tail.
  if (finalized.value && nextText !== lastSourceText.value) {
    resetAndReplay(nextText)
    return
  }

  if (nextText === lastSourceText.value) return

  if (nextText.startsWith(lastSourceText.value)) {
    const chunk = nextText.slice(lastSourceText.value.length)
    lastSourceText.value = nextText
    if (chunk) {
      pendingChunk.value += chunk
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
      finalized.value = false
      cancelFinalizeTimer()
    }
  },
  { immediate: true }
)

watch(() => display.value.darkMode, () => {
  incremarkTheme.value = display.value.darkMode ? 'dark' : 'default'
})

onMounted(() => {
  incremarkTheme.value = display.value.darkMode ? 'dark' : 'default'
})

onBeforeUnmount(() => {
  pendingChunk.value = ''
  cancelAppendFrame()
  cancelFinalizeTimer()
})

</script>
<style scoped>
.incremark {
  background-color: transparent !important;
  max-width: 100%;
  overflow-wrap: break-word;
}

.incremark :deep(pre) {
  white-space: pre !important;
  word-break: normal !important;
  overflow-wrap: normal !important;
  overflow-x: auto;
}

.incremark :deep(code) {
  white-space: pre !important;
  word-break: normal !important;
  overflow-wrap: normal !important;
}

.incremark :deep(table) {
  display: block;
  width: 100%;
  overflow-x: auto;
}

.incremark :deep(img) {
  max-width: 100%;
  height: auto;
}
</style>
