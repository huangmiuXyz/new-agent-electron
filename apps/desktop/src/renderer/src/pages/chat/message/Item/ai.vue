<script setup lang="ts">
import { computed } from 'vue'
import { getFlatTokenUsage } from '@renderer/services/chatService/tokenUsage'

const props = defineProps<{
  message: BaseMessage
}>()
const settingsStore = useSettingsStore()
const chatsStore = useChatsStores()
const agentStore = useAgentStore()
const speechStore = useSpeechStore()
const { Stop, VolumeMedium, Robot } = useIcon(['Stop', 'VolumeMedium', 'Robot'])

const currentAgentAvatar = computed(() => {
  const currentAgentId = chatsStore.currentChat?.agentId
  if (!currentAgentId) return ''
  return agentStore.getAgentById(currentAgentId)?.avatar || ''
})

const hasAudioChunks = computed(() => {
  return (props.message.metadata?.audio?.chunks?.length ?? 0) > 0
})

const flatUsage = computed(() => getFlatTokenUsage(props.message.metadata?.usage))

const isCurrentPlaying = computed(() => {
  return (
    speechStore.isPlaying &&
    speechStore.queue.some((chunk) => chunk.messageId === props.message.id && !chunk.played)
  )
})

const playMessageAudio = () => {
  if (isCurrentPlaying.value) {
    speechStore.stop()
    return
  }

  const currentChatMessages = chatsStore.currentChat?.messages || []
  const queueChunks = currentChatMessages.flatMap((message) => {
    const audioChunks = message.metadata?.audio?.chunks?.filter((chunk) => chunk.data) || []

    return audioChunks.map((chunk, chunkIndex) => ({
      id: `${message.id}-audio-${chunkIndex}`,
      messageId: message.id,
      text: chunk.text,
      audioData: chunk.data,
      duration: chunk.duration,
      error: chunk.error,
      played: false,
      loading: false
    }))
  })

  if (queueChunks.length === 0) {
    return
  }

  const targetChunk = queueChunks.find((chunk) => chunk.messageId === props.message.id)
  speechStore.replaceQueue(queueChunks, targetChunk?.id)
  settingsStore.display.assistantSidebarTab = 'playlist'

  if (settingsStore.display.speechSidebarCollapsed) {
    settingsStore.display.speechSidebarCollapsed = false
  }
}
</script>

<template>
  <div class="msg-row them has-avatar">
    <div class="msg-content">
      <div class="msg-meta">
        <div class="msg-avatar-area">
          <Image
            v-if="currentAgentAvatar"
            :src="currentAgentAvatar"
            class="msg-avatar"
            alt="avatar"
          />
          <div v-else class="msg-avatar-fallback">
            <Robot />
          </div>
        </div>

        <div class="msg-meta-content">
          <span class="msg-name">{{ message.metadata?.model }}</span>

          <div
            v-if="flatUsage.totalTokens || flatUsage.inputTokens || flatUsage.outputTokens"
            class="msg-usage"
          >
            <span v-if="flatUsage.inputTokens || flatUsage.outputTokens"
              >Tokens: {{ flatUsage.totalTokens }}</span
            >
            <span v-if="flatUsage.inputTokens">↑{{ flatUsage.inputTokens }}</span>
            <span v-if="flatUsage.outputTokens">↓{{ flatUsage.outputTokens }}</span>
          </div>
        </div>
      </div>
      <ChatMessageItemRagSearch
        :searching="!message.metadata?.ragSearchDetails?.length && !!message.metadata?.ragEnabled"
        :search-details="message.metadata?.ragSearchDetails"
      />
      <div
        v-if="
          !message.metadata?.error &&
          message.metadata?.loading &&
          message.parts.findIndex((e) => e.type === 'step-start') === -1
        "
        class="loading-container"
        :class="{ 'is-mobile': isMobile }"
      >
        <div class="loading-dots">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </div>
      </div>
      <ChatMessageItemContent markdown :message="message" />

      <div
        v-if="
          hasAudioChunks ||
          (message.metadata?.loading && !message.metadata?.error && message.metadata.stop)
        "
        class="msg-actions"
      >
        <Button
          v-if="hasAudioChunks"
          size="sm"
          @click="playMessageAudio"
          variant="icon"
          type="button"
          :class="{ 'is-active': isCurrentPlaying }"
        >
          <template #icon>
            <VolumeMedium
              :style="{ color: isCurrentPlaying ? 'var(--accent-color)' : 'inherit' }"
            />
          </template>
        </Button>
        <Button
          v-if="message.metadata?.loading && !message.metadata?.error && message.metadata.stop"
          size="sm"
          @click="message.metadata?.stop"
          variant="icon"
          type="button"
        >
          <template #icon>
            <Stop style="color: red" />
          </template>
        </Button>
      </div>

      <MessageTranslation
        v-if="message.metadata?.translations || message.metadata?.translationLoading"
        :translations="message.metadata.translations"
        :translationLoading="message.metadata.translationLoading"
        :translationController="message.metadata.translationController"
        @stopTranslation="() => message.metadata?.translationController?.()"
      />
    </div>
  </div>
</template>

<style scoped>
.msg-row {
  padding: 8px 20px;
  display: flex;
  gap: 16px;
  position: relative;
  transition: background-color 0.2s;
  border-bottom: 1px solid transparent;
}

.msg-row:hover {
  /* background-color: var(--bg-tertiary-hover); */
}

.msg-avatar-area {
  padding-top: 2px;
}

.msg-avatar {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background-color: var(--border-color-medium);
  object-fit: cover;
}

.msg-avatar-fallback {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: var(--bg-hover);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.msg-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.msg-meta {
  display: flex;
  flex-direction: column;
  margin-bottom: 4px;
}

.msg-meta-content {
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
  min-height: 32px;
  align-items: flex-start;
}

.msg-usage {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: var(--text-tertiary);
  margin-top: 1px;
  line-height: 1;
}

.msg-usage span {
  display: flex;
  align-items: center;
}

.msg-meta {
  flex-direction: row;
  gap: 8px;
}

.msg-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.msg-name {
  font-weight: 600;
  font-size: 13px;
  color: var(--text-primary);
}

.msg-time {
  font-size: 11px;
  color: var(--text-sub);
}

/* Loading indicator styles */
.loading-container {
  padding: 8px 0;
}

.loading-container.is-mobile {
  padding-top: 14px;
}

.loading-dots {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--accent-color);
  animation: pulse 1.4s ease-in-out infinite;
}

.dot:nth-child(1) {
  animation-delay: 0s;
}

.dot:nth-child(2) {
  animation-delay: 0.2s;
}

.dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes pulse {
  0%,
  80%,
  100% {
    opacity: 0.3;
    transform: scale(0.8);
  }

  40% {
    opacity: 1;
    transform: scale(1);
  }
}

.speech-control-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.speech-queue-popup {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 300px;
  max-height: 400px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.queue-title {
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.queue-list {
  overflow-y: auto;
  padding: 4px 0;
}

.queue-item {
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-bottom: 1px solid var(--border-color-light);
  transition: background-color 0.2s;
}

.queue-item:last-child {
  border-bottom: none;
}

.queue-item.is-played {
  opacity: 0.5;
}

.queue-item.is-playing {
  background: rgba(var(--accent-rgb), 0.1);
  border-left: 3px solid var(--accent-color);
}

.queue-item.is-loading {
  font-style: italic;
}

.queue-item-text {
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.queue-item-status {
  font-size: 11px;
  color: var(--accent-color);
  font-weight: 500;
}
</style>
