<script setup lang="ts">
import { useSettingsStore } from '@renderer/stores/settings'
import { useAgentStore } from '@renderer/stores/agent'
import { useShortcuts } from '@renderer/composables/useShortcuts'
import Term from '@renderer/components/term.vue'
import { computed } from 'vue'

const settingsStore = useSettingsStore()
const agentStore = useAgentStore()
const chatsStore = useChatsStores()
const { register } = useShortcuts()

// isCollapsed 与 showTerminal 相反：显示时展开(false)，隐藏时折叠(true)
const terminalCollapsed = computed({
  get: () => !settingsStore.display.showTerminal,
  set: (val) => {
    settingsStore.display.showTerminal = !val
  }
})

// 注册聊天页面快捷键
onMounted(() => {
  // 清空上下文
  register({
    id: 'chat.clearContext',
    handler: () => {
      const chat = chatsStore.currentChat
      if (chat && chat.messages.length > 0) {
        chat.messages = []
      }
    }
  })
})
</script>

<template>
  <div class="chat-app">
    <!-- 背景层 -->
    <AgentBackground :backgrounds="agentStore.selectedAgent?.backgrounds" />

    <!-- 左侧边栏 -->
    <ResizeBox v-if="!isMobile"
      v-model:width="settingsStore.display.chatSidebarWidth"
      v-model:is-collapsed="settingsStore.display.sidebarCollapsed">
      <ChatSidebar />
    </ResizeBox>

    <!-- 主聊天区域 -->
    <main class="main-chat">
      <!-- 消息列表 -->
      <ChatMessageList />

      <!-- 终端区域 -->
      <ResizeBox 
        v-model:height="settingsStore.display.terminalHeight"
        v-model:is-collapsed="terminalCollapsed"
        direction="vertical"
        handle-position="top"
        :min-size="150"
        :max-size="600"
      >
        <Term />
      </ResizeBox>

      <!-- 输入框 -->
      <ChatMessageInput />
    </main>
  </div>
</template>

<style scoped>
.chat-app {
  font-family: var(--font-stack);
  /* background-color: var(--bg-app); */
  height: 100%;
  width: 100%;
  display: flex;
  color: var(--text-primary);
  overflow: hidden;
  font-size: 13px;
  /* 保持精细的字体大小 */
  -webkit-font-smoothing: antialiased;
  position: relative;
}

/* === 主区域：干净、通透 === */
.main-chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: transparent;
  position: relative;
}
</style>
