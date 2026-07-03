<script setup lang="ts">
import { FileUIPart, TextUIPart } from 'ai'
import { ref } from 'vue'

const props = defineProps<{
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
const CheckCircleFillIcon = useIcon('CheckCircle')
const MediaIcon = useIcon('FileMusic')
const FileAttachIcon = useIcon('File')

const guidedIds = ref(new Set<string>())

const getTextPreview = (parts: Array<FileUIPart | TextUIPart>): string => {
  const textParts = parts.filter((p): p is TextUIPart => p.type === 'text')
  const preview = textParts.map((p) => p.text).join(' ').trim()
  if (!preview) return ''
  return preview.length > 36 ? `${preview.substring(0, 36)}...` : preview
}

const getAudioCount = (parts: Array<FileUIPart | TextUIPart>): number => {
  return parts.filter((p): p is FileUIPart => p.type === 'file' && p.mediaType?.startsWith('audio/')).length
}

const getFileCount = (parts: Array<FileUIPart | TextUIPart>): number => {
  return parts.filter((p): p is FileUIPart => p.type === 'file' && !p.mediaType?.startsWith('audio/')).length
}

const handleGuide = (id: string) => {
  guidedIds.value = new Set([...guidedIds.value, id])
  emit('guide', id)
}

const isGuided = (id: string) => guidedIds.value.has(id)
</script>

<template>
  <div v-if="pendingMessages.length > 0" class="pending-messages-container">
    <div class="pending-messages-header">
      <PendingIcon class="pending-icon" />
      <span class="pending-title">队列 ({{ pendingMessages.length }})</span>
      <span v-if="isGenerating" class="pending-status">
        <span class="pending-dot"></span>
        <span>等待回复</span>
      </span>
    </div>
    <div class="pending-messages-list">
      <div
        v-for="item in pendingMessages"
        :key="item.id"
        class="pending-message-item"
        :class="{ 'is-guided': isGuided(item.id) }"
      >
        <div class="pending-message-content">
          <span v-if="getTextPreview(item.parts)" class="pending-message-text">{{ getTextPreview(item.parts) }}</span>
          <span v-if="getAudioCount(item.parts)" class="pending-type-chip audio">
            <MediaIcon class="chip-icon" />
            <span class="chip-count">{{ getAudioCount(item.parts) }}</span>
          </span>
          <span v-if="getFileCount(item.parts)" class="pending-type-chip file">
            <FileAttachIcon class="chip-icon" />
            <span class="chip-count">{{ getFileCount(item.parts) }}</span>
          </span>
        </div>
        <div class="pending-message-actions">
          <button
            v-if="!isGuided(item.id)"
            class="action-btn guide-btn"
            title="优先进入上下文"
            @click="handleGuide(item.id)"
          >
            <SendIcon class="action-icon" />
          </button>
          <span v-else class="guided-badge" title="已排入下一条">
            <CheckCircleFillIcon class="guided-icon" />
          </span>
          <button class="action-btn remove-btn" title="移除" @click="emit('remove', item.id)">
            <CloseIcon class="action-icon" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Container ── */
.pending-messages-container {
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 6px 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}

/* ── Header ── */
.pending-messages-header {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 4px;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-tertiary);
  letter-spacing: 0.03em;
  text-transform: uppercase;
  user-select: none;
}

.pending-icon {
  width: 11px;
  height: 11px;
  color: var(--color-primary);
  opacity: 0.8;
}

.pending-title {
  font-weight: 600;
}

.pending-status {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 400;
  color: var(--text-tertiary);
  text-transform: none;
  letter-spacing: normal;
}

.pending-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--color-primary);
  opacity: 0.7;
  animation: pendingPulse 1.4s ease-in-out infinite;
}

@keyframes pendingPulse {
  0%, 100% { opacity: 0.7; transform: scale(1); }
  50% { opacity: 0.3; transform: scale(0.75); }
}

/* ── List ── */
.pending-messages-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.pending-message-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 8px;
  background: var(--bg-hover);
  border-radius: 6px;
  font-size: 11px;
  line-height: 1.2;
  transition:
    background-color 0.15s ease,
    box-shadow 0.15s ease;
  gap: 4px;
  min-height: 0;
}

.pending-message-item:hover {
  background: var(--bg-active);
}

.pending-message-content {
  display: flex;
  align-items: center;
  gap: 3px;
  flex: 1;
  min-width: 0;
  line-height: 1;
}

.pending-message-text {
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pending-type-chip {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  flex-shrink: 0;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 9px;
  line-height: 1;
  font-weight: 600;
}

.pending-type-chip.audio {
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  color: var(--color-primary);
}

.pending-type-chip.file {
  background: color-mix(in srgb, var(--text-secondary) 12%, transparent);
  color: var(--text-secondary);
}

.chip-icon {
  width: 9px;
  height: 9px;
}

.chip-count {
  line-height: 1;
}

/* ── Actions ── */
.pending-message-actions {
  display: flex;
  align-items: center;
  gap: 0px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.12s ease;
}

.pending-message-item:hover .pending-message-actions {
  opacity: 1;
}

.pending-message-item.is-guided .pending-message-actions {
  opacity: 1;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  color: var(--text-tertiary);
  transition:
    color 0.12s ease,
    background-color 0.12s ease;
}

.action-btn:hover {
  background: color-mix(in srgb, var(--text-primary) 10%, transparent);
}

.action-icon {
  width: 12px;
  height: 12px;
}

.guide-btn:hover {
  color: var(--color-primary) !important;
}

.guided-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  color: var(--color-primary);
}

.guided-icon {
  width: 13px;
  height: 13px;
}

/* ── Guided state ── */
.pending-message-item.is-guided {
  background: color-mix(in srgb, var(--color-primary) 8%, var(--bg-hover));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-primary) 20%, transparent);
}

.pending-message-item.is-guided .pending-message-text {
  color: color-mix(in srgb, var(--text-primary) 85%, var(--color-primary));
}

.pending-message-item.is-guided .pending-type-chip.audio {
  background: color-mix(in srgb, var(--color-primary) 18%, transparent);
}

/* ── Remove button ── */
.remove-btn:hover {
  color: var(--color-danger) !important;
}
</style>
