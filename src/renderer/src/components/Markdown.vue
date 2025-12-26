<template>
  <Incremark :incremark="incremark" />
</template>
<script setup lang="ts">
import { useIncremark, Incremark } from '@incremark/vue'
import { TextUIPart } from 'ai'
const props = defineProps<{
  block: TextUIPart
  message: BaseMessage
}>()
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
  .incremark{
    background-color: transparent !important;
  }
</style>