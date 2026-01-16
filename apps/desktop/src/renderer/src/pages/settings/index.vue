<script setup lang="ts">

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

      <!-- 默认模型设置 -->
      <SettingsDefaultModels v-else-if="activeTab === 'defaultModels'" />

      <!-- 知识库设置 -->
      <SettingsKnowledge v-else-if="activeTab === 'knowledge'" />

      <!-- 插件管理 -->
      <SettingsPlugins v-else-if="activeTab === 'plugins'" />

      <!-- 终端设置 -->
      <SettingsTerminal v-else-if="activeTab === 'terminal'" />

      <!-- 显示设置 -->
      <SettingsDisplay v-else-if="activeTab === 'display'" />

      <!-- MCP 设置 -->
      <SettingsMcp v-else-if="activeTab === 'mcp'" />

      <!-- User Data 设置 -->
      <SettingsUserData v-else-if="activeTab === 'userData'" />

      <!-- 关于我们 -->
      <SettingsAbout v-else-if="activeTab === 'about'" />
    </div>
  </div>
</template>

<style scoped>
.settings-layout {
  display: flex;
  overflow: hidden;
  height: 100%;
  width: 100%;
}

.settings-content {
  flex: 1;
  display: flex;
  min-width: 0;
  z-index: 2;
  background: var(--bg-card);
}

.sidebar-wrapper {
  width: auto;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  width: 180px;
}

.sidebar-wrapper.isMobile {
  width: 100%;
  position: absolute;
  left: 0;
  z-index: 3;
  height: 100%;
}

.sidebar-wrapper.collapsed {
  width: 0;
}
</style>
