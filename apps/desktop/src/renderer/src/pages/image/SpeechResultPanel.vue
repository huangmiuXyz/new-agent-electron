<script setup lang="ts">
import type { AudioBatch } from '@renderer/stores/audio'

const props = defineProps<{
  chunk: AudioBatch
}>()

const emit = defineEmits<{
  (e: 'copyPrompt', text: string): void
  (e: 'remove', chunkId: string): void
}>()

const isMusicResult = computed(() => props.chunk.mediaType === 'music' || props.chunk.model?.startsWith('music-'))
const audioSrc = computed(() => {
  if (!props.chunk.audioData) return ''
  return `data:${props.chunk.audioMediaType || 'audio/mpeg'};base64,${props.chunk.audioData}`
})

const downloadAudio = async () => {
  if (!audioSrc.value) return
  try {
    const response = await fetch(audioSrc.value)
    const blob = await response.blob()
    const extension = (props.chunk.audioFormat || '').toLowerCase() || 'mp3'
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `speech-${Date.now()}.${extension}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  } catch (err) {
    console.error('Failed to download audio:', err)
  }
}

const formatDuration = (value?: number) => {
  if (!value || Number.isNaN(value)) return '--:--'
  const mins = Math.floor(value / 60)
  const secs = Math.floor(value % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

const { Trash, VolumeMedium, FileMusic, Download } = useIcon([
  'Trash',
  'VolumeMedium',
  'FileMusic',
  'Download'
])
</script>

<template>
  <div class="speech-result-card" :class="{ 'is-music': isMusicResult }">
    <div class="speech-result-header">
      <div class="speech-result-title">
        <span class="speech-result-icon">
          <component :is="isMusicResult ? FileMusic : VolumeMedium" />
        </span>
        <div class="speech-result-title-content">
                    <div class="speech-result-prompt">
            <span>{{ chunk.prompt }}</span>
            <Tags v-if="chunk.modelName" :tags="[chunk.modelName]" color="blue" />
          </div>
          <div class="speech-result-tags">
            <Tags v-if="chunk.audioFormat" :tags="[chunk.audioFormat.toUpperCase()]" color="green" />
          </div>
        </div>
      </div>
                  <div class="speech-result-actions">
        <Button size="sm" variant="text" @click="emit('copyPrompt', chunk.prompt)">复制文本</Button>
        <Button size="sm" variant="text" :disabled="!chunk.audioData" @click="downloadAudio">
          <template #icon>
            <Download />
          </template>
          下载
        </Button>
        <Button size="sm" variant="text" @click="emit('remove', chunk.id)">
          <Trash />
        </Button>
      </div>
    </div>
            <div class="speech-result-meta">
      <span>{{ chunk.status === 'processing' ? '生成中...' : chunk.status === 'failed' || chunk.error ? '生成失败' : isMusicResult ? '音乐已生成' : '语音已生成' }}</span>
      <span>{{ formatDuration(chunk.duration) }}</span>
    </div>
    <div v-if="chunk.error" class="speech-result-error">{{ chunk.error }}</div>
    <audio v-else-if="chunk.audioData" class="speech-audio-player" :src="audioSrc" controls preload="metadata" />
  </div>
</template>

<style scoped>
.speech-result-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  background: var(--bg-card);
}

.speech-result-card.is-music {
  background: linear-gradient(180deg, rgba(var(--accent-rgb), 0.06), var(--bg-card));
}

.speech-result-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.speech-result-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-primary);
  line-height: 1.6;
  min-width: 0;
}

.speech-result-icon {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  flex-shrink: 0;
}

.speech-result-icon :deep(svg) {
  width: 16px;
  height: 16px;
}

.speech-result-title-content {
  min-width: 0;
}

.speech-result-prompt {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.speech-result-title-content>span {
  display: block;
  word-break: break-word;
}

.speech-result-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 6px;
}

.speech-result-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.speech-result-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--text-tertiary);
  font-size: 12px;
}

.speech-result-error {
  color: var(--error-color, #ff4d4f);
  font-size: 12px;
  line-height: 1.5;
}

.speech-audio-player {
  width: 100%;
}
</style>
