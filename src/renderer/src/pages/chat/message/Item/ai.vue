<script setup lang="ts">
const props = defineProps<{
  message: BaseMessage
}>()
const { getProviderById } = useSettingsStore()
const Stop = useIcon('Stop')
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
            <span class="msg-time">{{
              new Date(message.metadata?.date || '').toLocaleString()
              }}</span>
          </div>
          <Button v-if="message.metadata?.loading && !message.metadata?.error" size="sm" @click="message.metadata?.stop"
            variant="icon" type="button">
            <template #icon>
              <Stop style="color: red" />
            </template>
          </Button>
        </div>
      </div>
      <ChatMessageItemRagSearch :searching="message.metadata?.ragSearching"
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
  background-color: var(--bg-hover);
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
  justify-content: space-between;
  height: 32px;
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
</style>
