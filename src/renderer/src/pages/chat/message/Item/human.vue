<script setup lang="ts">

const props = defineProps<{
  message: BaseMessage
}>();
</script>

<template>
  <div class="msg-row me has-gap">
    <div class="msg-content">
      <div class="msg-bubble">
        <ChatMessageItemContent :message="message" />
      </div>
    </div>
  </div>
  <div class="translation-row">
    <MessageTranslation v-if="message.metadata?.translations" :translations="message.metadata.translations" />
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
  background-color: #fafafa;
}

.msg-row.has-gap {
  margin-top: 12px;
}

.msg-bubble {
  font-size: 14px;
  line-height: 1.5;
  /* 自己的气泡样式 */
  background-color: var(--bubble-me, #007AFF);
  color: #fff;
  padding: 8px 14px;
  border-radius: 12px 12px 2px 12px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  word-wrap: break-word;
}
</style>
