<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import GlobalChatPanel from './GlobalChatPanel.vue'
import SpeechSidebar from './SpeechSidebar.vue'
import DownloadPanelContent from './DownloadPanelContent.vue'
import NotificationPanelContent from './NotificationPanelContent.vue'

// ChatCanvasPanel 的依赖链含 SandboxCodeEditor → monaco-editor（~100MB+），
// 异步加载确保仅在用户切换到 canvas tab 时才加载
const ChatCanvasPanel = defineAsyncComponent(() => import('./ChatCanvasPanel.vue'))

const settingsStore = useSettingsStore()

type RightPanelTab = 'chat' | 'canvas' | 'playlist' | 'downloads' | 'notifications'

const activeTab = computed(() => settingsStore.display.assistantSidebarTab as RightPanelTab)
</script>

<template>
  <div class="global-right-panel">
    <div class="panel-body custom-scrollbar">
      <GlobalChatPanel v-if="activeTab === 'chat'" />
      <ChatCanvasPanel v-else-if="activeTab === 'canvas'" />
      <SpeechSidebar v-else-if="activeTab === 'playlist'" />
      <DownloadPanelContent v-else-if="activeTab === 'downloads'" />
      <NotificationPanelContent v-else-if="activeTab === 'notifications'" />
    </div>
  </div>
</template>

<style scoped>
.global-right-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
}

.panel-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.panel-body :deep(.canvas-panel),
.panel-body :deep(.speech-sidebar),
.panel-body :deep(.global-chat-panel) {
  height: 100%;
  border-left: none;
}

.panel-body :deep(.canvas-panel) {
  min-height: 100%;
}
</style>
