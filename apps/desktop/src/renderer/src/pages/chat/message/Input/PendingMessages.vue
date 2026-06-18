<script setup lang="ts">
import { FileUIPart, TextUIPart } from 'ai'

defineProps<{
  pendingMessages: Array<{ id: string; parts: Array<FileUIPart | TextUIPart> }>
  isGenerating: boolean
}>()

const emit = defineEmits<{
  guide: [messageId: string]
  remove: [messageId: string]
}>()

const PendingIcon = useIcon('FormatListBulleted')
const CloseIcon = useIcon('Close')
const SendIcon = useIcon('Send')

const getPendingMessagePreview = (parts: Array<FileUIPart | TextUIPart>): string => {
  const textParts = parts.filter((p): p is TextUIPart => p.type === 'text')
  const fileParts = parts.filter((p): p is FileUIPart => p.type === 'file')
  const audioParts = fileParts.filter((p) => p.mediaType?.startsWith('audio/'))
  const otherFileParts = fileParts.filter((p) => !p.mediaType?.startsWith('audio/'))

  let preview = textParts.map((p) => p.text).join(' ')
  if (audioParts.length > 0) {
    const audioText = audioParts.length === 1 ? '[音频]' : `[${audioParts.length}段音频]`
    preview = preview ? `${preview} ${audioText}` : audioText
  }
  if (otherFileParts.length > 0) {
    const fileText = otherFileParts.length === 1 ? '[文件]' : `[${otherFileParts.length}个文件]`
    preview = preview ? `${preview} ${fileText}` : fileText
  }

  return preview.length > 50 ? `${preview.substring(0, 50)}...` : preview || '[空消息]'
}
</script>

<template>
  <div v-if="pendingMessages.length > 0" class="pending-messages-container">
    <div class="pending-messages-header">
      <PendingIcon class="pending-icon" />
      <span class="pending-title">预发送队列 ({{ pendingMessages.length }})</span>
      <span v-if="isGenerating" class="pending-status">等待AI回复中...</span>
    </div>
    <div class="pending-messages-list">
      <div v-for="item in pendingMessages" :key="item.id" class="pending-message-item">
        <span class="pending-message-text">{{ getPendingMessagePreview(item.parts) }}</span>
        <div class="pending-message-actions">
          <Button
            variant="text"
            size="sm"
            class="guide-btn"
            title="停止当前生成，并让这条消息下一条进入上下文"
            @click="emit('guide', item.id)"
          >
            <template #icon>
              <SendIcon />
            </template>
            引导
          </Button>
          <Button variant="icon" size="sm" class="remove-btn" @click="emit('remove', item.id)">
            <CloseIcon />
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pending-messages-container {
  margin-bottom: 8px;
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 8px 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
}

.pending-messages-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-size: 11px;
  color: var(--text-secondary);
}

.pending-icon {
  width: 14px;
  height: 14px;
  color: var(--color-primary);
}

.pending-title {
  font-weight: 500;
}

.pending-status {
  margin-left: auto;
  color: var(--text-tertiary);
  font-style: italic;
}

.pending-messages-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pending-message-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: var(--bg-hover);
  border-radius: 8px;
  font-size: 12px;
  transition: background-color 0.2s;
}

.pending-message-item:hover {
  background: var(--bg-active);
}

.pending-message-text {
  color: var(--text-primary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-right: 8px;
}

.pending-message-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.guide-btn {
  color: var(--color-primary);
}

.guide-btn:hover {
  color: var(--color-primary);
  opacity: 0.9;
}

.remove-btn {
  opacity: 0.6;
  transition: opacity 0.2s;
}

.remove-btn:hover {
  opacity: 1;
  color: var(--color-danger);
}
</style>
