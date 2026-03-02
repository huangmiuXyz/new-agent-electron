<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useIcon } from '../composables/useIcon'

interface Progress {
  total: number
  downloaded: number
  percent: number
}

const props = defineProps<{
  progress: Progress | null
  isDownloading: boolean
  isPaused: boolean
  statusText?: string
}>()

const emit = defineEmits<{
  (e: 'pause'): void
  (e: 'resume'): void
  (e: 'cancel'): void
  (e: 'open-directory'): void
}>()

const { Folder, Play, Pause, X } = useIcon(['Folder', 'Play', 'Pause', 'X'])

const percent = computed(() => props.progress?.percent || 0)
const downloadSpeed = ref(0)
const smoothedSpeed = ref(0)
const lastSampleDownloaded = ref<number | null>(null)
const lastSampleAt = ref<number | null>(null)
const speedDebounceTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const pendingDisplaySpeed = ref(0)
const SPEED_DEBOUNCE_MS = 180

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const formatSpeed = (bytesPerSecond: number) => {
  if (bytesPerSecond <= 0) return '0 B/s'
  return `${formatSize(bytesPerSecond)}/s`
}

const applySpeedDisplay = (speed: number) => {
  pendingDisplaySpeed.value = speed

  if (speedDebounceTimer.value) {
    clearTimeout(speedDebounceTimer.value)
  }

  speedDebounceTimer.value = setTimeout(() => {
    downloadSpeed.value = pendingDisplaySpeed.value
    speedDebounceTimer.value = null
  }, SPEED_DEBOUNCE_MS)
}

const resetSpeedState = () => {
  if (speedDebounceTimer.value) {
    clearTimeout(speedDebounceTimer.value)
    speedDebounceTimer.value = null
  }
  smoothedSpeed.value = 0
  pendingDisplaySpeed.value = 0
  downloadSpeed.value = 0
}

onBeforeUnmount(() => {
  if (speedDebounceTimer.value) {
    clearTimeout(speedDebounceTimer.value)
  }
})

watch(
  () => props.progress?.downloaded,
  (downloaded) => {
    const now = Date.now()
    if (typeof downloaded !== 'number') {
      resetSpeedState()
      lastSampleDownloaded.value = null
      lastSampleAt.value = null
      return
    }

    if (!props.isDownloading || props.isPaused || percent.value >= 100) {
      resetSpeedState()
      lastSampleDownloaded.value = downloaded
      lastSampleAt.value = now
      return
    }

    if (lastSampleDownloaded.value === null || lastSampleAt.value === null) {
      lastSampleDownloaded.value = downloaded
      lastSampleAt.value = now
      resetSpeedState()
      return
    }

    const bytesDelta = downloaded - lastSampleDownloaded.value
    const secondsDelta = (now - lastSampleAt.value) / 1000
    if (bytesDelta > 0 && secondsDelta > 0) {
      const instantSpeed = bytesDelta / secondsDelta
      smoothedSpeed.value =
        smoothedSpeed.value > 0 ? smoothedSpeed.value * 0.6 + instantSpeed * 0.4 : instantSpeed
      applySpeedDisplay(smoothedSpeed.value)
    }

    lastSampleDownloaded.value = downloaded
    lastSampleAt.value = now
  },
  { immediate: true }
)

watch(
  () => [props.isDownloading, props.isPaused] as const,
  ([isDownloading, isPaused]) => {
    if (!isDownloading || isPaused) {
      resetSpeedState()
    }

    if (!isDownloading) {
      lastSampleDownloaded.value = null
      lastSampleAt.value = null
      return
    }

    if (props.progress) {
      lastSampleDownloaded.value = props.progress.downloaded
      lastSampleAt.value = Date.now()
    }
  },
  { immediate: true }
)

const currentStatusText = computed(() => {
  if (props.isPaused) return '已暂停'
  if (percent.value >= 100) return '下载完成'
  if (props.isDownloading) return props.statusText || '正在下载...'
  return '已完成'
})
</script>

