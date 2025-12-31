<template>
  <nav class="mobile-tab-bar">
    <div class="slider-bar" :style="{ transform: `translateX(${currentIndex * 50}%)` }"></div>
    <div v-for="(tab, index) in tabs" :key="tab.key" class="tab-item" :class="{ active: activeTab === tab.key }"
      @click="switchTab(tab)">
      <div class="icon-box">
        <component :is="tab.icon" />
      </div>
      <span class="tab-text">{{ tab.label }}</span>
    </div>
  </nav>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useIcon } from '../composables/useIcon'

const router = useRouter()
const route = useRoute()

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
.mobile-tab-bar {
  position: relative;
  background-color: var(--bg-card);
  display: flex;
  z-index: 100;
  height: calc(56px + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  box-shadow: 0 -1px 0 var(--border-subtle);
  flex-shrink: 0;
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

.tab-item.active {
  color: var(--accent-color);
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

.tab-text {
  font-size: 10px;
  margin-top: 4px;
  font-weight: 500;
}
</style>
