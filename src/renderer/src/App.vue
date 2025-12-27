<script setup lang="ts">
import ChatPage from './pages/chat/index.vue'
import SettingsPage from './pages/settings/index.vue'

const currentView = ref('chat')

const switchView = (view: 'chat' | 'settings') => {
  currentView.value = view
}

useBackButton()

const { resetTitle, customTitle } = useAppHeader()

provide('switchView', switchView)
const route = useRoute()

const router = useRouter()

watch(() => route.path, () => {
  resetTitle()
})

const actualCurrentView = computed(() => {
  if (isMobile.value) {
    return route.path.includes('settings') ? 'settings' : 'chat'
  }
  return currentView.value
})

const showMobileTab = computed(() => {
  return ['/mobile/chat', '/mobile/settings'].includes(route.path) || route.path === '/mobile'
})

const transitionName = ref('fade')

router.beforeEach((to, from) => {
  const toDepth = to.path.split('/').filter(Boolean).length
  const fromDepth = from.path.split('/').filter(Boolean).length

  if (toDepth > fromDepth) {
    transitionName.value = 'slide-left'
  } else if (toDepth < fromDepth) { transitionName.value = 'slide-right' } else {
    const getTabIndex = (path: string) => {
      if (path.includes('/mobile/chat')) return 0
      if (path.includes('/mobile/settings')) return 1
      return -1
    }

    const toIndex = getTabIndex(to.path)
    const fromIndex = getTabIndex(from.path)

    if (toIndex !== -1 && fromIndex !== -1) {
      transitionName.value = toIndex > fromIndex ? 'slide-left' : 'slide-right'
    } else {
      transitionName.value = 'fade'
    }
  }
})

watch(isMobile, (mobile) => {
  if (mobile) {
    router.replace('/mobile/chat')
  } else {
    router.replace('/chat')
  }
})

const touchStartX = ref(0)
const touchStartY = ref(0)
const isSwiping = ref(false)
const SWIPE_THRESHOLD = 50

const handleTouchStart = (e: TouchEvent) => {
  if (!isMobile.value || !showMobileTab.value) return
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
        router.push('/mobile/settings')
      }
    } else {
      if (route.path.includes('/mobile/settings')) {
        router.push('/mobile/chat')
      }
    }
  }
}
</script>

<template>
  <div class="app-layout" v-if="route.path !== '/temp-chat'">
    <AppHeader :current-view="actualCurrentView" :custom-title="customTitle" />

    <div class="app-body" v-if="!isMobile">
      <AppNavBar :current-view="currentView" @switch="switchView" />
      <main class="app-content">
        <ChatPage v-show="currentView === 'chat'" />
        <SettingsPage v-show="currentView === 'settings'" />
      </main>
    </div>

    <div class="app-body isMobile" v-else @touchstart="handleTouchStart" @touchmove="handleTouchMove"
      @touchend="handleTouchEnd">
      <div class="router-container">
        <router-view v-slot="{ Component }">
          <transition :name="transitionName">
            <component :is="Component" :key="route.path" />
          </transition>
        </router-view>
      </div>
      <MobileTab v-if="showMobileTab" :active-tab="actualCurrentView" />
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
  --border-subtle: #eaeaea;
  --border-focus: #d1d1d6;

  --accent-color: #000000;
  --accent-text: #ffffff;

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
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  -webkit-tap-highlight-color: transparent;
  -webkit-user-select: none;
  user-select: none;
  overscroll-behavior: none;
}

html {
  background-color: var(--bg-app);
  height: 100%;
}

body {
  font-family: var(--font-stack);
  background-color: var(--bg-app);
  height: 100%;
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
  height: 100%;
  overflow: hidden;
  background-color: var(--bg-app);
}

.app-body {
  display: flex;
  flex: 1;
  overflow: hidden;
  width: 100%;
}

.app-body.isMobile {
  flex-direction: column;
}

.app-content {
  flex: 1;
  height: 100%;
  overflow: hidden;
  position: relative;
  display: flex;
  border-top: 1px solid var(--border-subtle);
  border-left: 1px solid var(--border-subtle);
  background: #fff;
  border-top-left-radius: var(--radius-md);
}

a {
  color: #000 !important;
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
