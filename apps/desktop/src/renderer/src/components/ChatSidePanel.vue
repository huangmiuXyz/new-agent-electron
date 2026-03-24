<script setup lang="ts">
import Tabs from './Tabs.vue'
import SpeechSidebar from './SpeechSidebar.vue'
import ChatCanvasPanel from './ChatCanvasPanel.vue'

const settingsStore = useSettingsStore()
const speechStore = useSpeechStore()

const props = defineProps<{
  collapsed?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const panelTabs = computed(() => ([
  {
    id: 'canvas',
    name: '画布'
  },
  {
    id: 'playlist',
    name: speechStore.queue.length > 0 ? `播放列表 (${speechStore.queue.length})` : '播放列表'
  }
]))
</script>

<template>
  <div class="chat-side-panel" :class="{ collapsed: props.collapsed }">
    <div class="chat-side-panel-header">
      <Tabs v-model="settingsStore.display.assistantSidebarTab" :items="panelTabs" size="sm" />
      <Button size="sm" variant="secondary" @click="emit('close')">收起</Button>
    </div>

    <div class="chat-side-panel-body">
      <ChatCanvasPanel v-if="settingsStore.display.assistantSidebarTab === 'canvas'" />
      <SpeechSidebar v-else />
    </div>
  </div>
</template>

<style scoped>
.chat-side-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  border-left: 1px solid var(--border-color);
}

.chat-side-panel.collapsed {
  display: none;
}

.chat-side-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}

.chat-side-panel-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.chat-side-panel-body :deep(.speech-sidebar) {
  border-left: none;
}
</style>
