<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    enabled?: boolean
    threshold?: number
    autoScrollTrigger?: string | number
    resetKey?: string | number | null
  }>(),
  {
    enabled: true,
    threshold: 5,
    autoScrollTrigger: '',
    resetKey: null
  }
)

const containerRef = ref<HTMLElement | null>(null)
const isUserScrolledUp = ref(false)
// 切换会话时，在 DOM 落地并完成强制滚动之前，暂时隐藏容器，避免"先看到顶部再跳到底"的闪烁
const isResetting = ref(false)
let lastScrollTop = 0
let observer: MutationObserver | null = null
let resetRafId: number | null = null
let resetRetryTimer: number | null = null
let resetAttempts = 0
const MAX_RESET_ATTEMPTS = 20 // 最多重试 ~1s

const isNearBottom = () => {
  const el = containerRef.value
  if (!el) return true
  return el.scrollHeight - el.scrollTop - el.clientHeight <= props.threshold
}

const scrollToBottom = (force = false) => {
  const el = containerRef.value
  if (!el) return
  if (isUserScrolledUp.value && !force) return
  // 使用直接赋值，比 scrollTo 更同步，避免一帧错位
  el.scrollTop = el.scrollHeight
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

const clearResetTimers = () => {
  if (resetRafId !== null) {
    cancelAnimationFrame(resetRafId)
    resetRafId = null
  }
  if (resetRetryTimer !== null) {
    window.clearTimeout(resetRetryTimer)
    resetRetryTimer = null
  }
}

// 强制滚动到底部：content-visibility: auto 会让 scrollHeight 在元素进入视口前是估算值，
// 所以单次 scrollTop = scrollHeight 可能不够，需要反复滚动直到 scrollHeight 稳定。
const forceScrollToBottomAndReveal = () => {
  clearResetTimers()
  isResetting.value = true
  isUserScrolledUp.value = false
  lastScrollTop = 0
  resetAttempts = 0

  const tryScroll = () => {
    const el = containerRef.value
    if (!el) {
      isResetting.value = false
      return
    }
    const prevHeight = el.scrollHeight
    el.scrollTop = el.scrollHeight
    resetAttempts += 1

    // 读取一次 scrollHeight 触发回流，看是否稳定
    const nextHeight = el.scrollHeight
    const reachedBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 1

    if (reachedBottom && nextHeight === prevHeight && resetAttempts >= 2) {
      // 再等一帧确认稳定后显示
      resetRafId = requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight
        isResetting.value = false
        resetRafId = null
        resetRetryTimer = null
      })
      return
    }

    if (resetAttempts >= MAX_RESET_ATTEMPTS) {
      el.scrollTop = el.scrollHeight
      isResetting.value = false
      resetRetryTimer = null
      return
    }

    // 每 50ms 重试一次，给 content-visibility 元素和图片/字体加载留时间
    resetRetryTimer = window.setTimeout(() => {
      resetRafId = requestAnimationFrame(tryScroll)
    }, 50)
  }

  nextTick(() => {
    resetRafId = requestAnimationFrame(tryScroll)
  })
}

watch(
  () => props.resetKey,
  () => {
    forceScrollToBottomAndReveal()
  }
)

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
  // 首次挂载时也强制滚到底，避免初始位置闪烁
  forceScrollToBottomAndReveal()
  observer = new MutationObserver(() => {
    if (!props.enabled || isUserScrolledUp.value) return
    if (isResetting.value) return // 重置流程中由 tryScroll 统一处理
    nextTick(() => scrollToBottom())
  })
  observer.observe(containerRef.value, {
    childList: true,
    subtree: true,
    characterData: true
  })
})

onUnmounted(() => {
  clearResetTimers()
  observer?.disconnect()
})

defineExpose({
  scrollToBottom: () => scrollToBottom(true),
  isUserScrolledUp: () => isUserScrolledUp.value,
  container: containerRef
})
</script>

<template>
  <div
    ref="containerRef"
    class="message-scroll-container"
    :class="{ 'is-resetting': isResetting }"
    @scroll="handleScroll"
  >
    <slot />
  </div>
</template>

<style scoped>
.message-scroll-container {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  box-sizing: border-box;
}

/* 切换会话瞬间隐藏内容，等滚动到底后再显示，避免视觉闪烁 */
.message-scroll-container.is-resetting {
  visibility: hidden;
  pointer-events: none;
}

/* 重置期间临时关闭 content-visibility，让浏览器一次性算出真实 scrollHeight，
   避免因 contain-intrinsic-size 估算偏小导致滚不到底。 */
.message-scroll-container.is-resetting :deep(.message-item-wrapper) {
  content-visibility: visible;
}
</style>
