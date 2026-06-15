<script setup lang="ts">
import ChatPage from './pages/chat/index.vue'
import NotesPage from './pages/notes/index.vue'
import ImagePage from './pages/image/index.vue'
import SettingsPage from './pages/settings/index.vue'
import MyAppsPage from './pages/my-apps/index.vue'
import AppFooter from './components/AppFooter.vue'
import PageFindBar from './components/PageFindBar.vue'
import Term from './components/term.vue'
import ResizeBox from './components/ResizeBox.vue'
import GlobalRightPanel from './components/GlobalRightPanel.vue'
import { useSettingsStore } from './stores/settings'
import { useChatsStores } from './stores/chats'
import { useCanvasStore } from './stores/canvas'
import { useImageStore } from './stores/image'
import { useKnowledgeStore } from './stores/knowledge'
import { useSyncStore } from './stores/sync'
import { useShortcuts } from './composables/useShortcuts'
import { useWindowSize } from '@vueuse/core'

const route = useRoute()
const router = useRouter()
const currentView = ref('chat')
const settingsStore = useSettingsStore()
const chatsStore = useChatsStores()
const canvasStore = useCanvasStore()
const imageStore = useImageStore()
const knowledgeStore = useKnowledgeStore()
const myAppsStore = useMyAppsStore()
const syncStore = useSyncStore()
const { display, shortcuts } = storeToRefs(settingsStore)
const { updateConfig } = useShortcuts()
const globalLeftPanelViews = new Set(['chat', 'notes', 'settings', 'image', 'my-apps'])
const hasGlobalLeftPanel = computed(() => !isMobile.value && globalLeftPanelViews.has(currentView.value))

const globalLeftPanelWidth = computed({
  get: () => settingsStore.display.sidebarWidth,
  set: (value: number) => {
    settingsStore.display.sidebarWidth = value
  }
})

const globalLeftPanelMinSize = computed(() => 150)
const globalLeftPanelMaxSize = computed(() => 800)

// 终端显示控制
const terminalCollapsed = computed({
  get: () => !settingsStore.display.showTerminal,
  set: (val) => {
    settingsStore.display.showTerminal = !val
  }
})

// 监听黑暗模式设置
watchEffect(() => {
  const root = document.documentElement
  if (display.value.darkMode) {
    root.classList.add('dark-mode')
  } else {
    root.classList.remove('dark-mode')
  }

  if (window.api?.process?.platform === 'win32') {
    void window.api.setTitleBarTheme(display.value.darkMode)
  }
})

const switchView = (view: 'chat' | 'notes' | 'settings' | 'image' | 'my-apps') => {
  currentView.value = view
  if (!isMobile.value) {
    router.push(view === 'my-apps' ? '/my-apps' : `/${view}`)
  }
}

useBackButton()

const { resetTitle, customTitle } = useAppHeader()

const termRef = ref<InstanceType<typeof Term> | null>(null)

// 终端展开后重新计算大小
const handleTerminalExpand = () => {
  termRef.value?.fitTerminal?.()
}

// 各 store 独立的恢复状态
const settingsReady = ref(false)
const chatsReady = ref(false)
const canvasReady = ref(false)
const imageReady = ref(false)
const knowledgeReady = ref(false)
const myAppsReady = ref(false)

settingsStore.isAfterRestore.then(() => {
  settingsReady.value = true
  // 将持久化的快捷键配置同步到 ShortcutManager
  shortcuts.value.forEach(s => {
    updateConfig(s.id, { currentKey: s.currentKey, enabled: s.enabled })
  })
})

chatsStore.isAfterRestore.then(() => {
  chatsReady.value = true
})

canvasStore.isAfterRestore.then(() => {
  canvasReady.value = true
})

imageStore.isAfterRestore.then(() => {
  imageReady.value = true
})

knowledgeStore.isAfterRestore.then(() => {
  knowledgeReady.value = true
})

myAppsStore.isAfterRestore.then(() => {
  myAppsReady.value = true
})

Promise.all([syncStore.isAfterRestore, chatsStore.isAfterRestore]).then(() => {
  void syncStore.initialize()
})

