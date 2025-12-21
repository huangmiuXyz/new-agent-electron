<script setup lang="ts">
import { useRoute } from 'vue-router'
import { useChatsStores } from '@renderer/stores/chats'
import { useSettingsStore } from '@renderer/stores/settings'
import { useAgentStore } from '@renderer/stores/agent'
import { useChat } from '@renderer/composables/useChat'

const route = useRoute()
const chatStore = useChatsStores()
const settingsStore = useSettingsStore()
const agentStore = useAgentStore()
const windowId = route.query.windowId as string

onMounted(async () => {
  await new Promise(resolve => setTimeout(resolve, 100))

  if (windowId) {
    const data = await window.api.getTempChatData(windowId)

    if (data) {
      const chatId = chatStore.createChat('临时会话', { isTemp: true })

      if (data.agent) {
        agentStore.addTempAgent(data.agent)
        await nextTick()
        agentStore.selectAgent(data.agent.id)

        const chat = chatStore.getChatById(chatId)
        if (chat) chat.agentId = data.agent.id
      } else if (data.agentId) {
        agentStore.selectAgent(data.agentId)
        const chat = chatStore.getChatById(chatId)
        if (chat) chat.agentId = data.agentId
      }

      if (data.model) {
        for (const provider of settingsStore.providers) {
          if (provider.models?.some(m => m.id === data.model)) {
            settingsStore.selectedProviderId = provider.id
            settingsStore.selectedModelId = data.model
            break
          }
        }
      }

      if (data.history && Array.isArray(data.history) && data.history.length > 0) {
        chatStore.updateMessages(chatId, data.history)
      }

      chatStore.setActiveChat(chatId)

      if (data.autoReply && data.history && data.history.length > 0) {
        const lastMessage = data.history[data.history.length - 1]
        if (lastMessage && lastMessage.role === 'user') {
          const { regenerate } = useChat(chatId)
          setTimeout(() => {
            regenerate(lastMessage.id)
          }, 500)
        }
      }
    }
  }
})
</script>

<template>
  <div class="temp-chat-app">
    <header class="temp-header">
      <div class="header-content">
        <span class="agent-name">{{ agentStore.selectedAgent?.name || '智能体' }}</span>
        <span class="temp-badge">临时会话</span>
      </div>
      <div class="drag-region"></div>
    </header>
    <main class="main-chat">
      <ChatMessageList />
      <ChatMessageInput />
    </main>
  </div>
</template>

<style scoped>
.temp-chat-app {
  font-family: var(--font-stack);
  background-color: var(--bg-app);
  height: 100vh;
  width: 100vw;
  display: flex;
  flex-direction: column;
}

.temp-header {
  height: 40px;
  background: var(--bg-sidebar);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  padding: 0 16px;
  flex-shrink: 0;
  position: relative;
  -webkit-app-region: drag;
  /* Allow window dragging */
}

.header-content {
  margin-left: 55px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.agent-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
}

.temp-badge {
  font-size: 10px;
  background: #f3f4f6;
  color: #6b7280;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid #e5e7eb;
}

.drag-region {
  flex: 1;
  height: 100%;
}

.main-chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #fff;
  position: relative;
  height: 100%;
  overflow: hidden;
}
</style>
