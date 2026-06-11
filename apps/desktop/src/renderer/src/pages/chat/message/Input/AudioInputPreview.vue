<script setup lang="ts">
import type { InputAudioItem } from '@renderer/composables/useInputAudioRecorder'
import { formatFileSize } from '@renderer/utils'
import { onUnmounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    audios: InputAudioItem[]
    removable?: boolean
    variant?: 'input' | 'message'
  }>(),
  {
    removable: true,
    variant: 'input'
  }
)

const emit = defineEmits<{
  remove: [index: number]
}>()

const { Play, Pause, Trash } = useIcon(['Play', 'Pause', 'Trash'])
const playingId = ref('')
const currentTimeMap = ref<Record<string, number>>({})
const durationMap = ref<Record<string, number>>({})
const players = new Map<string, HTMLAudioElement>()

const formatDuration = (seconds: number) => {
  const totalSeconds = Math.max(0, Math.round(seconds || 0))
  const minutes = Math.floor(totalSeconds / 60)
  const restSeconds = totalSeconds % 60
  return `${minutes}:${restSeconds.toString().padStart(2, '0')}`
}

const getAudioId = (audio: InputAudioItem, index: number) => audio.id || `audio-${index}`

const getAudioSource = (audio: InputAudioItem) => audio.blobUrl || audio.dataUrl

const getKnownDuration = (audio: InputAudioItem, index: number) => {
  const id = getAudioId(audio, index)
  return audio.duration || durationMap.value[id] || 0
}

const getKnownCurrentTime = (audio: InputAudioItem, index: number) => {
  return currentTimeMap.value[getAudioId(audio, index)] || 0
}

const getProgressPercent = (audio: InputAudioItem, index: number) => {
  const duration = getKnownDuration(audio, index)
  if (duration <= 0) return 0
  return Math.min(100, Math.max(0, (getKnownCurrentTime(audio, index) / duration) * 100))
}

const ensurePlayer = (audio: InputAudioItem, index: number) => {
  const id = getAudioId(audio, index)
  const src = getAudioSource(audio)
  let player = players.get(id)

  if (!player) {
    player = new Audio(src)
    player.preload = 'metadata'
    player.addEventListener('loadedmetadata', () => {
      durationMap.value = { ...durationMap.value, [id]: player?.duration || 0 }
    })
    player.addEventListener('timeupdate', () => {
      currentTimeMap.value = { ...currentTimeMap.value, [id]: player?.currentTime || 0 }
    })
    player.addEventListener('ended', () => {
      playingId.value = ''
      currentTimeMap.value = { ...currentTimeMap.value, [id]: 0 }
      if (player) player.currentTime = 0
    })
    player.addEventListener('pause', () => {
      if (playingId.value === id) playingId.value = ''
    })
    players.set(id, player)
  } else if (player.src !== src) {
    player.src = src
  }

  return player
}

const pauseAllExcept = (activeId?: string) => {
  players.forEach((player, id) => {
    if (id !== activeId) player.pause()
  })
}

const togglePlayback = async (audio: InputAudioItem, index: number) => {
  const id = getAudioId(audio, index)
  const player = ensurePlayer(audio, index)

  if (playingId.value === id) {
    player.pause()
    playingId.value = ''
    return
  }

  pauseAllExcept(id)
  await player.play()
  playingId.value = id
}

const seekAudio = (audio: InputAudioItem, index: number, event: MouseEvent) => {
  const player = ensurePlayer(audio, index)
  const duration = getKnownDuration(audio, index)
  if (duration <= 0) return

  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
  player.currentTime = duration * ratio
}

const removeAudio = (audio: InputAudioItem, index: number) => {
  const id = getAudioId(audio, index)
  const player = players.get(id)
  player?.pause()
  players.delete(id)
  emit('remove', index)
}

