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
</template>

<style scoped>
.msg-row {
  display: flex;
  position: relative;
  /* 核心差异：反向排列，使内容靠右 */
  flex-direction: row-reverse;
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
