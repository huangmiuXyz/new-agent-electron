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
