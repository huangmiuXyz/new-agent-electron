<script setup lang="ts">
import ChatPage from './pages/chat/index.vue'
import NotesPage from './pages/notes/index.vue'
import SettingsPage from './pages/settings/index.vue'
import AppFooter from './components/AppFooter.vue'
import { useSettingsStore } from './stores/settings'

const currentView = ref('chat')
const settingsStore = useSettingsStore()
const { display } = storeToRefs(settingsStore)

// 监听黑暗模式设置
watchEffect(() => {
  const root = document.documentElement
  if (display.value.darkMode) {
    root.classList.add('dark-mode')
  } else {
    root.classList.remove('dark-mode')
  }
})

const switchView = (view: 'chat' | 'notes' | 'settings') => {
  currentView.value = view
}

useBackButton()

const { resetTitle, customTitle } = useAppHeader()

// 处理移动端键盘弹出时视口高度变化
const updateViewportHeight = () => {
  if (isMobile.value) {
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight
    document.documentElement.style.setProperty('--vh', `${vh}px`)

    // 强制滚动到顶部，防止键盘弹出导致页面偏移
    if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
      window.scrollTo(0, 0)
    }
  } else {
    document.documentElement.style.setProperty('--vh', '100%')
  }
}

onMounted(() => {
  updateViewportHeight()
  window.visualViewport?.addEventListener('resize', updateViewportHeight)
  window.visualViewport?.addEventListener('scroll', updateViewportHeight)
  window.addEventListener('resize', updateViewportHeight)
})

onUnmounted(() => {
  window.visualViewport?.removeEventListener('resize', updateViewportHeight)
  window.visualViewport?.removeEventListener('scroll', updateViewportHeight)
  window.removeEventListener('resize', updateViewportHeight)
})

provide('switchView', switchView)
const route = useRoute()

const router = useRouter()

watch(() => route.path, () => {
  resetTitle()
})


const transitionName = ref('fade')
provide('pageTransition', transitionName)

router.beforeEach((to, from) => {
  const toDepth = (to.meta.depth as number) || 0
  const fromDepth = (from.meta.depth as number) || 0

  if (toDepth !== fromDepth) {
    transitionName.value = toDepth > fromDepth ? 'slide-left' : 'slide-right'
  } else {
    const toSort = (to.meta.sort as number) || 0
    const fromSort = (from.meta.sort as number) || 0

    if (toSort && fromSort && toSort !== fromSort) {
      transitionName.value = toSort > fromSort ? 'slide-left' : 'slide-right'
    } else {
      transitionName.value = 'fade'
    }
  }
})

watch(isMobile, (mobile) => {
  if (mobile) {
    router.replace('/mobile/chat/list')
  } else {
    router.replace('/chat')
  }
})

const touchStartX = ref(0)
const touchStartY = ref(0)
const isSwiping = ref(false)
const SWIPE_THRESHOLD = 50

const handleTouchStart = (e: TouchEvent) => {
  if (!isMobile.value) return
  touchStartX.value = e.touches[0].clientX
  touchStartY.value = e.touches[0].clientY
  isSwiping.value = true
}

const handleTouchMove = () => {
  if (!isSwiping.value) return
}

const handleTouchEnd = (e: TouchEvent) => {
  if (!isSwiping.value) return
  isSwiping.value = false

  const touchEndX = e.changedTouches[0].clientX
  const touchEndY = e.changedTouches[0].clientY

  const deltaX = touchEndX - touchStartX.value
  const deltaY = touchEndY - touchStartY.value

  if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > SWIPE_THRESHOLD) {
    if (deltaX < 0) {
      if (route.path.includes('/mobile/chat')) {
        router.push('/mobile/notes')
      } else if (route.path.includes('/mobile/notes')) {
        router.push('/mobile/settings')
      }
    } else {
      if (route.path.includes('/mobile/settings')) {
        router.push('/mobile/notes')
      } else if (route.path.includes('/mobile/notes')) {
        router.push('/mobile/chat')
      }
    }
  }
}
</script>

