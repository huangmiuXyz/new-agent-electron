<script setup lang="ts">
import { useSettingsStore } from '@renderer/stores/settings'

const settingsStore = useSettingsStore()
</script>

<template>
  <div class="chat-app">
    <!-- 左侧边栏 -->
    <div class="sidebar-wrapper" :class="{ collapsed: settingsStore.display.sidebarCollapsed }">
      <ChatSidebar />
    </div>

    <!-- 主聊天区域 -->
    <main class="main-chat">
      <!-- 消息列表 -->
      <ChatMessageList />

      <!-- 输入框 -->
      <ChatMessageInput />
    </main>
  </div>
</template>

<style scoped>
.chat-app {
  font-family: var(--font-stack);
  background-color: var(--bg-app);
  height: 100%;
  width: 100%;
  display: flex;
  color: var(--text-primary);
  overflow: hidden;
  font-size: 13px;
  /* 保持精细的字体大小 */
  -webkit-font-smoothing: antialiased;
}

/* === 主区域：干净、通透 === */
.main-chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bg-app);
  position: relative;
}

.sidebar-wrapper {
  width: auto;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  width: 200px;
}

.sidebar-wrapper.collapsed {
  width: 0;
}
</style>
