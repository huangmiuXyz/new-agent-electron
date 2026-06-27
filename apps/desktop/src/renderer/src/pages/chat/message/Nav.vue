<script setup lang="ts">
import { acquireZIndex } from '@renderer/utils/z-index-manager'

const props = defineProps<{
  container: any // 兼容 ref 或 HTMLElement
}>()

const { ChevronUp, ChevronDown, ArrowBarToUp, ArrowBarToDown } = useIcon([
  'ChevronUp',
  'ChevronDown',
  'ArrowBarToUp',
  'ArrowBarToDown'
])


const showMobileNav = ref(false)
let hideTimer: any = null
const navZIndex = acquireZIndex()
const toggleMobileNav = () => {
  if (!isMobile.value) return
  showMobileNav.value = !showMobileNav.value
  if (showMobileNav.value) {
    startHideTimer()
  }
}

const startHideTimer = () => {
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    showMobileNav.value = false
  }, 3000)
}

const getContainer = () => {
  if (!props.container) return null
  if (props.container.container?.value) return props.container.container.value
  return props.container.$el || props.container
}

const scrollToTop = () => {
  if (isMobile.value) startHideTimer()
  const el = getContainer()
  if (el) {
    el.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

const scrollToBottom = () => {
  if (isMobile.value) startHideTimer()
  const el = getContainer()
  if (el) {
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }
}

const scrollToPrev = () => {
  if (isMobile.value) startHideTimer()
  const el = getContainer()
  if (!el) return
  const messages = el.querySelectorAll('.message-item-wrapper')
  const currentScroll = el.scrollTop
  for (let i = messages.length - 1; i >= 0; i--) {
    if ((messages[i] as HTMLElement).offsetTop < currentScroll - 10) {
      messages[i].scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
  }
  scrollToTop()
}

const scrollToNext = () => {
  if (isMobile.value) startHideTimer()
  const el = getContainer()
  if (!el) return
  const messages = el.querySelectorAll('.message-item-wrapper')
  const currentScroll = el.scrollTop
  for (let i = 0; i < messages.length; i++) {
    if ((messages[i] as HTMLElement).offsetTop > currentScroll + 10) {
      messages[i].scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
  }
  scrollToBottom()
}
</script>

<template>
  <div class="message-nav-bar" :style="{ zIndex: navZIndex }" :class="{ 'mobile-visible': showMobileNav }" @click="toggleMobileNav">
    <div class="nav-buttons" @click.stop>
      <Button size="sm" type="button" variant="text" @click="scrollToTop" title="到最前">
        <template #icon>
          <ArrowBarToUp />
        </template>
      </Button>
      <Button size="sm" type="button" variant="text" @click="scrollToPrev" title="上一个">
        <template #icon>
          <ChevronUp />
        </template>
      </Button>
      <Button size="sm" type="button" variant="text" @click="scrollToNext" title="下一个">
        <template #icon>
          <ChevronDown />
        </template>
      </Button>
      <Button size="sm" type="button" variant="text" @click="scrollToBottom" title="到最后">
        <template #icon>
          <ArrowBarToDown />
        </template>
      </Button>
    </div>
  </div>
</template>

<style scoped>
.message-nav-bar {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translate(10px, -50%);
  opacity: 0;
  width: 40px;
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 16px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.message-nav-bar:hover,
.message-nav-bar.mobile-visible {
  opacity: 1;
  transform: translate(0, -50%);
}

.message-nav-bar.mobile-visible {
  pointer-events: auto;
}

.nav-buttons {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--bg-popover);
  padding: 6px;
  border-radius: 20px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  border: 1px solid var(--border-color);
  pointer-events: auto;
}
@media (max-width: 768px) {
  .message-nav-bar {
    width: 60px; /* 移动端增加触发面积 */
    padding-right: 12px;
  }

  .nav-buttons {
    gap: 8px; /* 增加按钮间距，方便手指操作 */
    padding: 8px;
    background: rgba(var(--bg-popover-rgb), 0.9); /* 移动端稍微增加一点不透明度 */
    backdrop-filter: blur(8px);
  }
}
</style>
