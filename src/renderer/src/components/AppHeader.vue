<script setup lang="ts">
import { ref } from 'vue'
import GlobalSearch from '@renderer/components/GlobalSearch.vue'
import { useSettingsStore } from '@renderer/stores/settings'
import { useChatsStores } from '@renderer/stores/chats'

const settingsStore = useSettingsStore()
const chatsStore = useChatsStores()

const { Search, PanelOpen, PanelClose, Plus } = useIcon(['Search', 'PanelOpen', 'PanelClose', 'Plus'])
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

</script>

<template>
  <header class="app-header drag">
    <div class="header-info no-drag">
      <Button variant="icon" size="md" @click="toggleSidebar">
        <component :is="settingsStore.display.sidebarCollapsed ? PanelOpen : PanelClose" />
      </Button>
      <Button variant="icon" size="md" @click="createNewChat">
        <Plus />
      </Button>
    </div>
    <div class="header-actions no-drag">
      <Button variant="text" size="lg" @click="openSearch">
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
  padding-right: 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-subtle);
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
  margin-left: 48px;
  width: 200px;
  padding: 0 10px;
  justify-content: space-between;
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