Promise.all([chatsStore.isAfterRestore, canvasStore.isAfterRestore]).then(() => {
  canvasStore.syncWithChats(chatsStore.allChats.map((chat) => chat.id))
})

const isStoreReady = computed(() => {
  const path = route.path
  if (path.startsWith('/chat') || path.startsWith('/mobile/chat') || path === '/') {
    return settingsReady.value && chatsReady.value && canvasReady.value
  }
  if (path.startsWith('/notes') || path.startsWith('/mobile/notes')) {
    return settingsReady.value
  }
  if (path.startsWith('/image')) {
    return settingsReady.value && imageReady.value
  }
  if (path.startsWith('/settings') || path.startsWith('/mobile/settings')) {
    return settingsReady.value && knowledgeReady.value
  }
  if (path.startsWith('/my-apps') || path.startsWith('/mobile/my-apps')) {
    return settingsReady.value && chatsReady.value && canvasReady.value && myAppsReady.value
  }
  if (path.startsWith('/temp-chat')) {
    return true
  }
  return settingsReady.value && chatsReady.value && canvasReady.value
})


// 处理移动端键盘弹出时视口高度变化
const getAndroidSafeAreaBottom = (effectiveViewportHeight?: number) => {
  const isAndroidPlatform = /android/i.test(navigator.userAgent)
  if (!isAndroidPlatform) return 0

  const viewport = window.visualViewport
  if (!viewport) return 12

  const viewportHeight = effectiveViewportHeight ?? viewport.height
  const viewportBottom = viewportHeight + viewport.offsetTop
  const occludedBottom = Math.max(0, window.innerHeight - viewportBottom)

  // Keyboard open: avoid inflating bottom safe area with IME height.
  if (occludedBottom >= 120) return 0

  return Math.max(12, Math.min(occludedBottom, 32))
}

const isFocusedFormControl = () => {
  const activeElement = document.activeElement
  return activeElement instanceof HTMLElement &&
    activeElement.matches('input, textarea, select, [contenteditable="true"]')
}

const isFormControlFocusedInModal = () => {
  const activeElement = document.activeElement
  if (!(activeElement instanceof HTMLElement)) return false
  const isFormControl = activeElement.matches('input, textarea, select, [contenteditable="true"]')
  return isFormControl && Boolean(activeElement.closest('.basic-modal-overlay'))
}

const hasBaseModalOpen = () => {
  return Boolean(document.querySelector('.basic-modal-overlay'))
}

const updateViewportHeight = () => {
  if (isMobile.value) {
    const rawVisualVh = window.visualViewport ? window.visualViewport.height : window.innerHeight
    const layoutVh = window.innerHeight
    const isModalFormControlFocused = isFormControlFocusedInModal()
    const viewportOffsetTop = window.visualViewport?.offsetTop ?? window.scrollY ?? 0
    const isKeyboardLikelyOpen = isFocusedFormControl() && layoutVh - rawVisualVh >= 120
    const isTransientCompressedViewport =
      !isKeyboardLikelyOpen &&
      rawVisualVh > 0 &&
      layoutVh > 0 &&
      rawVisualVh < layoutVh * 0.78
    const visualVh = isTransientCompressedViewport ? layoutVh : rawVisualVh
    const hasModalOpen = hasBaseModalOpen()
    const shouldLockKeyboardViewport = isKeyboardLikelyOpen && !isModalFormControlFocused && !hasModalOpen
    document.documentElement.classList.toggle('keyboard-viewport-locked', shouldLockKeyboardViewport)
    document.documentElement.style.setProperty('--visual-vh', `${visualVh}px`)

    if (isModalFormControlFocused || hasModalOpen) {
      document.documentElement.style.setProperty('--visual-viewport-offset-top', `${viewportOffsetTop}px`)
      document.documentElement.style.setProperty('--safe-area-bottom', '0px')
      window.scrollTo(0, 0)
      requestAnimationFrame(() => window.scrollTo(0, 0))
      return
    }

    document.documentElement.style.setProperty('--visual-viewport-offset-top', '0px')
    document.documentElement.style.setProperty('--vh', `${visualVh}px`)
    document.documentElement.style.setProperty('--safe-area-bottom', `${getAndroidSafeAreaBottom(visualVh)}px`)

    // 强制滚动到顶部，防止键盘弹出导致页面偏移；弹窗内输入时不要触发底层页面重排。
    const activeElement = document.activeElement
    const shouldResetWindowScroll =
      activeElement instanceof HTMLElement &&
      activeElement.matches('input, textarea') &&
      !activeElement.closest('.basic-modal-overlay')
    if (shouldResetWindowScroll) {
      window.scrollTo(0, 0)
      requestAnimationFrame(() => window.scrollTo(0, 0))
    }
  } else {
    document.documentElement.classList.remove('keyboard-viewport-locked')
    document.documentElement.style.setProperty('--vh', '100%')
    document.documentElement.style.setProperty('--visual-vh', '100%')
    document.documentElement.style.setProperty('--visual-viewport-offset-top', '0px')
    document.documentElement.style.setProperty('--safe-area-bottom', '0px')
  }
}

