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
watchEffect(() => {
  if (props.block.state === 'streaming') {
    incremark.append(props.block.text)
  }
  if (props.block.state === 'done') {
    incremark.finalize()
  }
})

onMounted(() => {
  incremark.render(props.block.text)
})
</script>
