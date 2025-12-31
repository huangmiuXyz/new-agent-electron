<script setup lang="ts">
import { isMobile } from '@renderer/composables/useDeviceType'

const props = defineProps<{
  currentView: string
  mode?: 'list' | 'detail'
}>()

const isListMode = computed(() => {
  if (props.mode) return props.mode === 'list'
  return isMobile.value && (route.path === '/mobile/chat/list' || route.path === '/mobile/settings/list' || route.path === '/mobile/notes/list')
})

const { customTitle } = useAppHeader()
const settingsStore = useSettingsStore()
const chatsStore = useChatsStores()

const { Search, PanelOpen, PanelClose, CommentAdd16Regular, ArrowBackIosNewSharp, NoteAdd24Regular } = useIcon([
  'Search',
  'PanelOpen',
  'PanelClose',
  'CommentAdd16Regular',
  'ArrowBackIosNewSharp',
  'NoteAdd24Regular'
])
const showSearch = ref(false)

const openSearch = () => {
  showSearch.value = true
}

const toggleSidebar = () => {
  settingsStore.display.sidebarCollapsed = !settingsStore.display.sidebarCollapsed
}

const createNewChat = () => {
  chatsStore.createChat()
}

const notesStore = useNotesStore()
const { confirm } = useModal()
const { back } = useMobile()
const route = useRoute()

</script>

<template>
  <header class="app-header drag" :class="{ 'is-mobile-list': isListMode }">
    <div v-if="!isListMode" :style="{
      marginLeft: isMobile ? '0' : '48px',
      justifyContent: props.currentView === 'chat' ? 'space-between' : ''
    }" :class="{ isMobile }" class="header-info drag">
      <Button v-if="!isMobile" variant="icon" size="md" @click="toggleSidebar">
        <component :is="settingsStore.display.sidebarCollapsed ? PanelOpen : PanelClose" />
      </Button>
      <Button v-if="isMobile && !isListMode" variant="icon" size="md" @click="back">
        <ArrowBackIosNewSharp />
      </Button>
      <div v-if="isMobile" class="header-title-container">
        <div class="header-title">{{ customTitle }}</div>
      </div>
      <Button v-if="props.currentView === 'chat' && !isMobile" variant="icon" size="md" @click="createNewChat">
        <component :is="CommentAdd16Regular" />
      </Button>
    </div>

    <!-- 移动端列表页特有头部 -->
    <div v-if="isListMode" class="mobile-list-header no-drag">
      <h1 class="mobile-title">{{ route.path.includes('/chat') ? '对话' : (route.path.includes('/settings') ?
        '设置' : '笔记') }}</h1>
      <div v-if="route.path.includes('/chat') || route.path.includes('/notes')" class="mobile-header-actions">
        <button v-if="route.path.includes('/chat')" class="mobile-action-btn" @click="openSearch">
          <component :is="Search" />
        </button>
        <button v-if="route.path.includes('/chat')" class="mobile-action-btn" @click="createNewChat">
          <component :is="CommentAdd16Regular" />
        </button>
      </div>
    </div>

    <div v-if="(!isMobile && props.currentView === 'chat')" class="header-actions no-drag">
      <Button v-if="props.currentView === 'chat'" variant="text" size="lg" @click="openSearch">
        <component :is="Search" />
      </Button>
    </div>

    <!-- 全局搜索组件 -->
    <GlobalSearch v-model="showSearch" />
  </header>
</template>

<style scoped>
/* 头部：磨砂玻璃效果，极简边框 */
.app-header {
  --mobile-header-h: 56px;
  height: calc(var(--header-h) + env(safe-area-inset-top));
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-header);
  padding-top: env(safe-area-inset-top);
  backdrop-filter: blur(12px);
  position: sticky;
  top: 0;
  z-index: 10;
  transition: background-color 0.3s, border-color 0.3s;
}

@media screen and (max-width: 768px) {
  .app-header {
    position: relative;
    top: 0;
    left: 0;
    width: 100%;
    height: auto;
    min-height: calc(var(--mobile-header-h) + env(safe-area-inset-top));
    border-bottom: 0.5px solid var(--border-subtle);
    flex-shrink: 0;
    padding: env(safe-area-inset-top) 0 0;
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
    letter-spacing: -0.5px;
  }

  .mobile-header-actions {
    display: flex;
    gap: 12px;
  }

  .mobile-action-btn {
    background: var(--bg-modifier-hover);
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

@media screen and (max-width: 768px) {
  .header-title-container {
    height: var(--mobile-header-h);
  }
}

.header-title {
  font-weight: 600;
  font-size: 16px;
  /* 稍微加大标题字号 */
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