const scheduleViewportRecovery = () => {
  updateViewportHeight()
  window.setTimeout(updateViewportHeight, 80)
  window.setTimeout(updateViewportHeight, 260)
  window.setTimeout(updateViewportHeight, 600)
}

onMounted(() => {
  updateViewportHeight()
  window.visualViewport?.addEventListener('resize', updateViewportHeight)
  window.visualViewport?.addEventListener('scroll', updateViewportHeight)
  window.addEventListener('resize', updateViewportHeight)
  window.addEventListener('focus', scheduleViewportRecovery)
  window.addEventListener('pageshow', scheduleViewportRecovery)
  document.addEventListener('visibilitychange', scheduleViewportRecovery)
})

onUnmounted(() => {
  window.visualViewport?.removeEventListener('resize', updateViewportHeight)
  window.visualViewport?.removeEventListener('scroll', updateViewportHeight)
  window.removeEventListener('resize', updateViewportHeight)
  window.removeEventListener('focus', scheduleViewportRecovery)
  window.removeEventListener('pageshow', scheduleViewportRecovery)
  document.removeEventListener('visibilitychange', scheduleViewportRecovery)
})

provide('switchView', switchView)

const mobileTabs = computed(() => {
  return router.getRoutes()
    .filter((r) => r.path.startsWith('/mobile/') && r.meta?.sort !== undefined && r.meta?.mobileHidden !== true)
    .sort((a, b) => (a.meta.sort as number) - (b.meta.sort as number))
})
const isTabSwipeEnabled = computed(() => {
  return isMobile.value && route.meta?.showTabBar === true
})

// 监听路由变化，同步更新 currentView
watch(
  () => route.path,
  (path) => {
    if (!isMobile.value) {
      if (path.startsWith('/chat')) currentView.value = 'chat'
      else if (path.startsWith('/notes')) currentView.value = 'notes'
      else if (path.startsWith('/image')) currentView.value = 'image'
      else if (path.startsWith('/my-apps')) currentView.value = 'my-apps'
      else if (path.startsWith('/settings')) currentView.value = 'settings'

      if (currentView.value === 'chat' && settingsStore.display.assistantSidebarTab === 'chat') {
        settingsStore.display.assistantSidebarTab = 'canvas'
        settingsStore.display.speechSidebarCollapsed = true
      }
    }
    resetTitle()
  },
  { immediate: true }
)


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
  if (!isTabSwipeEnabled.value) return
  touchStartX.value = e.touches[0].clientX
  touchStartY.value = e.touches[0].clientY
  isSwiping.value = true
}

const handleTouchMove = () => {
  if (!isSwiping.value) return
}

const handleTouchEnd = (e: TouchEvent) => {
  if (!isSwiping.value || !isTabSwipeEnabled.value) return
  isSwiping.value = false

  const touchEndX = e.changedTouches[0].clientX
  const touchEndY = e.changedTouches[0].clientY

  const deltaX = touchEndX - touchStartX.value
  const deltaY = touchEndY - touchStartY.value

  if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > SWIPE_THRESHOLD) {
    const currentTabRoute = route.matched.find((r) => r.meta?.sort !== undefined)
    if (!currentTabRoute) return

    const tabs = mobileTabs.value
    const currentIndex = tabs.findIndex((t) => t.path === currentTabRoute.path)

    if (currentIndex === -1) return

    if (deltaX < 0) {
      // 向左划，去下一个
      if (currentIndex < tabs.length - 1) {
        router.push(tabs[currentIndex + 1].path)
      }
    } else {
      // 向右划，去上一个
      if (currentIndex > 0) {
        router.push(tabs[currentIndex - 1].path)
      }
    }
  }
}