<template>
  <div class="app-layout" v-if="route.path !== '/temp-chat'">
    <AppHeader v-if="!isMobile" :current-view="currentView" :custom-title="customTitle" />

    <div class="app-body" v-if="!isMobile">
      <AppNavBar :current-view="currentView" @switch="switchView" />
      <NotificationPanel />
      <main class="app-content">
        <ChatPage v-show="currentView === 'chat'" />
        <NotesPage v-show="currentView === 'notes'" />
        <SettingsPage v-show="currentView === 'settings'" />
      </main>
    </div>

    <AppFooter v-if="!isMobile" />

    <div class="app-body isMobile" v-else @touchstart="handleTouchStart" @touchmove="handleTouchMove"
      @touchend="handleTouchEnd">
      <MobileTab :active-tab="currentView" />
    </div>
  </div>
  <div v-else class="router-container h-full">
    <router-view v-slot="{ Component }">
      <transition :name="transitionName">
        <component :is="Component" :key="route.path" />
      </transition>
    </router-view>
  </div>
  <ContextMenu />
</template>

<style>
:root {
  --bg-app: #fbfbfb;
  --bg-sidebar: #fff;
  --bg-header: #fbfbfb;
  --bg-secondary: #fff;
  --bg-hover: rgba(0, 0, 0, 0.05);
  --bg-active: rgba(0, 0, 0, 0.08);
  --bg-secondary: #f9fafb;
  --bg-secondary-hover: #f3f4f6;
  --bg-tertiary-hover: #f9f9f9;
  --bg-tertiary: #fcfcfc;
  --border-subtle: #eaeaea;
  --border-focus: #d1d1d6;
  --bg-settings-mobile-sidebar: #f7f7f8;
  --accent-color: #000000;
  --accent-text: #ffffff;
  --footer-bg: #fbfbfb;
  --footer-text: #86868b;

  --text-primary: #1d1d1f;
  --text-secondary: #86868b;
  --text-tertiary: #a1a1a6;

  --bubble-me: #2c2c2e;
  --bubble-them: #f2f2f7;

  --header-h: 40px;
  --radius-md: 10px;
  --radius-sm: 6px;

  --font-stack: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif;

  /* GlobalSearch 组件所需的变量 */
  --modal-bg: rgba(255, 255, 255, 0.85);
  --modal-backdrop: blur(16px);
  --border-color: rgba(0, 0, 0, 0.05);
  --text-main: #1f2937;
  --text-sub: #6b7280;
  --accent: #3b82f6;
  --active-bg: rgba(59, 130, 246, 0.08);
  --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);

  /* 额外的颜色变量 */
  --bg-card: #fff;
  --bg-input: #fff;
  --bg-disabled: #f5f5f5;
  --border-color-light: #e5e7eb;
  --border-color-medium: #d1d5db;
  --border-hover: #d1d1d1;
  --text-disabled: #999;
  --text-placeholder: #999;
  --color-primary: #007bff;
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;
  --color-info: #3b82f6;

  /* RGB 变量，用于 rgba() */
  --bg-rgb: 255, 255, 255;
  --text-rgb: 29, 29, 31;
  --accent-rgb: 0, 0, 0;
  --color-primary-rgb: 0, 123, 255;
  --color-success-rgb: 16, 185, 129;
  --color-warning-rgb: 245, 158, 11;
  --color-danger-rgb: 239, 68, 68;
  --color-info-rgb: 59, 130, 246;
}

