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

const settingsStore = useSettingsStore()
const { display } = storeToRefs(settingsStore)

const incremarkTheme = computed(() => {
  return display.value.darkMode ? 'dark' : 'default'
})

const incremark = useIncremark({
  gfm: true
})
watch(
  () => props.message,
  () => {
    if (props.block.state === 'streaming') {
      incremark.render(props.block.text)
    }
    if (props.block.state === 'done') {
      incremark.finalize()
    }
  },
  {
    deep: true
  }
)
onMounted(() => {
  incremark.render(props.block.text)
})
</script>
<style>
.incremark {
  background-color: transparent !important;
}
</style>