const { width } = useWindowSize()
</script>

<template>
  <div class="app-layout" v-if="route.path !== '/temp-chat' && isStoreReady">
    <AppHeader v-if="!isMobile" :current-view="currentView" :custom-title="customTitle" />

    <div class="app-body" v-if="!isMobile">
      <div class="content-wrapper">
        <main class="app-content">
          <ResizeBox v-if="hasGlobalLeftPanel" v-model:width="globalLeftPanelWidth"
            v-model:is-collapsed="settingsStore.display.sidebarCollapsed" :min-size="globalLeftPanelMinSize"
            :max-size="globalLeftPanelMaxSize">
            <div class="global-left-panel">
              <AppNavBar placement="sidebar-top" :current-view="currentView" @switch="switchView" />
              <div id="global-left-panel-content" class="global-left-panel-content"></div>
            </div>
          </ResizeBox>
          <div class="app-page-shell" :class="{ 'without-left-panel': !hasGlobalLeftPanel }">
            <AppNavBar v-if="!hasGlobalLeftPanel" placement="sidebar-top" :current-view="currentView"
              @switch="switchView" />
            <div class="app-page-host">
              <ChatPage v-if="currentView === 'chat'" />
              <NotesPage v-if="currentView === 'notes'" />
              <ImagePage v-if="currentView === 'image'" />
              <MyAppsPage v-if="currentView === 'my-apps'" />
              <SettingsPage v-if="currentView === 'settings'" />
            </div>
          </div>
        </main>
        <!-- 全局终端：在 content-wrapper 内，app-content 下方 -->
        <ResizeBox v-model:height="settingsStore.display.terminalHeight" v-model:is-collapsed="terminalCollapsed"
          direction="vertical" handle-position="top" :min-size="150" :max-size="600" class="global-terminal"
          @expand="handleTerminalExpand">
          <Term ref="termRef" />
        </ResizeBox>
      </div>
      <ResizeBox v-model:width="settingsStore.display.speechSidebarWidth"
        v-model:is-collapsed="settingsStore.display.speechSidebarCollapsed" direction="horizontal" handlePosition="left"
        :minSize="280" :maxSize="width">
        <GlobalRightPanel />
      </ResizeBox>
    </div>

    <AppFooter v-if="!isMobile" :current-view="currentView" />

    <div class="app-body isMobile" v-else @touchstart.passive="handleTouchStart" @touchmove.passive="handleTouchMove"
      @touchend.passive="handleTouchEnd">
      <MobileTab :active-tab="currentView" />
    </div>
  </div>
  <div v-else-if="isStoreReady" class="router-container h-full">
    <router-view v-slot="{ Component }">
      <transition :name="transitionName">
        <component :is="Component" :key="route.path" />
      </transition>
    </router-view>
  </div>
  <!-- Store 恢复前的 loading -->
  <div v-else class="app-loading">
    <Loading />
  </div>
  <PageFindBar />
  <ContextMenu />
</template>

