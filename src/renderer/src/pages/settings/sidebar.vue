<script setup lang="ts">
import { isMobile } from '@renderer/composables/useDeviceType'

interface Props {
  activeTab: string
}
const { Cpu, Server, Robot, Box, Library16Filled, Folder, InfoCircle, Terminal, ChevronRight, Plugin } = useIcon([
  'Cpu',
  'Server',
  'Robot',
  'Box',
  'Library16Filled',
  'Folder',
  'InfoCircle',
  'Terminal',
  'ChevronRight',
  'Plugin'
])

const settingsList = [
  { id: 'agents', name: '智能体', icon: Robot, section: '智能助手' },
  { id: 'models', name: '模型提供商', icon: Cpu, section: '智能助手' },
  { id: 'defaultModels', name: '默认模型', icon: Box, section: '智能助手' },
  { id: 'knowledge', name: '知识库', icon: Library16Filled, section: '资源管理' },
  { id: 'mcp', name: 'MCP 服务器', icon: Server, section: '资源管理' },
  { id: 'plugins', name: '插件管理', icon: Plugin, section: '扩展功能' },
  { id: 'terminal', name: '终端设置', icon: Terminal, section: '系统与文件' },
  { id: 'userData', name: '文件管理', icon: Folder, section: '系统与文件' },
  { id: 'about', name: '关于我们', icon: InfoCircle, section: '其他' }
]
interface Emits {
  (e: 'tab-change', tabName: string, tabItem: typeof settingsList[number]): void
}

defineProps<Props>()
const emit = defineEmits<Emits>()
const handleTabChange = (tabName: string) => {
  const { setTitle } = useAppHeader()
  setTitle(tabName)
  emit('tab-change', tabName, settingsList.find(item => item.id === tabName)!)
}

</script>

<template>
  <div class="settings-sidebar" :class="{ 'is-mobile': isMobile }">
    <div v-if="isMobile" class="mobile-header">
      <h1 class="mobile-title">设置</h1>
    </div>
    <!-- 设置选项 -->
    <List class="settings-sidebar-list" :items="settingsList" :active-id="activeTab" :key-field="'id'"
      :main-field="'name'" :logo-field="'icon'" :show-header="isMobile" :render-header="(item) => item.section"
      @select="handleTabChange">
      <template #actions v-if="isMobile">
        <ChevronRight class="mobile-arrow" />
      </template>
    </List>
  </div>
</template>

<style scoped>
/* 设置-左侧分类导航 */
.settings-sidebar:not(.is-mobile) {
  border-right: 1px solid var(--border-subtle);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--bg-sidebar);
  height: 100%;
}

/* 移动端样式 */
.settings-sidebar.is-mobile {
  background-color: #f7f7f8;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* 防止容器本身产生多余滚动条 */
}

.mobile-header {
  flex-shrink: 0;
  /* 禁止头部压缩 */
  position: sticky;
  top: 0;
  z-index: 10;
  background-color: #f7f7f8;
  padding: calc(20px + env(safe-area-inset-top, 24px)) 20px 10px;
}

.mobile-title {
  font-size: 28px;
  font-weight: 800;
  color: var(--text-primary);
  margin: 0;
  letter-spacing: -0.5px;
}

.settings-sidebar.is-mobile :deep(.settings-sidebar-list) {
  flex: 1;
  overflow-y: auto;
}

.settings-sidebar.is-mobile :deep(.list-container) {
  background: transparent;
  padding: 12px;
  padding-bottom: 40px;
  /* 增加底部间距，防止被底部 Tab 遮挡 */
}

.settings-sidebar.is-mobile :deep(.group-header) {
  padding: 16px 16px 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: none;
  letter-spacing: normal;
}

.settings-sidebar.is-mobile :deep(.list-item) {
  background: #fff;
  margin-bottom: 0 !important;
  padding: 14px 16px;
  border-radius: 0;
  border-bottom: 1px solid #f0f0f0;
}

.settings-sidebar.is-mobile :deep(.list-item:first-of-type),
.settings-sidebar.is-mobile :deep(.group-header + .list-item) {
  border-top-left-radius: 12px;
  border-top-right-radius: 12px;
}

.settings-sidebar.is-mobile :deep(.media-icon) {
  font-size: 20px;
  color: var(--text-secondary);
}

.settings-sidebar.is-mobile :deep(.main-text) {
  font-size: 16px;
  font-weight: 500;
  color: var(--text-primary);
}

.mobile-arrow {
  font-size: 16px;
  color: var(--text-tertiary);
}

/* Original PC styles */
.settings-sidebar:not(.is-mobile) :deep(.mode-gap) {
  width: 100%;
  padding: 0;
  border-right: none;
  background: transparent;
  --bg-active: #e4e4e6;
}

.settings-sidebar:not(.is-mobile) :deep(.list-item) {
  background-color: transparent;
  padding: 8px 12px;
  gap: 10px;
  border-radius: 8px;
  margin: 2px 4px;
  transition: all 0.15s ease;
}

.settings-sidebar:not(.is-mobile) :deep(.list-item:hover) {
  background-color: rgba(0, 0, 0, 0.04);
}

.settings-sidebar:not(.is-mobile) :deep(.list-item.is-active) {
  background: rgba(0, 0, 0, 0.07);
  border-color: transparent;
}

.settings-sidebar:not(.is-mobile) :deep(.main-text) {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.settings-sidebar:not(.is-mobile) :deep(.list-item.is-active .main-text) {
  color: var(--text-primary);
  font-weight: 600;
}

.settings-sidebar:not(.is-mobile) :deep(.media-icon) {
  font-size: 16px;
  color: var(--text-secondary);
}

.settings-sidebar:not(.is-mobile) :deep(.list-item.is-active .media-icon) {
  color: var(--text-primary);
}
</style>

<style>
/* 确保分组标题后的第一个列表项也有上圆角 */
.settings-sidebar.is-mobile .list-scroll-area .group-header+.list-item {
  border-top-left-radius: 12px !important;
  border-top-right-radius: 12px !important;
}

/* 处理每个分组的最后一个列表项 */
.settings-sidebar.is-mobile .list-scroll-area .list-item.is-last {
  border-bottom-left-radius: 12px !important;
  border-bottom-right-radius: 12px !important;
  border-bottom: none !important;
}
</style>
