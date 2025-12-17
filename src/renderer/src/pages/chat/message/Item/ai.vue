<script setup lang="ts">

const props = defineProps<{
  message: BaseMessage
}>();
const { getProviderById } = useSettingsStore()
const Stop = useIcon('Stop')
</script>

<template>
  <div class="msg-row them has-avatar">
    <div class="msg-avatar-area">
      <Image :src="getProviderById(message.metadata?.provider!)?.logo" class="msg-avatar" alt="avatar" />
    </div>

    <div class="msg-content">

      <div class="msg-meta">
        <span class="msg-name">{{ message.metadata?.model }}</span>
        <span class="msg-time">{{ new Date(message.metadata!.date).toLocaleString() }}</span>
        <Button v-if="message.metadata?.loading" size="sm" @click="message.metadata?.stop" variant="icon" type='button'>
          <template #icon>
            <Stop style="color: red;" />
          </template>
        </Button>
      </div>
      <div
        v-if="!message.metadata?.error && message.metadata!.loading && message.parts.findIndex(e => e.type === 'step-start') === -1"
        class="loading-container">
        <div class="loading-dots">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </div>
      </div>
      <ChatMessageItemContent markdown :message="message" />

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
  background-color: #f9f9f9;
}

.msg-avatar-area {
  flex-shrink: 0;
  padding-top: 2px;
}

.msg-avatar {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background-color: #eee;
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
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  height: 20px;
}

.msg-name {
  font-weight: 600;
  font-size: 13px;
  color: #2c2c2c;
}

.msg-time {
  font-size: 11px;
  color: #999;
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
  background-color: #3b82f6;
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
</style>