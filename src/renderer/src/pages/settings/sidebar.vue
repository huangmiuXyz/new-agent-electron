<script setup lang="ts">
interface Props {
  activeTab: string
}

interface Emits {
  (e: 'tab-change', tabName: string): void
}

defineProps<Props>()
const emit = defineEmits<Emits>()

const handleTabChange = (tabName: string) => {
  emit('tab-change', tabName)
}
const { Cpu, Server, Robot } = useIcon(['Cpu', 'Server', 'Robot'])
</script>

<template>
  <div class="settings-sidebar">
    <!-- 设置选项 -->
    <List class="settings-sidebar-list" type="gap" title="设置" :items="[
      { id: 'agents', name: '智能体', icon: Robot },
      { id: 'models', name: '模型提供商', icon: Cpu },
      { id: 'mcp', name: 'MCP 服务器', icon: Server },
      // { id: 'display', name: '显示设置', icon: Screen }
    ]" :active-id="activeTab" :key-field="'id'" :main-field="'name'" :logo-field="'icon'" @select="handleTabChange">
    </List>
  </div>
</template>

<style scoped>
/* 设置-左侧分类导航 */
.settings-sidebar {
  width: 200px;
  border-right: 1px solid var(--border-subtle);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--bg-sidebar);
  height: 100%;
}

/* 调整List组件的样式以匹配原有样式 */
:deep(.mode-gap) {
  width: 100%;
  padding: 0;
  border-right: none;
  background: transparent;
  /* 设置自定义的选中项背景颜色 */
  --bg-active: #e4e4e6;
}

/* 确保列表项背景色正确 */
:deep(.list-item) {
  background-color: transparent;
}

:deep(.list-item:hover) {
  background-color: var(--bg-hover);
}

:deep(.list-scroll-area) {
  padding: 0;
}

:deep(.list-title) {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  margin: 8px 0 4px 12px;
  margin-top: 0 !important;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding-left: 0;
}

:deep(.list-item) {
  padding: 8px 12px;
  gap: 10px;
}

:deep(.list-item:hover) {
  background: var(--bg-hover);
}

:deep(.list-item.is-active) {
  background: #e4e4e6;
  border-color: transparent;
}

:deep(.main-text) {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

:deep(.list-item.is-active .main-text) {
  color: var(--text-primary);
  font-weight: 600;
}

:deep(.media-icon) {
  font-size: 16px;
  color: var(--text-secondary);
}

:deep(.list-item.is-active .media-icon) {
  color: var(--text-primary);
}

.back-btn {
  margin-bottom: 12px;
  color: var(--text-secondary);
}

.back-btn:hover {
  color: var(--text-primary);
}
</style>
