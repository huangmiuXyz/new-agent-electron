<script setup lang="ts">
import { isMobile } from '@renderer/composables/useDeviceType'
import { useShortcuts } from '@renderer/composables/useShortcuts'

const props = defineProps<{
  currentView: string
  mode?: 'list' | 'detail'
}>()

const isListMode = computed(() => {
  if (props.mode) return props.mode === 'list'
  return isMobile.value && (route.path === '/mobile/chat/list' || route.path === '/mobile/settings/list' || route.path === '/mobile/notes/list' || route.path === '/mobile/image')
})

const { customTitle, setTitle } = useAppHeader()
const settingsStore = useSettingsStore()
const chatsStore = useChatsStores()
const { register } = useShortcuts()
const switchView = inject('switchView') as (view: 'chat' | 'notes' | 'settings' | 'image' | 'my-apps') => void

const { Search, PanelOpen, PanelClose, CommentAdd16Regular, ArrowBackIosNewSharp, Settings, Artboard } = useIcon([
  'Search',
  'PanelOpen',
  'PanelClose',
  'CommentAdd16Regular',
  'ArrowBackIosNewSharp',
  'NoteAdd24Regular',
  'Settings',
  'Artboard'
])
const showSearch = ref(false)
const router = useRouter()
const isMacDesktop = computed(() => !isMobile.value && window.api?.process?.platform === 'darwin')
const isMacNativeFullscreen = ref(false)
const shouldHideHeader = computed(() => isMacDesktop.value && isMacNativeFullscreen.value)

const toggleImageSidebar = inject('toggleImageSidebar', null) as (() => void) | null

const openSearch = () => {
  showSearch.value = true
}

const toggleSidebar = () => {
  settingsStore.display.sidebarCollapsed = !settingsStore.display.sidebarCollapsed
}

const createNewChat = () => {
  chatsStore.createChat()
}

const openMobileCanvas = () => {
  router.push('/mobile/chat/canvas')
}

const { back } = useMobile()
const route = useRoute()
const isWindowsDesktop = computed(() => !isMobile.value && window.api?.process?.platform === 'win32')
const isMobileChatCanvasRoute = computed(() => route.path === '/mobile/chat/canvas')
let removeFullScreenListener: (() => void) | null = null

// 注册全局快捷键
onMounted(() => {
  if (isMacDesktop.value) {
    isMacNativeFullscreen.value = window.api.window.isFullScreen()
    removeFullScreenListener = window.api.window.onFullScreenChanged((isFullScreen) => {
      isMacNativeFullscreen.value = isFullScreen
    })
  }

  // 全局搜索
  register({
    id: 'global.search',
    handler: () => {
      showSearch.value = true
    }
  })

  // 新建对话
  register({
    id: 'global.newChat',
    handler: () => {
      if (props.currentView === 'chat') {
        createNewChat()
      }
    }
  })

  // 切换侧边栏
  register({
    id: 'global.toggleSidebar',
    handler: () => {
      if (!isMobile.value) {
        toggleSidebar()
      }
    }
  })

  // 切换右侧面板
  register({
    id: 'global.toggleRightPanel',
    handler: () => {
      if (!isMobile.value) {
        settingsStore.display.speechSidebarCollapsed = !settingsStore.display.speechSidebarCollapsed
      }
    }
  })

  // 页面切换快捷键
  register({
    id: 'navigation.switchToChat',
    handler: () => switchView('chat')
  })

  register({
    id: 'navigation.switchToNotes',
    handler: () => switchView('notes')
  })

  register({
    id: 'navigation.switchToImage',
    handler: () => switchView('image')
  })

  register({
    id: 'navigation.switchToSettings',
    handler: () => switchView('settings')
  })
})

onUnmounted(() => {
  removeFullScreenListener?.()
  removeFullScreenListener = null
})

watch(
  () => route.path,
  () => {
    if (!isMobile.value && route.path.startsWith('/my-apps')) {
      setTitle('我的应用')
    }
  },
  { immediate: true }
)

</script>