<style>
:root {
  --bg-app: #f6f6f6;
  --bg-sidebar: #ffffff;
  --bg-header: rgba(246, 246, 246, 0.72);
  --bg-sidebar-surface: #ececec;
  --bg-main-surface: #ffffff;
  --bg-secondary: #fff;
  --bg-hover: rgba(0, 0, 0, 0.06);
  --bg-active: rgba(0, 0, 0, 0.1);
  --bg-secondary: #f5f5f5;
  --bg-secondary-hover: #ececec;
  --bg-tertiary-hover: #f5f5f5;
  --bg-tertiary: #fbfbfb;
  --border-subtle: rgba(0, 0, 0, 0.09);
  --border-focus: #d1d1d6;
  --bg-settings-mobile-sidebar: #f0f0f0;
  --accent-color: #000000;
  --accent-text: #ffffff;
  --footer-bg: rgba(246, 246, 246, 0.72);
  --footer-text: #86868b;

  --text-primary: #1d1d1f;
  --text-secondary: #86868b;
  --text-tertiary: #a1a1a6;

  --bubble-me: #2c2c2e;
  --bubble-them: #f2f2f7;

  --header-h: 40px;
  --radius-md: 10px;
  --radius-sm: 6px;

  /* macOS 原生圆角比例 */
  --radius-xs: 4px;
  --radius-lg: 12px;
  --radius-xl: 16px;

  --font-stack: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif;

  /* macOS 振动玻璃效果 */
  --vibrancy-blur: saturate(180%) blur(20px);
  --vibrancy-blur-light: saturate(180%) blur(12px);

  /* macOS 阴影 */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.06);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04);
  --shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);

  /* GlobalSearch 组件所需的变量 */
  --modal-bg: rgba(246, 246, 246, 0.8);
  --modal-backdrop: blur(16px);
  --border-color: rgba(0, 0, 0, 0.08);
  --text-main: #1d1d1f;
  --text-sub: #6b7280;
  --accent: #007aff;
  --active-bg: rgba(0, 122, 255, 0.1);
  --shadow-xl: 0 24px 48px -8px rgba(0, 0, 0, 0.18), 0 8px 16px -4px rgba(0, 0, 0, 0.08);

  /* 额外的颜色变量 */
  --bg-card: #fff;
  --bg-input: #ffffff;
  --bg-disabled: #f0f0f0;
  --border-color-light: rgba(0, 0, 0, 0.06);
  --border-color-medium: rgba(0, 0, 0, 0.14);
  --border-hover: rgba(0, 0, 0, 0.2);
  --text-disabled: #a1a1a6;
  --text-placeholder: #a1a1a6;
  --color-primary: #007aff;
  --color-success: #34c759;
  --color-warning: #ff9f0a;
  --color-danger: #ff3b30;
  --color-info: #5ac8fa;

  /* RGB 变量，用于 rgba() */
  --bg-rgb: 246, 246, 246;
  --text-rgb: 29, 29, 31;
  --accent-rgb: 0, 0, 0;
  --color-primary-rgb: 0, 122, 255;
  --color-success-rgb: 52, 199, 89;
  --color-warning-rgb: 255, 159, 10;
  --color-danger-rgb: 255, 59, 48;
  --color-info-rgb: 90, 200, 250;
  --native-safe-area-top: 0px;
  --native-safe-area-right: 0px;
  --native-safe-area-bottom: 0px;
  --native-safe-area-left: 0px;
  --safe-area-top: max(env(safe-area-inset-top), var(--native-safe-area-top, 0px));
  --safe-area-right: max(env(safe-area-inset-right), var(--native-safe-area-right, 0px));
  --safe-area-bottom: 0px;
  --safe-area-left: max(env(safe-area-inset-left), var(--native-safe-area-left, 0px));
}

