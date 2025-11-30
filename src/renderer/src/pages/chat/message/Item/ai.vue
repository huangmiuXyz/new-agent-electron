<script setup lang="ts">
import type { BaseMessage } from "@langchain/core/messages";

const props = defineProps<{
  message: BaseMessage
}>();

const additionalKwargs = computed(() => props.message.additional_kwargs || {})
const provider = computed(() => (additionalKwargs.value as any).provider || {})
const time = computed(() => (additionalKwargs.value as any).time || '')
const reasoning_content = computed(() => (additionalKwargs.value as any).reasoning_content)
</script>

<template>
  <div class="msg-row them has-avatar" v-if="message.text">
    <div class="msg-avatar-area">
      <img :src="provider.logo" class="msg-avatar" alt="avatar">
    </div>

    <div class="msg-content">

      <div class="msg-meta">
        <span class="msg-name">{{ provider.name || message.getType() }}</span>
        <span class="msg-time">{{ time }}</span>
      </div>
      <ChatMessageItemReasoning_content :reasoning_content="reasoning_content" v-if="reasoning_content" />
      <ChatMessageItemContent :message="message" />
    </div>
  </div>
</template>

<style scoped>
.msg-row {
  display: flex;
  padding: 12px 20px;
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
</style>