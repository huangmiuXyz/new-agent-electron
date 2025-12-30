<template>
  <div class="mobile-layout">
    <div class="content-viewport">
      <RouterView v-slot="{ Component }">
        <transition :name="pageTransition">
          <component :is="Component" class="page-view" />
        </transition>
      </RouterView>
    </div>
    <nav class="tab-bar" v-if="route.meta.showTabBar">
      <div class="slider-bar" :style="{ transform: `translateX(${currentIndex * 50}%)` }"></div>
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
import { computed, ref, inject } from 'vue'
const router = useRouter()
const route = useRoute()
const pageTransition = inject('pageTransition', ref('fade'))

const emit = defineEmits(['switch'])

const tabs = [
  { key: 'chat', label: '聊天', icon: useIcon('Chat'), path: '/mobile/chat/list' },
  { key: 'settings', label: '设置', icon: useIcon('Settings'), path: '/mobile/settings/list' }
]

const currentIndex = computed(() => {
  const sort = route.meta.sort
  return typeof sort === 'number' ? sort - 1 : 0
})
const activeTab = computed(() => {
  return tabs[currentIndex.value]?.key || tabs[0].key
})

const switchTab = (tab) => {
  router.push(tab.path)
}
</script>

<style scoped>
.mobile-layout {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
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

.page-view>* {
  width: 100%;
  height: 100%;
}

.tab-bar {
  position: relative;
  background-color: var(--bg-card);
  display: flex;
  z-index: 100;
  height: calc(56px + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
}

.slider-bar {
  position: absolute;
  top: 0;
  left: 0;
  width: 50%;
  height: 3px;
  background: linear-gradient(90deg,
      transparent 0%,
      var(--accent-color) 30%,
      var(--accent-color) 70%,
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
  color: var(--text-secondary);
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
  color: var(--accent-color);
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
