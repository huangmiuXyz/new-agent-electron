<script setup lang="ts">

const props = defineProps<{
  currentView: string
}>()

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
</script>

<template>
  <header class="app-header drag">
    <div :style="{
      marginLeft: isMobile ? '0' : '48px',
      justifyContent: props.currentView === 'chat' ? 'space-between' : ''
    }" :class="{ isMobile }" class="header-info drag">
      <Button v-if="!isMobile" variant="icon" size="md" @click="toggleSidebar">
        <component :is="settingsStore.display.sidebarCollapsed ? PanelOpen : PanelClose" />
      </Button>
      <Button v-if="isMobile && $route.path.split('/').length > 3" variant="icon" size="md" @click="back">
        <ArrowBackIosNewSharp />
      </Button>
      <Button v-if="props.currentView === 'chat' && (!isMobile || $route.path === '/mobile/chat')" variant="icon"
        size="md" @click="createNewChat">
        <CommentAdd16Regular />
      </Button>
      <div v-else class="header-title">设置</div>
    </div>
    <div v-if="!isMobile || (props.currentView === 'chat' && $route.path === '/mobile/chat')"
      class="header-actions no-drag">
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
  height: var(--header-h);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-header);
  backdrop-filter: blur(12px);
  position: sticky;
  top: 0;
  z-index: 10;
}

.header-info {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 180px;
  padding: 0 10px;
}

.header-info.isMobile {
  width: 100%;
}

.header-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
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
