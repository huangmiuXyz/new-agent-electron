<script setup lang="ts">
import { onBeforeUnmount } from 'vue'
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
const previewVideoRef = ref<HTMLVideoElement>()
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

// 拖拽状态
const isDragging = ref(false)
const dragProgress = ref(0)

// 悬浮预览状态
const isHoveringProgress = ref(false)
const hoverProgress = ref(0)
const hoverPosition = ref(0)
const hoverTime = computed(() => {
  if (!duration.value) return 0
  return (hoverProgress.value / 100) * duration.value
})

// 预览缩略图
const previewThumbnail = ref('')
let previewTimeout: number | null = null
let currentBitmap: ImageBitmap | null = null

// 检查是否支持 VideoFrame API
const supportsVideoFrame = typeof VideoFrame !== 'undefined'

// 使用 VideoFrame API 生成预览缩略图
const generatePreviewWithVideoFrame = async (time: number): Promise<string | null> => {
  if (!previewVideoRef.value) return null
  const video = previewVideoRef.value
  
  try {
    // 设置时间点并等待 seek 完成
    video.currentTime = time
    await new Promise<void>((resolve) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked)
        resolve()
      }
      video.addEventListener('seeked', onSeeked)
    })
    
    // 等待下一帧绘制
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve())
    })
    
    // 使用 VideoFrame API 捕获帧
    const frame = new VideoFrame(video, { timestamp: 0 })
    const bitmap = await createImageBitmap(frame, {
      resizeWidth: 160,
      resizeHeight: 90,
      resizeQuality: 'medium'
    })
    frame.close()
    
    // 释放之前的 bitmap
    if (currentBitmap) {
      currentBitmap.close()
    }
    currentBitmap = bitmap
    
    // 将 bitmap 绘制到 canvas
    const canvas = document.createElement('canvas')
    canvas.width = 160
    canvas.height = 90
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    
    ctx.drawImage(bitmap, 0, 0)
    return canvas.toDataURL('image/jpeg', 0.85)
  } catch {
    return null
  }
}

// 使用传统 Canvas API 作为降级方案
const generatePreviewFallback = async (time: number): Promise<string | null> => {
  if (!previewVideoRef.value) return null
  const video = previewVideoRef.value
  
  try {
    video.currentTime = time
    await new Promise<void>((resolve) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked)
        resolve()
      }
      video.addEventListener('seeked', onSeeked)
    })
    
    const canvas = document.createElement('canvas')
    canvas.width = 160
    canvas.height = 90
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.85)
  } catch {
    return null
  }
}

// 生成预览缩略图
const generatePreview = async (time: number) => {
  const thumbnail = supportsVideoFrame
    ? await generatePreviewWithVideoFrame(time)
    : await generatePreviewFallback(time)
  
  if (thumbnail) {
    previewThumbnail.value = thumbnail
  }
}

// 节流的预览生成
const throttledGeneratePreview = (time: number) => {
  if (previewTimeout) {
    clearTimeout(previewTimeout)
  }
  previewTimeout = window.setTimeout(() => {
    generatePreview(time)
  }, 80)
}

// 组件卸载时清理资源
onBeforeUnmount(() => {
  if (currentBitmap) {
    currentBitmap.close()
    currentBitmap = null
  }
})

// 进度百分比
const progress = computed(() => {
  if (isDragging.value) return dragProgress.value
  if (!duration.value) return 0
  return (currentTime.value / duration.value) * 100
})

// 计算进度百分比
const calcProgress = (clientX: number, target: HTMLElement) => {
  const rect = target.getBoundingClientRect()
  const percent = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100))
  return percent
}

// 开始拖拽
const startDrag = (event: MouseEvent) => {
  isDragging.value = true
  dragProgress.value = calcProgress(event.clientX, event.currentTarget as HTMLElement)
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
}

// 拖拽中
const onDrag = (event: MouseEvent) => {
  if (!isDragging.value) return
  const progressBar = document.querySelector('.progress-bar') as HTMLElement
  if (progressBar) {
    dragProgress.value = calcProgress(event.clientX, progressBar)
  }
}

// 结束拖拽
const stopDrag = () => {
  if (isDragging.value && duration.value) {
    currentTime.value = (dragProgress.value / 100) * duration.value
  }
  isDragging.value = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
}

// 进度条悬浮
const handleProgressEnter = () => {
  isHoveringProgress.value = true
}

const handleProgressLeave = () => {
  isHoveringProgress.value = false
}

const handleProgressMove = (event: MouseEvent) => {
  if (!isHoveringProgress.value) return
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  hoverProgress.value = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100))
  hoverPosition.value = Math.max(0, Math.min(rect.width, event.clientX - rect.left))
  
  // 生成预览缩略图
  const time = hoverTime.value
  if (time > 0) {
    throttledGeneratePreview(time)
  }
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

// 键盘控制
const handleKeydown = (event: KeyboardEvent) => {
  if (!duration.value) return
  
  if (event.key === 'ArrowLeft') {
    // 后退10秒
    currentTime.value = Math.max(0, currentTime.value - 10)
  } else if (event.key === 'ArrowRight') {
    // 前进10秒
    currentTime.value = Math.min(duration.value, currentTime.value + 10)
  }
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
      @keydown="handleKeydown"
      tabindex="0"
    />
    
    <!-- 隐藏的预览视频 -->
    <video
      ref="previewVideoRef"
      class="preview-video"
      :src="src"
      preload="metadata"
      muted
    />

    <!-- 控制条 -->
    <Transition name="slide-up">
      <div v-show="showControls" class="controls" @click.stop>
        <!-- 进度条 -->
        <div
          class="progress-bar"
          @mousedown="startDrag"
          @mouseenter="handleProgressEnter"
          @mouseleave="handleProgressLeave"
          @mousemove="handleProgressMove"
        >
          <div class="progress-buffered" :style="{ width: '100%' }" />
          <div class="progress-played" :style="{ width: `${progress}%` }" />
          <div class="progress-thumb" :style="{ left: `${progress}%` }" />
          <div
            v-show="isHoveringProgress"
            class="progress-preview"
            :style="{ left: `${hoverPosition}px` }"
          >
            <img
              v-if="previewThumbnail"
              :src="previewThumbnail"
              class="preview-thumbnail"
              alt=""
            />
            <span class="preview-time">{{ formatTime(hoverTime) }}</span>
          </div>
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
  outline: none;
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
  padding: 8px 0;
  background-clip: content-box;
}

.progress-bar:hover {
  height: 6px;
  padding: 7px 0;
}

.progress-buffered {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  height: 4px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 2px;
}

.progress-bar:hover .progress-buffered {
  height: 6px;
}

.progress-played {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  height: 4px;
  background: var(--accent-color, #1890ff);
  border-radius: 2px;
}

.progress-bar:hover .progress-played {
  height: 6px;
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

.progress-preview {
  position: absolute;
  bottom: 16px;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  background: rgba(0, 0, 0, 0.8);
  border-radius: 6px;
  padding: 4px;
  pointer-events: none;
  z-index: 10;
}

.preview-thumbnail {
  width: 160px;
  height: 90px;
  border-radius: 4px;
  object-fit: cover;
  margin-bottom: 4px;
}

.preview-time {
  color: #fff;
  font-size: 12px;
  white-space: nowrap;
}

.preview-video {
  position: absolute;
  opacity: 0;
  pointer-events: none;
  width: 0;
  height: 0;
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
