<template>
  <ThemeProvider :theme="incremarkTheme">
    <Incremark :blocks="blocks" :customCodeBlocks="customCodeBlocks" />
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

const incremark = useIncremark({
  gfm: true
})

const { blocks } = incremark

const lastTextLength = ref(0)

const updateMarkdown = (newText: string) => {
  if (newText.length < lastTextLength.value) {
    incremark.reset()
    lastTextLength.value = 0
  }
  const chunk = newText.slice(lastTextLength.value)
  if (chunk) {
    incremark.append(chunk)
    lastTextLength.value = newText.length
  }
}

watch(
  () => props.message,
  () => {
    console.log('Message state:', props.block.state)
    if (props.block.state === 'done') {
      incremark.finalize()
    } else {
      updateMarkdown(props.block.text)
    }
  },
  { immediate: true, deep: true }
)
watch(() => display.value.darkMode, () => {
  incremarkTheme.value = display.value.darkMode ? 'dark' : 'default'
})

onMounted(() => {
  console.log('Markdown mounted, customCodeBlocks:', customCodeBlocks)
  console.log('Markdown mounted, blocks:', blocks.value)
  incremarkTheme.value = display.value.darkMode ? 'dark' : 'default'
  incremark.render(props.block.text)
})

watch(blocks, (newBlocks) => {
  console.log('Blocks updated:', newBlocks.map(b => ({
    type: b.node?.type,
    lang: (b.node as any)?.lang,
    status: b.status,
    stableId: b.stableId
  })))
}, { deep: true })
</script>
<style scoped>
.incremark {
  background-color: transparent !important;
  max-width: 100%;
  overflow-wrap: break-word;
}

.incremark :deep(pre) {
  white-space: pre-wrap !important;
  word-break: break-all !important;
  overflow-x: auto;
}

.incremark :deep(code) {
  white-space: pre-wrap !important;
  word-break: break-all !important;
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
