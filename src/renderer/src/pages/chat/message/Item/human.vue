<script setup lang="ts">

const props = defineProps<{
  message: BaseMessage
}>();
</script>

<template>
  <div>
    <div class="msg-row me has-gap">
      <div class="msg-content">
        <div class="msg-bubble">
          <ChatMessageItemContent :message="message" />
        </div>
      </div>
    </div>
    <div class="translation-row">
      <MessageTranslation v-if="message.metadata?.translations || message.metadata?.translationLoading"
        :translations="message.metadata.translations" :translationLoading="message.metadata.translationLoading"
        :translationController="message.metadata.translationController"
        @stopTranslation="() => message.metadata?.translationController?.()" />
    </div>
  </div>
</template>

<style scoped>
.msg-row {
  display: flex;
  position: relative;
  padding: 8px 20px;
  flex-direction: row-reverse;
  width: 100%;
}

.translation-row {
  width: 100%;
  padding: 0px 20px;
  padding-left: 65px;
}

.msg-row:hover {
  background-color: var(--bg-hover);
}

.msg-row.has-gap {
  margin-top: 12px;
}

.msg-bubble {
  font-size: 14px;
  line-height: 1.5;
  /* 自己的气泡样式 */
  background-color: var(--bubble-me, var(--accent-color));
  color: var(--accent-text);
  padding: 8px 14px;
  border-radius: 12px 12px 2px 12px;
  box-shadow: 0 2px 4px rgba(var(--text-rgb), 0.05);
  word-wrap: break-word;
}
</style>
