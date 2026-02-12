<script setup lang="ts">
import { useElementHover, useFullscreen, useMediaControls } from '@vueuse/core'
import { useIcon } from '@renderer/composables/useIcon'

const props = defineProps<{
  src: string
  poster?: string
}>()

const { Play, Pause, Volume, Volume2, VolumeMute, Fullscreen, FullscreenExit } = useIcon([
  'Play',
  'Pause',
  'Volume',
  'Volume2',
  'VolumeMute',
  'Fullscreen',
  'FullscreenExit'
])

const videoRef = ref<HTMLVideoElement>()
const containerRef = ref<HTMLDivElement>()

const isHovered = useElementHover(containerRef)
const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(containerRef)
const { playing, currentTime, duration, volume, muted } = useMediaControls(videoRef, { src: props.src })

// 格式化时间
const formatTime = (seconds: number): string => {
  if (!seconds || !isFinite(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// 进度百分比
const progress = computed(() => {
  if (!duration.value) return 0
  return (currentTime.value / duration.value) * 100
})

// 跳转进度
const seekTo = (event: MouseEvent) => {
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const percent = (event.clientX - rect.left) / rect.width
  currentTime.value = percent * duration.value
}

// 音量图标
const volumeIcon = computed(() => {
  if (muted.value || volume.value === 0) return 'mute'
  if (volume.value < 0.5) return 'low'
  return 'high'
})

// 显示控制条
const showControls = computed(() => isHovered.value || !playing.value)

// 播放/暂停
const togglePlay = () => {
  playing.value = !playing.value
}

// 静音切换
const toggleMute = () => {
  muted.value = !muted.value
}

// 点击视频区域
const handleVideoClick = () => {
  togglePlay()
}
</script>

<template>
  <div ref="containerRef" class="video-player" :class="{ 'is-fullscreen': isFullscreen }">
    <video
      ref="videoRef"
      class="video-element"
      :poster="poster"
      preload="metadata"
      playsinline
      @click="handleVideoClick"
    />

    <!-- 控制条 -->
    <Transition name="slide-up">
      <div v-show="showControls" class="controls" @click.stop>
        <!-- 进度条 -->
        <div class="progress-bar" @click="seekTo">
          <div class="progress-buffered" :style="{ width: '100%' }" />
          <div class="progress-played" :style="{ width: `${progress}%` }" />
          <div class="progress-thumb" :style="{ left: `${progress}%` }" />
        </div>

        <!-- 控制按钮 -->
        <div class="controls-row">
          <div class="controls-left">
            <!-- 播放/暂停 -->
            <button class="control-btn" @click="togglePlay">
              <component :is="playing ? Pause : Play" />
            </button>

            <!-- 音量 -->
            <div class="volume-control">
              <button class="control-btn" @click="toggleMute">
                <component :is="volumeIcon === 'mute' ? VolumeMute : volumeIcon === 'low' ? Volume : Volume2" />
              </button>
              <input
                v-model.number="volume"
                type="range"
                min="0"
                max="1"
                step="0.1"
                class="volume-slider"
              />
            </div>

            <!-- 时间 -->
            <span class="time-display">
              {{ formatTime(currentTime) }} / {{ formatTime(duration) }}
            </span>
          </div>

          <div class="controls-right">
            <!-- 全屏 -->
            <button class="control-btn" @click="toggleFullscreen">
              <component :is="isFullscreen ? FullscreenExit : Fullscreen" />
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.video-player {
  position: relative;
  width: 100%;
  height: 100%;
  background: #000;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
}

.video-player.is-fullscreen {
  border-radius: 0;
}

.video-element {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.controls {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
  padding: 32px 12px 12px;
  z-index: 2;
}

.progress-bar {
  position: relative;
  height: 4px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  cursor: pointer;
  margin-bottom: 8px;
}

.progress-bar:hover {
  height: 6px;
}

.progress-buffered {
  position: absolute;
  height: 100%;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 2px;
}

.progress-played {
  position: absolute;
  height: 100%;
  background: var(--accent-color, #1890ff);
  border-radius: 2px;
}

.progress-thumb {
  position: absolute;
  top: 50%;
  width: 12px;
  height: 12px;
  background: #fff;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  opacity: 0;
  transition: opacity 0.2s;
}

.progress-bar:hover .progress-thumb {
  opacity: 1;
}

.controls-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.controls-left,
.controls-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.control-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: #fff;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.2s;
}

.control-btn:hover {
  background: rgba(255, 255, 255, 0.15);
}

.control-btn svg {
  width: 20px;
  height: 20px;
}

.volume-control {
  display: flex;
  align-items: center;
  gap: 4px;
}

.volume-slider {
  width: 0;
  opacity: 0;
  transition: width 0.2s, opacity 0.2s;
}

.volume-control:hover .volume-slider {
  width: 64px;
  opacity: 1;
}

.volume-slider {
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 2px;
  cursor: pointer;
}

.volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  background: #fff;
  border-radius: 50%;
  cursor: pointer;
}

.time-display {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.9);
  font-variant-numeric: tabular-nums;
  margin-left: 4px;
}

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.3s, opacity 0.3s;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>
