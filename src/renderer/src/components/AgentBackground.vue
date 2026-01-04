<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  backgrounds?: AgentBackground[]
}>()

const currentIndex = ref(0)
const timer = ref<any>(null)
const isDark = ref(false)

const currentBackground = computed(() => {
  if (!props.backgrounds || props.backgrounds.length === 0) return null
  return props.backgrounds[currentIndex.value % props.backgrounds.length]
})

const next = () => {
  if (!props.backgrounds || props.backgrounds.length <= 1) return
  currentIndex.value = (currentIndex.value + 1) % props.backgrounds.length
}

const startTimer = () => {
  stopTimer()
  if (!props.backgrounds || props.backgrounds.length <= 1) return

  const current = currentBackground.value
  if (current?.type === 'image') {
    // 图片 10 秒切换一次
    timer.value = setTimeout(next, 10000)
  }
}

const stopTimer = () => {
  if (timer.value) {
    clearTimeout(timer.value)
    timer.value = null
  }
}

const handleVideoEnded = () => {
  next()
}

// 分析图片亮度
const analyzeBrightness = (url: string) => {
  const img = new Image()
  img.crossOrigin = 'Anonymous'
  img.src = url
  img.onload = () => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = img.width
    canvas.height = img.height
    ctx.drawImage(img, 0, 0)

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data
    let brightness = 0

    for (let i = 0; i < data.length; i += 4) {
      // 计算亮度 (R*299 + G*587 + B*114) / 1000
      brightness += (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000
    }

    const avgBrightness = brightness / (data.length / 4)
    // 亮度 > 128 认为是浅色图，字体需要黑色
    isDark.value = avgBrightness < 128

    // 将状态同步到根节点
    document.documentElement.setAttribute('data-bg-dark', isDark.value.toString())
  }
}

watch(currentBackground, (newBg) => {
  if (newBg?.type === 'image') {
    analyzeBrightness(anyUrlToBlobUrl(newBg.url))
  } else {
    // 视频默认当作深色背景处理，或者根据主题设置
    document.documentElement.removeAttribute('data-bg-dark')
  }
}, { immediate: true })

watch(() => props.backgrounds, () => {
  currentIndex.value = 0
  startTimer()
}, { deep: true })

watch(currentIndex, () => {
  startTimer()
})

onMounted(() => {
  startTimer()
})

onUnmounted(() => {
  stopTimer()
  document.documentElement.removeAttribute('data-bg-dark')
})
</script>

<template>
  <div v-if="currentBackground" class="agent-background">
    <transition name="fade" mode="out-in">
      <div :key="currentIndex" class="background-content">
        <img
          v-if="currentBackground.type === 'image'"
          :src="anyUrlToBlobUrl(currentBackground.url)"
          class="bg-media"
        />
        <video
          v-else-if="currentBackground.type === 'video'"
          ref="videoRef"
          :src="anyUrlToBlobUrl(currentBackground.url)"
          class="bg-media"
          autoplay
          muted
          @ended="handleVideoEnded"
        />
      </div>
    </transition>
    <div class="bg-overlay"></div>
  </div>
</template>

<style scoped>
.agent-background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}

.background-content {
  width: 100%;
  height: 100%;
}

.bg-media {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.bg-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(var(--bg-card-rgb), 0.2);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 1s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
