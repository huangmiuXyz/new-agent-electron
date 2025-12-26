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
const route = useRoute()

const pageTitle = computed(() => {
  if (props.currentView === 'chat') {
    // 聊天列表页不显示中间标题，仅在详情页显示
    if (route.path === '/mobile/chat') return ''
    return chatsStore.currentChat?.title || '新的聊天'
  }
  if (props.currentView === 'settings') {
    const path = route.path
    if (path.includes('/mobile/settings/knowledge')) return '知识库详情'
    if (path.includes('/mobile/settings/models')) return '模型提供商'

    const tab = route.params.tab as string
    const tabMap: Record<string, string> = {
      agents: '智能体',
      models: '模型设置',
      defaultModels: '默认模型',
      knowledge: '知识库',
      terminal: '终端设置',
      display: '显示设置',
      mcp: 'MCP',
      userData: '用户数据',
      about: '关于'
    }
    return tabMap[tab] || '设置'
  }
  return ''
})
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
      <div v-if="isMobile" class="header-title-container">
        <div class="header-title">{{ pageTitle }}</div>
      </div>
      <Button v-if="props.currentView === 'chat'" variant="icon" size="md" @click="createNewChat">
        <CommentAdd16Regular />
      </Button>
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
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  justify-content: center;
  align-items: center;
  pointer-events: none;
  z-index: 0;
  max-width: 60%;
}

.header-title {
  font-weight: 600;
  font-size: 15px;
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