/* 黑暗模式 */
.dark-mode {
  --bg-app: #1c1c1e;
  --bg-sidebar: #2c2c2e;
  --bg-header: #1c1c1e;
  --bg-secondary: #2c2c2e;
  --bg-hover: rgba(255, 255, 255, 0.08);
  --bg-active: rgba(255, 255, 255, 0.12);
  --bg-secondary-hover: #3a3a3c;
  --bg-tertiary-hover: #2c2c2e;
  --bg-tertiary: #1c1c1e;
  --bg-settings-mobile-sidebar: #2c2c2e;
  --border-subtle: #38383a;
  --border-focus: #48484a;

  --accent-color: #ffffff;
  --accent-text: #000000;
  --footer-bg: #1c1c1e;
  --footer-text: #a1a1a6;

  --text-primary: #f5f5f7;
  --text-secondary: #a1a1a6;
  --text-tertiary: #8e8e93;

  --bubble-me: #0a84ff;
  --bubble-them: #2c2c2e;

  /* GlobalSearch 组件所需的变量 */
  --modal-bg: rgba(44, 44, 46, 0.85);
  --border-color: rgba(255, 255, 255, 0.1);
  --text-main: #f5f5f7;
  --text-sub: #a1a1a6;
  --accent: #0a84ff;
  --active-bg: rgba(10, 132, 255, 0.15);
  --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2);

  /* 额外的颜色变量 */
  --bg-card: #2c2c2e;
  --bg-input: #2c2c2e;
  --bg-disabled: #3a3a3c;
  --border-color-light: #38383a;
  --border-color-medium: #48484a;
  --border-hover: #5a5a5c;
  --text-disabled: #6e6e73;
  --text-placeholder: #6e6e73;
  --color-primary: #0a84ff;
  --color-success: #32d74b;
  --color-warning: #ffd60a;
  --color-danger: #ff453a;
  --color-info: #0a84ff;

  /* RGB 变量，用于 rgba() */
  --bg-rgb: 44, 44, 46;
  --text-rgb: 245, 245, 247;
  --accent-rgb: 255, 255, 255;
  --color-primary-rgb: 10, 132, 255;
  --color-success-rgb: 50, 215, 75;
  --color-warning-rgb: 255, 214, 10;
  --color-danger-rgb: 255, 69, 58;
  --color-info-rgb: 10, 132, 255;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  -webkit-tap-highlight-color: transparent;
  overscroll-behavior: none;
}

html {
  background-color: var(--bg-app);
  height: 100dvh;
  overflow: hidden;
}

body {
  font-family: var(--font-stack);
  background-color: var(--bg-app);
  height: 100dvh;
  width: 100%;
  display: flex;
  color: var(--text-primary);
  overflow: hidden;
  font-size: 13px;
  -webkit-font-smoothing: antialiased;
}

#app {
  width: 100%;
  height: 100%;
}

/* 隐藏滚动条但保持滚动功能 */
::-webkit-scrollbar {
  width: 0px;
  display: none;
}

::-webkit-scrollbar-thumb {
  display: none;
}

::-webkit-scrollbar-track {
  display: none;
}

/* Firefox 隐藏滚动条 */
* {
  scrollbar-width: none;
}

/* IE 和 Edge 隐藏滚动条 */
* {
  -ms-overflow-style: none;
}

.no-drag {
  -webkit-app-region: no-drag;
}

.drag {
  -webkit-app-region: drag;
}

.xicon {
  align-items: center;
}

.app-layout {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: var(--vh, 100dvh);
  overflow: hidden;
  background-color: var(--bg-app);
  position: fixed;
  top: 0;
  left: 0;
}

.app-body {
  display: flex;
  flex: 1;
  overflow: hidden;
  width: 100%;
}

.app-body.isMobile {
  flex-direction: column;
  overflow: hidden;
}

.app-content {
  flex: 1;
  height: 100%;
  overflow: hidden;
  position: relative;
  display: flex;
  border-top: 1px solid var(--border-subtle);
  border-left: 1px solid var(--border-subtle);
  background: var(--bg-card);
  border-top-left-radius: var(--radius-md);
}

a {
  color: var(--accent-color) !important;
}

/* Transitions */
.router-container {
  position: relative;
  flex: 1;
  width: 100%;
  overflow: hidden;
}

.router-container.h-full {
  height: 100vh;
  height: var(--vh, 100vh);
}

.slide-left-enter-active,
.slide-left-leave-active,
.slide-right-enter-active,
.slide-right-leave-active,
.fade-enter-active,
.fade-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
}

.slide-left-enter-from {
  transform: translateX(100%);
}

.slide-left-leave-to {
  transform: translateX(-30%);
  opacity: 0;
}

.slide-right-enter-from {
  transform: translateX(-30%);
  opacity: 0;
}

.slide-right-leave-to {
  transform: translateX(100%);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
