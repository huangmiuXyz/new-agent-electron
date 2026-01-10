<script setup lang="ts">
import { nanoid } from 'nanoid'
const props = defineProps<{
  message: BaseMessage
}>()
const settingsStore = useSettingsStore()
const { speechEnabled } = storeToRefs(settingsStore)
const { getProviderById } = settingsStore
const speechStore = useSpeechStore()
const Stop = useIcon('Stop')
const VolumeMedium = useIcon('VolumeMedium')

const isCurrentPlaying = computed(() => {
  return speechStore.isPlaying && speechStore.queue.some(chunk => chunk.messageId === props.message.id && !chunk.played)
})

const showPlayer = ref(false)
const togglePlayer = () => {
  if (isCurrentPlaying.value) {
    speechStore.stop()
    showPlayer.value = false
    return
  }

  showPlayer.value = !showPlayer.value

  // Auto-play when showing player if not already playing
  if (showPlayer.value) {
    if (props.message.metadata?.audio?.chunks) {
      speechStore.clearQueue()
      props.message.metadata.audio.chunks.forEach(chunk => {
        speechStore.addToQueue({
          id: nanoid(),
          messageId: props.message.id,
          text: chunk.text,
          audioData: chunk.data,
          played: false,
          loading: false
        })
      })
    }
  }
}

// Auto show player when playback starts for this message
watch(isCurrentPlaying, (playing) => {
  if (playing) {
    showPlayer.value = true
  }
})
</script>

<template>
  <div class="msg-row them has-avatar">
    <div v-if="!isMobile" class="msg-avatar-area">
      <Image :src="getProviderById(message.metadata?.provider!)?.logo" class="msg-avatar" alt="avatar" />
    </div>

    <div class="msg-content">
      <div class="msg-meta" :class="{ isMobile }">
        <div v-if="isMobile" class="msg-avatar-area">
          <Image :src="getProviderById(message.metadata?.provider!)?.logo" class="msg-avatar" alt="avatar" />
        </div>

        <div style="display: flex; align-items: center;justify-content: space-between;flex: 1">
          <div class="msg-meta-content" :class="{ isMobile }">
            <span class="msg-name">{{ message.metadata?.model }}</span>

            <div v-if="message.metadata?.usage" class="msg-usage">
              <span>Tokens: {{ message.metadata.usage.totalTokens }}</span>
              <span>↑{{ message.metadata.usage.inputTokens }}</span>
              <span>↓{{ message.metadata.usage.outputTokens }}</span>
            </div>
          </div>
          <div style="display: flex; gap: 8px">
            <Button v-if="message.metadata?.audio?.chunks?.length" size="sm" @click="togglePlayer"
              variant="icon" type="button" :class="{ 'is-active': showPlayer }">
              <template #icon>
                <VolumeMedium :style="{ color: showPlayer ? 'var(--accent-color)' : 'inherit' }" />
              </template>
            </Button>
            <Button v-if="message.metadata?.loading && !message.metadata?.error" size="sm" @click="message.metadata?.stop"
              variant="icon" type="button">
              <template #icon>
                <Stop style="color: red" />
              </template>
            </Button>
          </div>
        </div>
      </div>
      <ChatMessageItemRagSearch
        :searching="!message.metadata?.ragSearchDetails?.length && message.metadata!.ragEnabled"
        :search-details="message.metadata?.ragSearchDetails" />
      <div v-if="
        !message.metadata?.error &&
        message.metadata?.loading &&
        message.parts.findIndex((e) => e.type === 'step-start') === -1
      " class="loading-container">
        <div class="loading-dots">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </div>
      </div>
      <ChatMessageItemContent markdown :message="message" />

      <SpeechPlayer v-if="showPlayer && message.metadata?.audio?.chunks"
        :message-id="message.id"
        :chunks="message.metadata.audio.chunks" />

      <MessageTranslation v-if="message.metadata?.translations || message.metadata?.translationLoading"
        :translations="message.metadata.translations" :translationLoading="message.metadata.translationLoading"
        :translationController="message.metadata.translationController"
        @stopTranslation="() => message.metadata?.translationController?.()" />
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

.msg-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.msg-meta {
  display: flex;
  flex-direction: column;
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

.msg-meta.isMobile {
  flex-direction: row;
  gap: 8px;
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
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
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
