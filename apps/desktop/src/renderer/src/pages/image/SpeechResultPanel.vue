<script setup lang="ts">
import type { AudioBatch, AudioBatchItem } from '@renderer/stores/audio'

const props = defineProps<{
  chunk: AudioBatch
}>()

const emit = defineEmits<{
  (e: 'copyPrompt', text: string): void
  (e: 'remove', chunkId: string): void
  (e: 'reEdit', chunk: AudioBatch): void
  (e: 'regenerate', chunk: AudioBatch): void
}>()

const isMusicResult = computed(() => props.chunk.mediaType === 'music' || props.chunk.model?.startsWith('music-'))
const isProcessing = computed(() => props.chunk.status === 'processing')
const isFailed = computed(() => props.chunk.status === 'failed' || !!props.chunk.error)
const audioItems = computed<AudioBatchItem[]>(() => {
  if (props.chunk.items && props.chunk.items.length > 0) {
    return props.chunk.items.slice().reverse()
  }
  return [{
    id: props.chunk.id,
    audioData: props.chunk.audioData,
    audioMediaType: props.chunk.audioMediaType,
    audioFormat: props.chunk.audioFormat,
    status: props.chunk.status,
    error: props.chunk.error,
    duration: props.chunk.duration
  }]
})

const resultTitle = computed(() => (isMusicResult.value ? '音乐结果' : '语音结果'))
const statusText = computed(() => {
  if (isProcessing.value) return isMusicResult.value ? '音乐生成中...' : '语音生成中...'
  if (isFailed.value) return '生成失败'
  return isMusicResult.value ? '音乐已生成' : '语音已生成'
})

const metaTags = computed(() => {
  const tags: string[] = []
  if (props.chunk.modelName) tags.push(props.chunk.modelName)
  if (props.chunk.providerName) tags.push(props.chunk.providerName)
  if (props.chunk.audioFormat) tags.push(props.chunk.audioFormat.toUpperCase())
  if (props.chunk.duration && !Number.isNaN(props.chunk.duration)) {
    tags.push(formatDuration(props.chunk.duration))
  }
  return tags
})

const fileNameBase = computed(() => {
  const prefix = isMusicResult.value ? 'music' : 'speech'
  const safePrompt = props.chunk.prompt
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 24)
  return [prefix, safePrompt || Date.now()].join('-')
})

const getAudioSrc = (item: AudioBatchItem) => {
  if (!item.audioData) return ''
  return `data:${item.audioMediaType || 'audio/mpeg'};base64,${item.audioData}`
}

const downloadAudio = async (item: AudioBatchItem) => {
  const audioSrc = getAudioSrc(item)
  if (!audioSrc) return
  try {
    const response = await fetch(audioSrc)
    const blob = await response.blob()
    const extension = (item.audioFormat || props.chunk.audioFormat || '').toLowerCase() || 'mp3'
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${fileNameBase.value}.${extension}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  } catch (err) {
    console.error('Failed to download audio:', err)
  }
}

