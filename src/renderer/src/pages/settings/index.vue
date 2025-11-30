<script setup lang="ts">
const activeTab = ref('models')

const switchTab = (tabName: string) => {
  activeTab.value = tabName
}
</script>

<template>
  <div class="settings-layout">
    <!-- 设置-左侧分类导航 -->
    <SettingsSidebar :active-tab="activeTab" @tab-change="switchTab" />

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
</style>
