<script setup lang="ts">

const props = defineProps<{
  currentView: string
}>()

const { customTitle } = useAppHeader()
const settingsStore = useSettingsStore()
const chatsStore = useChatsStores()

const { Search, PanelOpen, PanelClose, CommentAdd16Regular, ArrowBackIosNewSharp } = useIcon([
  'Search',
  'PanelOpen',
  'PanelClose',
  'CommentAdd16Regular',
  'ArrowBackIosNewSharp'
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

const { back } = useMobile()
const route = useRoute()

</script>

<template>
  <header class="app-header drag"
    :class="{ 'is-transparent': isMobile && (route.path === '/mobile/chat/list' || route.path === '/mobile/settings/list') }">
    <div v-if="!isMobile || (route.path !== '/mobile/chat/list' && route.path !== '/mobile/settings/list')" :style="{
      marginLeft: isMobile ? '0' : '48px',
      justifyContent: props.currentView === 'chat' ? 'space-between' : ''
    }" :class="{ isMobile }" class="header-info drag">
      <Button v-if="!isMobile" variant="icon" size="md" @click="toggleSidebar">
        <component :is="settingsStore.display.sidebarCollapsed ? PanelOpen : PanelClose" />
      </Button>
      <Button v-if="isMobile && $route.path.split('/').length > 3" variant="icon" size="md" @click="back">
        <ArrowBackIosNewSharp />
      </Button>
      <div v-if="isMobile" class="header-title-container">
        <div class="header-title">{{ customTitle }}</div>
      </div>
      <Button v-if="props.currentView === 'chat' && !isMobile" variant="icon" size="md" @click="createNewChat">
        <CommentAdd16Regular />
      </Button>
    </div>
    <div v-if="(!isMobile && props.currentView === 'chat') || (isMobile && false)" class="header-actions no-drag">
      <Button v-if="props.currentView === 'chat'" variant="text" size="lg" @click="openSearch">
        <Search />
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
}

@media screen and (max-width: 768px) {
  .app-header {
    position: relative;
    top: 0;
    left: 0;
    width: 100%;
    height: calc(var(--mobile-header-h) + env(safe-area-inset-top));
    border-bottom: 0.5px solid var(--border-subtle);
    flex-shrink: 0;
  }

  .app-header.is-transparent {
    display: none;
  }

  .app-header.is-transparent * {
    visibility: hidden;
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
