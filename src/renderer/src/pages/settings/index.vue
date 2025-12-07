<script setup lang="ts">
import { ref } from 'vue'
import { useSettingsStore } from '@renderer/stores/settings'

const settingsStore = useSettingsStore()
const activeTab = ref('models')

const switchTab = (tabName: string) => {
  activeTab.value = tabName
}
</script>

<template>
  <div class="settings-layout">
    <!-- 设置-左侧分类导航 -->
    <div class="sidebar-wrapper" :class="{ collapsed: settingsStore.display.sidebarCollapsed }">
      <SettingsSidebar :active-tab="activeTab" @tab-change="switchTab" />
    </div>

    <!-- 设置-右侧内容区 -->
    <div class="settings-content">
      <!-- 智能体管理 -->
      <SettingsAgents v-if="activeTab === 'agents'" />

      <!-- 模型提供商设置 -->
      <SettingsProvider v-else-if="activeTab === 'models'" />

      <!-- 显示设置 -->
      <SettingsDisplay v-else-if="activeTab === 'display'" />

      <!-- MCP 设置 -->
      <SettingsMcp v-else-if="activeTab === 'mcp'" />
    </div>
  </div>
</template>

<style scoped>
.settings-layout {
  display: flex;
  overflow: hidden;
  background-color: var(--bg-app);
  height: 100%;
  width: 100%;
}

.settings-content {
  flex: 1;
  display: flex;
  min-width: 0;
}

.sidebar-wrapper {
  width: auto;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  /* 确保侧边栏有一个基础宽度容器 */
  width: 200px;
}

.sidebar-wrapper.collapsed {
  width: 0;
}
</style>
