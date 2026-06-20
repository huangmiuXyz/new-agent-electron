<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    enabled?: boolean
    threshold?: number
    autoScrollTrigger?: string | number
  }>(),
  {
    enabled: true,
    threshold: 5,
    autoScrollTrigger: ''
  }
)

const containerRef = ref<HTMLElement | null>(null)
const isUserScrolledUp = ref(false)
let lastScrollTop = 0
let observer: MutationObserver | null = null

const isNearBottom = () => {
  const el = containerRef.value
  if (!el) return true
  return el.scrollHeight - el.scrollTop - el.clientHeight <= props.threshold
}

const scrollToBottom = (force = false) => {
  const el = containerRef.value
  if (!el) return
  if (isUserScrolledUp.value && !force) return
  el.scrollTo({ top: el.scrollHeight, behavior: 'instant' })
}

const handleScroll = () => {
  const el = containerRef.value
  if (!el) return
  if (isNearBottom()) {
    isUserScrolledUp.value = false
  } else if (el.scrollTop < lastScrollTop) {
    isUserScrolledUp.value = true
  }
  lastScrollTop = el.scrollTop
}

watch(
  () => props.autoScrollTrigger,
  () => {
    if (props.enabled && !isUserScrolledUp.value) {
      nextTick(() => scrollToBottom())
    }
  }
)

onMounted(() => {
  if (!containerRef.value) return
  lastScrollTop = containerRef.value.scrollTop
  observer = new MutationObserver(() => {
    if (!props.enabled || isUserScrolledUp.value) return
    nextTick(() => scrollToBottom())
  })
  observer.observe(containerRef.value, {
    childList: true,
    subtree: true,
    characterData: true
  })
})

onUnmounted(() => {
  observer?.disconnect()
})

defineExpose({
  scrollToBottom: () => scrollToBottom(true),
  isUserScrolledUp: () => isUserScrolledUp.value,
  container: containerRef
})
</script>

<template>
  <div ref="containerRef" class="message-scroll-container" @scroll="handleScroll">
    <slot />
  </div>
</template>

<style scoped>
.message-scroll-container {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
}
</style>