<template>
  <div class="download-progress-container" v-if="isDownloading || isPaused">
    <div class="status-header">
      <div class="status-info">
        <span class="status-label">{{ currentStatusText }}</span>
        <div class="controls">
          <button
            v-if="percent < 100"
            class="control-btn open-dir"
            @click="emit('open-directory')"
            title="打开下载目录"
          >
            <component :is="Folder" />
          </button>
          <button
            v-if="percent < 100"
            class="control-btn pause-resume"
            :class="{ resume: isPaused }"
            @click="isPaused ? emit('resume') : emit('pause')"
            :title="isPaused ? '继续下载' : '暂停下载'"
          >
            <component :is="isPaused ? Play : Pause" />
          </button>
          <button
            v-if="percent < 100"
            class="control-btn cancel"
            @click="emit('cancel')"
            title="完全停止下载"
          >
            <component :is="X" />
          </button>
        </div>
      </div>
      <span class="percent-text">{{ percent }}%</span>
    </div>

    <div class="progress-track">
      <div
        class="progress-bar"
        :style="{ width: `${percent}%` }"
        :class="{ paused: isPaused, completed: percent >= 100 }"
      ></div>
    </div>

    <div v-if="progress" class="size-info">
      <span class="downloaded">{{ formatSize(progress.downloaded) }}</span>
      <span class="separator">/</span>
      <span class="total">{{ formatSize(progress.total) }}</span>
      <span class="separator speed-separator">·</span>
      <span class="speed">{{ formatSpeed(downloadSpeed) }}</span>
    </div>
  </div>
</template>

<style scoped>
.download-progress-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 8px 0;
  gap: 6px;
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.status-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.status-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-label {
  font-size: 11px;
  color: var(--text-tertiary, #888);
  font-weight: 500;
}

.controls {
  display: flex;
  align-items: center;
  gap: 4px;
}

.control-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  background: transparent;
}

.control-btn.pause-resume {
  color: #faad14;
  background: rgba(250, 173, 20, 0.1);
}

.control-btn.pause-resume:hover {
  background: rgba(250, 173, 20, 0.2);
  transform: scale(1.05);
}

.control-btn.pause-resume.resume {
  color: #1890ff;
  background: rgba(24, 144, 255, 0.1);
}

.control-btn.pause-resume.resume:hover {
  background: rgba(24, 144, 255, 0.2);
}

.control-btn.open-dir {
  color: #8c8c8c;
  background: rgba(140, 140, 140, 0.12);
}

.control-btn.open-dir:hover {
  background: rgba(140, 140, 140, 0.22);
  transform: scale(1.05);
}

.control-btn.cancel {
  color: #ff4d4f;
  background: rgba(255, 77, 79, 0.1);
}

.control-btn.cancel:hover {
  background: rgba(255, 77, 79, 0.2);
  transform: scale(1.05);
}

.percent-text {
  font-size: 11px;
  color: #1890ff;
  font-weight: 700;
  font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
}

.progress-track {
  width: 100%;
  height: 6px;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 3px;
  overflow: hidden;
  position: relative;
}

html.dark-mode .progress-track {
  background: rgba(255, 255, 255, 0.06);
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #1890ff, #36cfc9);
  border-radius: 3px;
  transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 0 8px rgba(24, 144, 255, 0.3);
  position: relative;
}

.progress-bar::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0.3) 50%,
    rgba(255, 255, 255, 0) 100%
  );
  animation: shine 2s infinite;
}

@keyframes shine {
  from {
    transform: translateX(-100%);
  }

  to {
    transform: translateX(100%);
  }
}

.progress-bar.paused {
  background: #bfbfbf;
  box-shadow: none;
}

.progress-bar.completed {
  background: linear-gradient(90deg, #52c41a, #b7eb8f);
  box-shadow: 0 0 8px rgba(82, 196, 26, 0.3);
}

.progress-bar.paused::after,
.progress-bar.completed::after {
  display: none;
}

.size-info {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--text-tertiary, #999);
  font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
  margin-top: 2px;
}

.separator {
  opacity: 0.5;
}

.speed-separator {
  margin-left: 2px;
}

.speed {
  color: var(--text-secondary, #666);
}
</style>
