<script setup lang="ts">
import CustomCodeBlock from './CustomCodeBlock.vue'

defineOptions({
  inheritAttrs: false
})

const props = defineProps<{
  node: { value?: string; lang?: string }
  blockStatus?: string
}>()

const codeStr = computed(() => props.node?.value || '')
const lang = computed(() => props.node?.lang || 'text')
const completed = computed(() => props.blockStatus === 'completed')
</script>

<template>
  <CustomCodeBlock
    :code-str="codeStr"
    :lang="lang"
    :completed="completed"
    :take-over="false"
  />
</template>