<template>
  <header
    v-if="!shouldHideHeader"
    class="app-header drag"
    :class="{ 'is-mobile-list': isListMode, 'is-windows-desktop': isWindowsDesktop }"
  >
    <div v-if="!isListMode" :style="{
      marginLeft: (isMobile || isWindowsDesktop) ? '0' : '68px'
    }" :class="{ isMobile, isWindowsDesktop }" class="header-info drag">
      <Button v-if="isWindowsDesktop && props.currentView === 'chat'" variant="icon" size="md" class="no-drag windows-search-left" @click="openSearch">
        <component :is="Search" />
      </Button>
      <Button v-if="!isMobile" variant="icon" size="md" @click="toggleSidebar">
        <component :is="settingsStore.display.sidebarCollapsed ? PanelOpen : PanelClose" />
      </Button>
      <Button v-if="isMobile && !isListMode" variant="icon" size="md" @click="back">
        <ArrowBackIosNewSharp />
      </Button>
      <div v-if="isMobile" class="header-title-container">
        <div class="header-title">{{ customTitle }}</div>
      </div>
      <Button
        v-if="isMobile && !isListMode && props.currentView === 'image' && toggleImageSidebar"
        variant="icon"
        size="md"
        @click="toggleImageSidebar"
      >
        <Settings />
      </Button>
      <Button
        v-if="isMobile && !isListMode && props.currentView === 'chat' && !isMobileChatCanvasRoute"
        variant="icon"
        size="md"
        title="画布"
        @click="openMobileCanvas"
      >
        <Artboard />
      </Button>
    </div>

    <!-- 移动端列表页特有头部 -->
    <div v-if="isListMode" class="mobile-list-header no-drag">
      <h1 class="mobile-title">{{ route.meta.title }}</h1>
      <div v-if="route.path.includes('/chat') || route.path.includes('/notes')" class="mobile-header-actions">
        <Button v-if="route.path.includes('/chat')" class="mobile-action-btn" @click="openSearch">
          <component :is="Search" />
        </Button>
        <Button v-if="route.path.includes('/chat')" class="mobile-action-btn" @click="createNewChat">
          <component :is="CommentAdd16Regular" />
        </Button>
      </div>
    </div>

    <div v-if="(!isMobile && props.currentView === 'chat' && !isWindowsDesktop)" class="header-actions no-drag">
      <Button v-if="props.currentView === 'chat'" variant="text" size="lg" @click="openSearch">
        <component :is="Search" />
      </Button>
    </div>

    <!-- 全局搜索组件 -->
    <GlobalSearch v-model="showSearch" />
  </header>
</template>

<style scoped>
/* 头部：macOS 振动玻璃工具栏 */
.app-header {
  --mobile-header-h: 56px;
  --desktop-header-h: 30px;
  height: calc(var(--header-h) + var(--safe-area-top, env(safe-area-inset-top)));
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-header);
  padding-top: var(--safe-area-top, env(safe-area-inset-top));
  -webkit-backdrop-filter: var(--vibrancy-blur);
  backdrop-filter: var(--vibrancy-blur);
  position: sticky;
  top: 0;
  z-index: 10;
  transition: background-color 0.3s, border-color 0.3s;
}

@media screen and (min-width: 769px) {
  .app-header {
    height: calc(var(--desktop-header-h) + var(--safe-area-top, env(safe-area-inset-top)));
  }
}

.app-header.is-windows-desktop {
  padding-right: 140px;
}

.windows-search-left {
  margin-right: 2px;
}

@media screen and (max-width: 768px) {
  .app-header {
    position: relative;
    top: 0;
    left: 0;
    width: 100%;
    height: auto;
    min-height: calc(var(--mobile-header-h) + var(--safe-area-top, env(safe-area-inset-top)));
    border-bottom: 0.5px solid var(--border-subtle);
    flex-shrink: 0;
    padding: var(--safe-area-top, env(safe-area-inset-top)) 0 0;
    display: block;
    /* 改为 block 以支持列表页大标题布局 */
  }

  .app-header.is-mobile-list {
    background-color: var(--bg-sidebar);
    border-bottom: none;
  }

  .mobile-list-header {
    padding: 20px 20px 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .mobile-title {
    font-size: 28px;
    font-weight: 800;
    color: var(--text-primary);
    margin: 0;
    letter-spacing: -0.022em;
  }

  .mobile-header-actions {
    display: flex;
    gap: 12px;
  }

  .mobile-action-btn {
    background: var(--bg-hover);
    border: none;
    border-radius: 50%;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-primary);
    cursor: pointer;
    transition: all 0.2s;
  }

  .mobile-action-btn:active {
    transform: scale(0.9);
    background: var(--bg-modifier-active);
  }

  .header-info.isMobile {
    height: var(--mobile-header-h);
    padding: 0 16px;
    display: flex;
    align-items: center;
    width: 100%;
  }

  .header-title-container {
    flex: 1;
    display: flex;
    justify-content: center;
    margin-right: 40px;
    /* 为左侧返回按钮留出平衡空间 */
  }
}

.header-info {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 180px;
  padding: 0 10px;
  position: relative;
  height: 100%;
}

.header-info.isMobile {
  width: 100%;
  justify-content: space-between;
}

.header-info.isWindowsDesktop {
  width: auto;
  padding-left: 8px;
}

.header-title-container {
  position: absolute;
  left: 50%;
  bottom: 0;
  height: var(--header-h);
  /* 锁定在除去安全区域后的内容区中心 */
  transform: translateX(-50%);
  display: flex;
  justify-content: center;
  align-items: center;
  pointer-events: none;
  z-index: 0;
  max-width: 60%;
}

@media screen and (min-width: 769px) {
  .header-title-container {
    height: var(--desktop-header-h);
  }
}

@media screen and (max-width: 768px) {
  .header-title-container {
    height: var(--mobile-header-h);
  }
}

.header-title {
  font-weight: 600;
  font-size: 15px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: -0.01em;
}

/* Ensure buttons are above the title for interaction */
.header-info button {
  position: relative;
  z-index: 1;
}

.header-status {
  font-size: 11px;
  color: var(--text-secondary);
  padding-left: 8px;
  border-left: 1px solid var(--border-subtle);
}

.header-actions {
  display: flex;
  gap: 8px;
  color: var(--text-secondary);
  margin-right: 8px;
}

.header-actions i {
  font-size: 18px;
  cursor: pointer;
  transition: color 0.2s;
}

.header-actions i:hover {
  color: var(--text-primary);
}
</style>
