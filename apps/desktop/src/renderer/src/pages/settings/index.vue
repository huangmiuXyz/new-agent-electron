<script setup lang="ts">
const activeTab = ref('models')
const route = useRoute()

const availableTabs = new Set([
  'system',
  'agents',
  'skills',
  'models',
  'defaultModels',
  'knowledge',
  'plugins',
  'terminal',
  'display',
  'shortcuts',
  'sync',
  'mcp',
  'userData',
  'backup',
  'about'
])

watch(
  () => route.query.tab,
  (tab) => {
    if (!tab || Array.isArray(tab)) return
    if (availableTabs.has(tab)) {
      activeTab.value = tab
    }
  },
  { immediate: true }
)

const switchTab = (tabName: string) => {
  activeTab.value = tabName
}
</script>

<template>
  <div class="settings-layout">
    <Teleport v-if="!isMobile" defer to="#global-left-panel-content">
      <SettingsSidebar :active-tab="activeTab" @tab-change="switchTab" />
    </Teleport>

    <!-- 设置-右侧内容区 -->
    <div class="settings-content">
      <!-- 智能体管理 -->
      <SettingsAgents v-if="activeTab === 'agents'" />

      <!-- 技能管理 -->
      <SettingsSkillManager v-else-if="activeTab === 'skills'" />

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

      <!-- 系统设置 -->
      <SettingsSystem v-else-if="activeTab === 'system'" />

      <!-- 快捷键设置 -->
      <SettingsShortcuts v-else-if="activeTab === 'shortcuts'" />

      <!-- 同步设置 -->
      <SettingsSync v-else-if="activeTab === 'sync'" />

      <!-- MCP 设置 -->
      <SettingsMcp v-else-if="activeTab === 'mcp'" />

      <!-- User Data 设置 -->
      <SettingsUserData v-else-if="activeTab === 'userData'" />

      <!-- 备份与恢复 -->
      <SettingsBackup v-else-if="activeTab === 'backup'" />

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
  min-height: 0;
  z-index: 2;
  background: var(--bg-card);
}
</style>

<style>
.settings-page-wrapper {
  width: 70%;
  margin: 0 auto;
  margin-top: 20px;
  min-width: 640px;
}
</style>