watch(
  () => props.audios.map((audio, index) => getAudioId(audio, index)),
  (ids) => {
    const activeIds = new Set(ids)
    players.forEach((player, id) => {
      if (activeIds.has(id)) return
      player.pause()
      players.delete(id)
    })
  }
)

onUnmounted(() => {
  pauseAllExcept()
  players.clear()
})
</script>

<template>
  <div
    v-if="props.audios.length"
    class="audio-input-list"
    :class="{ 'audio-input-list--message': props.variant === 'message' }"
  >
    <div v-for="(audio, index) in props.audios" :key="audio.id || index" class="audio-input-item">
      <Button
        variant="icon"
        size="sm"
        type="button"
        :aria-label="playingId === getAudioId(audio, index) ? '暂停音频' : '播放音频'"
        :title="playingId === getAudioId(audio, index) ? '暂停音频' : '播放音频'"
        @click="togglePlayback(audio, index)"
      >
        <template #icon>
          <Pause v-if="playingId === getAudioId(audio, index)" />
          <Play v-else />
        </template>
      </Button>
      <div class="audio-input-main">
        <div class="audio-input-meta">
          <span class="audio-input-name" :title="audio.filename">{{ audio.filename }}</span>
          <span v-if="audio.size > 0" class="audio-input-detail">{{ formatFileSize(audio.size) }}</span>
        </div>
        <button
          class="audio-progress"
          type="button"
          aria-label="调整音频播放进度"
          @click="seekAudio(audio, index, $event)"
        >
          <span :style="{ width: `${getProgressPercent(audio, index)}%` }"></span>
        </button>
      </div>
      <span class="audio-time">
        {{ formatDuration(getKnownCurrentTime(audio, index)) }} /
        {{ formatDuration(getKnownDuration(audio, index)) }}
      </span>
      <Button
        v-if="props.removable"
        variant="icon"
        size="sm"
        danger
        type="button"
        aria-label="删除音频"
        title="删除音频"
        @click="removeAudio(audio, index)"
      >
        <template #icon>
          <Trash />
        </template>
      </Button>
    </div>
  </div>
</template>

<style scoped>
.audio-input-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  margin-bottom: 6px;
}

.audio-input-list--message {
  --text-primary: rgba(255, 255, 255, 0.96);
  --text-secondary: rgba(255, 255, 255, 0.72);
  --text-tertiary: rgba(255, 255, 255, 0.48);
  --bg-hover: rgba(255, 255, 255, 0.14);
  --bg-input: rgba(255, 255, 255, 0.08);
  --bg-card: rgba(255, 255, 255, 0.12);
  --border-subtle: rgba(255, 255, 255, 0.22);
  --border-focus: rgba(255, 255, 255, 0.52);
  margin-bottom: 0;
  color: var(--text-primary);
}

.audio-input-item {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 5px 6px;
  border: none;
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-hover) 78%, var(--bg-input));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--border-subtle) 72%, transparent);
}

.audio-input-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.audio-input-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 11px;
  line-height: 1;
}

.audio-input-name {
  min-width: 0;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
  font-weight: 600;
}

.audio-input-detail {
  flex-shrink: 0;
  color: var(--text-tertiary);
}

.audio-progress:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
}

.audio-progress {
  position: relative;
  width: 100%;
  height: 12px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  cursor: pointer;
  touch-action: manipulation;
}

.audio-progress::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 2px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text-tertiary) 25%, transparent);
  transform: translateY(-50%);
}

.audio-progress span {
  position: absolute;
  left: 0;
  top: 50%;
  height: 2px;
  min-width: 2px;
  border-radius: 999px;
  background: var(--text-primary);
  transform: translateY(-50%);
}

.audio-time {
  color: var(--text-secondary);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  line-height: 1;
}

@media (max-width: 640px) {
  .audio-input-item {
    grid-template-columns: 28px minmax(0, 1fr) auto;
    gap: 6px;
  }

  .audio-input-name {
    max-width: 140px;
  }

  .audio-time {
    display: none;
  }
}
</style>
