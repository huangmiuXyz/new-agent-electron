<script setup lang="ts">
import { useSpeechStore } from '../stores/speech'

const speechStore = useSpeechStore()
const Play = useIcon('Play')
const Pause = useIcon('Pause')
const Stop = useIcon('Stop')

const props = defineProps<{
  collapsed?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const activeChunkIndex = computed(() => {
  return speechStore.queue.findIndex(chunk => chunk.id === speechStore.currentChunkId)
})

const totalDuration = computed(() => {
  return speechStore.queue.reduce((acc, chunk) => acc + (chunk.duration || 0), 0)
})

const totalProgress = computed(() => {
  if (totalDuration.value === 0) return 0

  let playedDuration = 0
  for (let i = 0; i < speechStore.queue.length; i++) {
    const chunk = speechStore.queue[i]
    if (chunk.id === speechStore.currentChunkId) {
      playedDuration += speechStore.currentTime
      break
    }
    if (chunk.played) {
      playedDuration += (chunk.duration || 0)
    }
  }
  return (playedDuration / totalDuration.value) * 100
})

const formatTime = (seconds: number) => {
  if (!seconds || isNaN(seconds)) return '00:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

const handleSeek = (e: Event) => {
  const target = e.target as HTMLInputElement
  const percent = parseFloat(target.value) / 100
  const targetTime = percent * totalDuration.value

  let accumulatedTime = 0
  for (const chunk of speechStore.queue) {
    const chunkDuration = chunk.duration || 0
    if (accumulatedTime + chunkDuration >= targetTime) {
      speechStore.jumpToChunk(chunk.id)
      break
    }
    accumulatedTime += chunkDuration
  }
}

const handleChunkClick = (chunkId: string) => {
  speechStore.jumpToChunk(chunkId)
}

const lyricsContainer = ref<HTMLElement | null>(null)

watch(activeChunkIndex, (newIndex) => {
  if (newIndex !== -1 && lyricsContainer.value) {
    const activeElement = lyricsContainer.value.children[newIndex] as HTMLElement
    if (activeElement) {
      activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }
})
</script>

<template>
  <div class="speech-sidebar" :class="{ collapsed }">
    <div v-if="speechStore.queue.length === 0" class="empty-state">
      <p>暂无播放内容</p>
      <p class="hint">对话时开启语音合成，音频将自动添加到播放列表</p>
    </div>

    <template v-else>
      <div class="player-controls">
        <Button size="sm" variant="icon" @click="speechStore.togglePlay">
          <template #icon>
            <Pause v-if="speechStore.isPlaying" />
            <Play v-else />
          </template>
        </Button>
        <Button size="sm" variant="icon" @click="speechStore.stop">
          <template #icon>
            <Stop />
          </template>
        </Button>

        <div class="progress-container">
          <span class="time">{{ formatTime(totalProgress / 100 * totalDuration) }}</span>
          <input type="range" min="0" max="100" :value="totalProgress" class="progress-bar" @input="handleSeek" />
          <span class="time">{{ formatTime(totalDuration) }}</span>
        </div>
      </div>

      <div class="lyrics-container" ref="lyricsContainer">
        <div v-for="chunk in speechStore.queue" :key="chunk.id" class="lyric-line" :class="{
          'is-active': chunk.id === speechStore.currentChunkId,
          'is-played': chunk.played && chunk.id !== speechStore.currentChunkId,
          'is-loading': chunk.loading,
          'is-error': !!chunk.error
        }" :title="chunk.error" @click="handleChunkClick(chunk.id)">
          <span v-if="chunk.error" class="error-icon">⚠️</span>
          {{ chunk.text }}
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.speech-sidebar {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  border-left: 1px solid var(--border-color);
}

.speech-sidebar.collapsed {
  display: none;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}

.sidebar-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  text-align: center;
  color: var(--text-tertiary);
}

.empty-state p {
  margin: 0;
}

.empty-state .hint {
  margin-top: 8px;
  font-size: 12px;
  opacity: 0.7;
}

.player-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  min-width: 0;
}

.progress-container {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.progress-bar {
  flex: 1 1 auto;
  min-width: 36px;
  height: 4px;
  -webkit-appearance: none;
  background: var(--border-color);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}

.progress-bar::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  background: var(--accent-color);
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.1s;
}

.progress-bar::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}

.time {
  font-size: 11px;
  color: var(--text-tertiary);
  font-family: monospace;
  flex: 0 0 auto;
  min-width: 40px;
  white-space: nowrap;
}

.queue-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  font-size: 12px;
  color: var(--text-tertiary);
  border-bottom: 1px solid var(--border-color);
}

.lyrics-container {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
}

.lyrics-container::-webkit-scrollbar {
  width: 4px;
}

.lyrics-container::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 2px;
}

.lyric-line {
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all 0.2s;
  padding: 6px 10px;
  border-radius: 6px;
}

.lyric-line:hover {
  background: rgba(var(--accent-rgb), 0.05);
  color: var(--text-secondary);
}

.lyric-line.is-active {
  color: var(--accent-color);
  font-weight: 500;
  font-size: 14px;
  background: rgba(var(--accent-rgb), 0.1);
}

.lyric-line.is-played {
  color: var(--text-secondary);
}

.lyric-line.is-loading {
  opacity: 0.5;
  font-style: italic;
}

.lyric-line.is-error {
  color: var(--error-color, #ff4d4f);
  text-decoration: line-through;
  text-decoration-style: dotted;
}

.error-icon {
  margin-right: 4px;
  font-size: 12px;
}
</style>
