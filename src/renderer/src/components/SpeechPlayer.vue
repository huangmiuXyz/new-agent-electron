<script setup lang="ts">
import { useSpeechStore } from '../stores/speech'

const props = defineProps<{
  messageId: string
  chunks: Array<{ text: string; data?: string; duration?: number; error?: string }>
}>()

const speechStore = useSpeechStore()
const Play = useIcon('Play')
const Pause = useIcon('Pause')
const Stop = useIcon('Stop')

const messageChunks = computed(() => {
  return speechStore.queue.filter(chunk => chunk.messageId === props.messageId)
})

const activeChunkIndex = computed(() => {
  return messageChunks.value.findIndex(chunk => chunk.id === speechStore.currentChunkId)
})

// Calculate total duration of known chunks for this message
const totalDuration = computed(() => {
  return messageChunks.value.reduce((acc, chunk) => acc + (chunk.duration || 0), 0)
})

// Calculate current progress across all chunks for this message
const totalProgress = computed(() => {
  if (totalDuration.value === 0) return 0

  let playedDuration = 0
  for (let i = 0; i < messageChunks.value.length; i++) {
    const chunk = messageChunks.value[i]
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

  // Find which chunk this targetTime falls into
  let accumulatedTime = 0
  for (const chunk of messageChunks.value) {
    const chunkDuration = chunk.duration || 0
    if (accumulatedTime + chunkDuration >= targetTime) {
      const internalTime = targetTime - accumulatedTime
      if (speechStore.currentChunkId === chunk.id) {
        speechStore.seek(internalTime)
      } else {
        speechStore.jumpToChunk(chunk.id)
        // Wait for it to start then seek? speechStore.jumpToChunk calls playNext
        // For simplicity, we just jump to the start of that chunk for now
      }
      break
    }
    accumulatedTime += chunkDuration
  }
}

const handleChunkClick = (chunkId: string) => {
  speechStore.jumpToChunk(chunkId)
}

const lyricsContainer = ref<HTMLElement | null>(null)

// Auto-scroll lyrics
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
  <div v-if="messageChunks.length > 0" class="speech-player">
    <div class="player-controls">
      <Button size="sm" variant="icon" @click="speechStore.togglePlay">
        <template #icon>
          <Pause v-if="speechStore.isPlaying && speechStore.currentChunk?.messageId === messageId" />
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
        <input
          type="range"
          min="0"
          max="100"
          :value="totalProgress"
          class="progress-bar"
          @input="handleSeek"
        />
        <span class="time">{{ formatTime(totalDuration) }}</span>
      </div>
    </div>

    <div class="lyrics-container" ref="lyricsContainer">
      <div
        v-for="(chunk, index) in messageChunks"
        :key="chunk.id"
        class="lyric-line"
        :class="{
          'is-active': chunk.id === speechStore.currentChunkId,
          'is-played': chunk.played && chunk.id !== speechStore.currentChunkId,
          'is-loading': chunk.loading,
          'is-error': !!chunk.error
        }"
        :title="chunk.error"
        @click="handleChunkClick(chunk.id)"
      >
        <span v-if="chunk.error" class="error-icon">⚠️</span>
        {{ chunk.text }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.speech-player {
  margin-top: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.player-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-container {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-bar {
  flex: 1;
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
  min-width: 35px;
}

.lyrics-container {
  max-height: 120px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 4px;
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
  padding: 4px 8px;
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
