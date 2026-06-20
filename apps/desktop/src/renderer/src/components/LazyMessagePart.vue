<script lang="ts">
import { ref } from 'vue'

const isScrolling = ref(false)
let scrollTimer: ReturnType<typeof setTimeout> | null = null

const handleScroll = () => {
  isScrolling.value = true
  if (scrollTimer) clearTimeout(scrollTimer)
  scrollTimer = setTimeout(() => {
    isScrolling.value = false
  }, 200)
}

if (typeof window !== 'undefined') {
  window.addEventListener('scroll', handleScroll, { passive: true, capture: true })
}
</script>

<script setup lang="ts">
import { useIntersectionObserver } from '@vueuse/core'

const props = withDefaults(
  defineProps<{
    alwaysVisible?: boolean
    estimateHeight?: number
    rootMargin?: string
  }>(),
  {
    alwaysVisible: false,
    estimateHeight: 80,
    rootMargin: '3w00px 0px'
  }
)

const targetRef = ref<HTMLElement | null>(null)
const isMounted = ref(props.alwaysVisible)
const cachedHeight = ref(props.estimateHeight)

const parseRootMargin = (margin: string) => {
  const parsed = parseInt(margin, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

const isOutsideViewport = () => {
  const el = targetRef.value
  if (!el) return false
  const rect = el.getBoundingClientRect()
  const margin = parseRootMargin(props.rootMargin)
  return rect.bottom <= -margin || rect.top >= window.innerHeight + margin
}

const tryUnmount = () => {
  if (props.alwaysVisible || !isMounted.value || isScrolling.value) return
  if (!isOutsideViewport()) return
  if (targetRef.value) {
    cachedHeight.value = targetRef.value.offsetHeight
  }
  isMounted.value = false
}

onMounted(() => {
  if (props.alwaysVisible) {
    isMounted.value = true
    return
  }
  const el = targetRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const margin = parseRootMargin(props.rootMargin)
  if (rect.bottom > -margin && rect.top < window.innerHeight + margin) {
    isMounted.value = true
  }
})

const { stop } = useIntersectionObserver(
  targetRef,
  ([entry]) => {
    if (props.alwaysVisible) {
      isMounted.value = true
      return
    }
    if (entry.isIntersecting) {
      isMounted.value = true
    } else {
      tryUnmount()
    }
  },
  { rootMargin: props.rootMargin }
)

watch(
  () => props.alwaysVisible,
  (v) => {
    if (v) isMounted.value = true
  }
)

watch(isScrolling, (scrolling) => {
  if (!scrolling) {
    nextTick(tryUnmount)
  }
})

onUnmounted(() => stop())
</script>

<template>
  <div ref="targetRef" class="lazy-message-part">
    <slot v-if="isMounted" />
    <div
      v-else
      class="lazy-message-part__placeholder"
      :style="{ minHeight: `${cachedHeight}px` }"
    />
  </div>
</template>

<style scoped>
.lazy-message-part {
  width: 100%;
  min-width: 0;
}

.lazy-message-part__placeholder {
  width: 100%;
}
</style>