function formatDuration(value?: number) {
  if (!value || Number.isNaN(value)) return '--:--'
  const mins = Math.floor(value / 60)
  const secs = Math.floor(value % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

const getItemStatusText = (item: AudioBatchItem) => {
  if (item.status === 'processing') return isMusicResult.value ? '音乐生成中...' : '语音生成中...'
  if (item.status === 'failed' || item.error) return '生成失败'
  return isMusicResult.value ? '音乐已生成' : '语音已生成'
}

const { Trash, VolumeMedium, FileMusic, Download, Copy, X, Edit, Refresh } = useIcon([
  'Trash',
  'VolumeMedium',
  'FileMusic',
  'Download',
  'Copy',
  'X',
  'Edit',
  'Refresh'
])
</script>

<template>
  <Card padding="20px" radius="16px" class="speech-result-card" :class="{ 'is-music': isMusicResult }">
    <div class="prompt-card">
      <div class="prompt-header">
        <div class="prompt-main">
          <span class="prompt-icon">
            <component :is="isMusicResult ? FileMusic : VolumeMedium" />
          </span>

          <div class="prompt-content">
            <span class="prompt-label">{{ resultTitle }}</span>
            <p class="prompt-text" :title="chunk.prompt">{{ chunk.prompt }}</p>
          </div>
        </div>

        <div class="prompt-actions">
          <Button variant="icon" size="sm" title="复制提示词" @click="emit('copyPrompt', chunk.prompt)">
            <Copy />
          </Button>
          <Button variant="icon" size="sm" title="重新编辑" @click="emit('reEdit', chunk)">
            <Edit />
          </Button>
          <Button variant="icon" size="sm" title="重新生成" @click="emit('regenerate', chunk)">
            <Refresh />
          </Button>
          <Button
            variant="icon"
            size="sm"
            :disabled="!audioItems.some((item) => item.audioData)"
            title="下载最新音频"
            @click="audioItems[0] && downloadAudio(audioItems[0])"
          >
            <Download />
          </Button>
          <Button variant="icon" size="sm" class="delete-btn" title="删除结果" @click="emit('remove', chunk.id)">
            <Trash />
          </Button>
        </div>
      </div>

      <div class="prompt-meta">
        <Tags v-if="metaTags.length > 0" :tags="metaTags" color="blue" />
      </div>
    </div>

    <div class="audio-items">
      <div
        v-for="item in audioItems"
        :key="item.id"
        class="audio-entry"
      >
        <div
          v-if="item.status === 'processing' || item.status === 'failed' || item.error"
          class="audio-state"
          :class="{ 'is-failed': item.status === 'failed' || !!item.error }"
        >
          <template v-if="item.status === 'failed' || item.error">
            <div class="error-icon">
              <X />
            </div>
            <span class="error-text">{{ getItemStatusText(item) }}</span>
            <p v-if="item.error" class="error-detail" :title="item.error">{{ item.error }}</p>
          </template>
          <template v-else>
            <div class="loading-spinner"></div>
            <span>{{ getItemStatusText(item) }}</span>
          </template>
        </div>

        <div v-else-if="item.audioData" class="audio-ready">
          <div class="audio-ready-meta">
            <span>{{ getItemStatusText(item) }}</span>
            <div class="audio-ready-meta-right">
              <span>{{ formatDuration(item.duration) }}</span>
              <Button variant="text" size="sm" @click="downloadAudio(item)">
                <Download />
                下载
              </Button>
            </div>
          </div>
          <audio class="speech-audio-player" :src="getAudioSrc(item)" controls preload="metadata" />
        </div>
      </div>
    </div>
  </Card>
</template>

<style scoped>
.speech-result-card {
  width: 100%;
}

.speech-result-card.is-music {
  background:
    radial-gradient(circle at top right, rgba(var(--accent-rgb), 0.12), transparent 32%),
    var(--bg-card);
}

.prompt-card {
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.prompt-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 12px;
}

.prompt-main {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.prompt-icon {
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  flex-shrink: 0;
}

.prompt-icon :deep(svg) {
  width: 18px;
  height: 18px;
}

.prompt-content {
  min-width: 0;
  overflow: hidden;
}

.prompt-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.prompt-text {
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0;
  font-weight: 500;
}

.prompt-actions {
  display: flex;
  gap: 6px;
  opacity: 0;
  transition: opacity 0.2s;
}

.speech-result-card:hover .prompt-actions {
  opacity: 1;
}

.delete-btn:hover {
  color: var(--error-color, #ff4d4f) !important;
  background: rgba(255, 77, 79, 0.1) !important;
}

.prompt-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.audio-items {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.audio-entry {
  position: relative;
}

.audio-state,
.audio-ready {
  border-radius: 14px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-secondary);
}

.audio-state {
  min-height: 104px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-tertiary);
  font-size: 13px;
  padding: 14px;
  text-align: center;
}

.audio-state.is-failed {
  color: var(--color-error);
}

.error-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(var(--color-error-rgb), 0.1);
}

.error-text {
  font-weight: 600;
}

.error-detail {
  max-width: 100%;
  font-size: 12px;
  line-height: 1.5;
  opacity: 0.85;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--border-color);
  border-top-color: var(--accent-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.audio-ready {
  padding: 12px;
}

.audio-ready-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--text-tertiary);
  font-size: 12px;
  margin-bottom: 10px;
}

.audio-ready-meta-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.speech-audio-player {
  width: 100%;
  display: block;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