/* 黑暗模式 */
.dark-mode {
  --bg-app: #1e1e1e;
  --bg-sidebar: #2a2a2a;
  --bg-header: rgba(30, 30, 30, 0.72);
  --bg-sidebar-surface: #262626;
  --bg-main-surface: #2a2a2a;
  --bg-secondary: #2c2c2e;
  --bg-hover: rgba(255, 255, 255, 0.07);
  --bg-active: rgba(255, 255, 255, 0.11);
  --bg-secondary-hover: #3a3a3c;
  --bg-tertiary-hover: #2c2c2e;
  --bg-tertiary: #1e1e1e;
  --bg-settings-mobile-sidebar: #2c2c2e;
  --border-subtle: rgba(255, 255, 255, 0.09);
  --border-focus: #48484a;

  --accent-color: #ffffff;
  --accent-text: #000000;
  --footer-bg: rgba(30, 30, 30, 0.72);
  --footer-text: #a1a1a6;

  --text-primary: #f5f5f7;
  --text-secondary: #a1a1a6;
  --text-tertiary: #8e8e93;

  --bubble-me: #0a84ff;
  --bubble-them: #2c2c2e;

  /* macOS 阴影 - 深色模式 */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3), 0 1px 3px rgba(0, 0, 0, 0.4);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.35);

  /* GlobalSearch 组件所需的变量 */
  --modal-bg: rgba(42, 42, 42, 0.82);
  --border-color: rgba(255, 255, 255, 0.1);
  --text-main: #f5f5f7;
  --text-sub: #a1a1a6;
  --accent: #0a84ff;
  --active-bg: rgba(10, 132, 255, 0.2);
  --shadow-xl: 0 24px 48px -8px rgba(0, 0, 0, 0.6), 0 8px 16px -4px rgba(0, 0, 0, 0.4);

  /* 额外的颜色变量 */
  --bg-card: #2c2c2e;
  --bg-input: #1e1e1e;
  --bg-disabled: #3a3a3c;
  --border-color-light: rgba(255, 255, 255, 0.08);
  --border-color-medium: rgba(255, 255, 255, 0.16);
  --border-hover: rgba(255, 255, 255, 0.28);
  --text-disabled: #6e6e73;
  --text-placeholder: #6e6e73;
  --color-primary: #0a84ff;
  --color-success: #32d74b;
  --color-warning: #ffd60a;
  --color-danger: #ff453a;
  --color-info: #64d2ff;

  /* RGB 变量，用于 rgba() */
  --bg-rgb: 30, 30, 30;
  --text-rgb: 245, 245, 247;
  --accent-rgb: 255, 255, 255;
  --color-primary-rgb: 10, 132, 255;
  --color-success-rgb: 50, 215, 75;
  --color-warning-rgb: 255, 214, 10;
  --color-danger-rgb: 255, 69, 58;
  --color-info-rgb: 100, 210, 255;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  -webkit-tap-highlight-color: transparent;
}

@media (max-width: 767px) {
  html.keyboard-viewport-locked,
  html.keyboard-viewport-locked body,
  html.keyboard-viewport-locked #app {
    height: var(--vh, 100dvh);
    max-height: var(--vh, 100dvh);
    overflow: hidden;
  }

  html.keyboard-viewport-locked body {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    width: 100%;
  }

  *,
  *::before,
  *::after {
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
  }
}

html {
  background-color: var(--bg-app);
  height: 100dvh;
  overflow: hidden;
  overscroll-behavior: none;
}

body {
  font-family: var(--font-stack);
  background-color: var(--bg-app);
  height: 100dvh;
  width: 100%;
  display: flex;
  color: var(--text-primary);
  overflow: hidden;
  overscroll-behavior: none;
  font-size: 13px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  letter-spacing: -0.005em;
}

#app {
  width: 100%;
  height: 100%;
  overscroll-behavior: none;
}

/* 隐藏滚动条但保持滚动功能 */
::-webkit-scrollbar {
  width: 0px;
  height: 0px;
  display: none;
}

::-webkit-scrollbar-thumb {
  display: none;
}

::-webkit-scrollbar-track {
  display: none;
}

::-webkit-scrollbar-corner {
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
  align-items: center !important;
  display: inline-flex !important;
  justify-content: center !important;
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

:global(.basic-modal-open) .app-layout {
  transform: translateY(var(--visual-viewport-offset-top, 0px));
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

.content-wrapper {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.app-content {
  display: flex;
  flex: 1;
  min-width: 400px;
  min-height: 0;
  overflow: hidden;
  position: relative;
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-main-surface);
  border-top-left-radius: var(--radius-lg);
  box-shadow: 0 -1px 0 var(--border-subtle);
}

.app-page-host {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.app-page-shell {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.app-page-shell.without-left-panel {
  flex-direction: column;
  background: var(--bg-main-surface);
}

.global-left-panel {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--bg-sidebar-surface);
}

.global-left-panel-content {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}

.global-terminal {
  flex-shrink: 0;
  border-left: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
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


.file-icon {
  display: flex;
  align-items: center;
}

.app-loading {
  width: 100%;
  height: 100%;
  background-color: var(--bg-app);
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
