<template>
  <ThemeProvider :theme="incremarkTheme">
    <Incremark :incremark="incremark" />
  </ThemeProvider>
</template>
<script setup lang="ts">
import { useIncremark, Incremark, ThemeProvider } from '@incremark/vue'
import { TextUIPart } from 'ai'
import { useSettingsStore } from '../stores/settings'

const props = defineProps<{
  block: TextUIPart
  message: BaseMessage
}>()
const incremarkTheme = ref<any>('default')
const settingsStore = useSettingsStore()
const { display } = storeToRefs(settingsStore)

const incremark = useIncremark({
  gfm: true
})

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
  incremarkTheme.value = display.value.darkMode ? 'dark' : 'default'
})
</script>
<style>
.incremark {
  background-color: transparent !important;
}
</style>
