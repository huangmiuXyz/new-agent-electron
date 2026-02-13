<script setup lang="ts">
import { useSettingsStore } from '@renderer/stores/settings'
import { useAgentStore } from '@renderer/stores/agent'
import { useShortcuts } from '@renderer/composables/useShortcuts'
import { useChat } from '@renderer/composables/useChat'

const settingsStore = useSettingsStore()
const agentStore = useAgentStore()
const chatsStore = useChatsStores()
const { register, setScope } = useShortcuts()

// 注册聊天页面快捷键
onMounted(() => {
  // 设置当前作用域为 chat
  setScope('chat')

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

  // 切换助手
  register({
    id: 'chat.switchAgent',
    handler: () => {
      const agents = agentStore.allAgents
      if (agents.length <= 1) return

      const currentIndex = agents.findIndex(a => a.id === agentStore.selectedAgentId)
      const nextIndex = (currentIndex + 1) % agents.length
      agentStore.selectAgent(agents[nextIndex].id)
    }
  })

  // 切换模型
  register({
    id: 'chat.switchModel',
    handler: () => {
      const providers = settingsStore.getAllProviders
      const flatModels: { model: Model; provider: Provider }[] = []

      // 构建模型列表
      providers.forEach(provider => {
        provider.models?.forEach(model => {
          if (model.active && model.category === 'text') {
            flatModels.push({ model, provider })
          }
        })
      })

      if (flatModels.length <= 1) return

      // 找到当前模型的索引
      const currentIndex = flatModels.findIndex(
        item => item.model.id === settingsStore.selectedModelId &&
                item.provider.id === settingsStore.selectedProviderId
      )

      const nextIndex = currentIndex === -1
        ? 0
        : (currentIndex + 1) % flatModels.length

      const next = flatModels[nextIndex]
      settingsStore.selectedModelId = next.model.id
      settingsStore.selectedProviderId = next.provider.id
    }
  })

  // 重写最后一条消息
  register({
    id: 'chat.regenerateLast',
    handler: () => {
      const chat = chatsStore.currentChat
      if (!chat || chat.messages.length === 0) return

      // 获取最后一条消息
      const lastMessage = chat.messages[chat.messages.length - 1]
      if (!lastMessage) return

      const { regenerate } = useChat(chat.id!)
      lastMessage.metadata?.stop?.()
      setTimeout(() => {
        regenerate(lastMessage.id!)
      })
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
