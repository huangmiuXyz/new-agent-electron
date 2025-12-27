<template>
  <div class="mobile-layout light-theme" @touchstart="handleTouchStart" @touchmove="handleTouchMove"
    @touchend="handleTouchEnd">
    <nav class="tab-bar">
      <div class="slider-bar" :style="{ transform: `translateX(${currentIndex * 100}%)` }"></div>
      <div v-for="(tab, index) in tabs" :key="tab.key" class="tab-item" :class="{ active: activeTab === tab.key }"
        @click="switchTab(tab)">
        <div class="icon-box">
          <component :is="tab.icon" />
        </div>
        <span class="tab-text">{{ tab.label }}</span>
      </div>
    </nav>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
const router = useRouter()
const route = useRoute()

const props = defineProps({
  // No longer strictly needed for control, but maybe for initial state if not routed
})

const emit = defineEmits(['switch'])

const tabs = [
  { key: 'chat', label: '聊天', icon: useIcon('Chat'), path: '/mobile/chat' },
  { key: 'settings', label: '设置', icon: useIcon('Settings'), path: '/mobile/settings' }
]

const currentIndex = computed(() => {
  if (route.path.startsWith('/mobile/settings')) {
    return 1
  }
  return 0
})

const activeTab = computed(() => {
  return tabs[currentIndex.value].key
})

const switchTab = (tab) => {
  router.push(tab.path)
}

// 触摸滑动相关
const touchStartX = ref(0)
const touchStartY = ref(0)
const isSwiping = ref(false)
const SWIPE_THRESHOLD = 50 // 滑动阈值，单位像素

const handleTouchStart = (e) => {
  touchStartX.value = e.touches[0].clientX
  touchStartY.value = e.touches[0].clientY
  isSwiping.value = true
}

const handleTouchMove = (e) => {
  if (!isSwiping.value) return
  // 可以在这里添加滑动时的视觉反馈
}

const handleTouchEnd = (e) => {
  if (!isSwiping.value) return

  const touchEndX = e.changedTouches[0].clientX
  const touchEndY = e.changedTouches[0].clientY

  const deltaX = touchEndX - touchStartX.value
  const deltaY = touchEndY - touchStartY.value

  // 判断是否是水平滑动（水平移动距离大于垂直移动距离）
  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    // 向左滑动，切换到下一个tab
    if (deltaX < -SWIPE_THRESHOLD) {
      const nextIndex = Math.min(currentIndex.value + 1, tabs.length - 1)
      if (nextIndex !== currentIndex.value) {
        switchTab(tabs[nextIndex])
      }
    }
    // 向右滑动，切换到上一个tab
    else if (deltaX > SWIPE_THRESHOLD) {
      const prevIndex = Math.max(currentIndex.value - 1, 0)
      if (prevIndex !== currentIndex.value) {
        switchTab(tabs[prevIndex])
      }
    }
  }

  isSwiping.value = false
}
</script>

<style scoped>
.light-theme {
  --bg-body: #f2f4f6;

  --bg-tab: #ffffff;
  --color-active: #2c2c2e;
  --color-inactive: #a0a4a8;
  --border-color: rgba(0, 0, 0, 0.05);
}

.mobile-layout {
  width: 100%;
}

.content-viewport {
  flex: 1;
  overflow-y: auto;
  position: relative;
}

.page-container {
  padding: 0;
  height: 100%;
}

.page-view {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.tab-bar {
  position: relative;
  background-color: var(--bg-tab);
  display: flex;
  z-index: 100;
  height: 56px;
}

.slider-bar {
  position: absolute;
  top: 0;
  left: 0;
  width: 50%;
  height: 3px;
  background: linear-gradient(90deg,
      transparent 0%,
      var(--color-active) 30%,
      var(--color-active) 70%,
      transparent 100%);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
  z-index: 10;
  pointer-events: none;
  border-radius: 2px;
}

.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--color-inactive);
  transition: all 0.3s ease;
  -webkit-tap-highlight-color: transparent;
}

.icon-box {
  width: 24px;
  height: 24px;
  position: relative;
  transition: transform 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}

.icon-box :deep(svg) {
  width: 100%;
  height: 100%;
  fill: currentColor;
}

.tab-text {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.2px;
}

.tab-item.active {
  color: var(--color-active);
}

.tab-item.active .icon-box {
  transform: translateY(-2px);
}

.tab-item:active .icon-box {
  transform: scale(0.92) translateY(-2px);
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
