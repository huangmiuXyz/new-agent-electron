<template>
  <main class="main-chat" :class="{ compact }">
    <ChatMessageList />
    <ChatMessageInput />
  </main>
</template>

<script setup lang="ts">
defineProps<{
  compact?: boolean
}>()
</script>

<style scoped>
.main-chat {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: transparent;
  position: relative;
}

.main-chat.compact {
  background: var(--bg-main-surface);
}

.main-chat.compact :deep(.footer) {
  padding: 8px;
}

.main-chat.compact :deep(.input-actions) {
  align-items: flex-start;
  gap: 8px;
}

.main-chat.compact :deep(.action-left) {
  min-width: 0;
  flex: 1;
  flex-wrap: wrap;
  row-gap: 4px;
}

.main-chat.compact :deep(.action-right) {
  flex-shrink: 0;
}

.main-chat.compact :deep(.messages-content.is-centered) {
  max-width: none;
}

.main-chat.compact :deep(.message-item-wrapper) {
  margin-bottom: 6px;
}
</style>
