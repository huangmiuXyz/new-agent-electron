<script setup lang="ts">
import { isMobileRouteSupported } from '@renderer/constants/mobileCompatibility'

const router = useRouter()

const { Image, Screen, VolumeMedium, ChevronRight } = useIcon([
  'Image',
  'Screen',
  'VolumeMedium',
  'ChevronRight'
])

const createOptions = [
  {
    key: 'video',
    title: '视频',
    description: '输入提示词，生成动态视频内容',
    icon: Screen,
    path: '/mobile/image/video'
  },
  {
    key: 'image',
    title: '图片',
    description: '输入灵感，快速生成图片作品',
    icon: Image,
    path: '/mobile/image/image'
  },
  {
    key: 'speech',
    title: '声音',
    description: '将文本转换成可播放的语音内容',
    icon: VolumeMedium,
    path: '/mobile/image/speech'
  }
] as const

const visibleCreateOptions = computed(() => {
  return createOptions.filter((option) => isMobileRouteSupported(option.path))
})

const openCreatePage = (path: string) => {
  router.push(path)
}
</script>

<template>
  <div class="create-list-page">
    <AppHeader :current-view="'image'" mode="list" />

    <div class="create-list-content">
      <button
        v-for="option in visibleCreateOptions"
        :key="option.key"
        class="create-card"
        type="button"
        @click="openCreatePage(option.path)"
      >
        <div class="create-card-main">
          <div class="create-icon">
            <component :is="option.icon" style="width: 24px; height: 24px;" />
          </div>
          <div class="create-copy">
            <h2>{{ option.title }}</h2>
            <p>{{ option.description }}</p>
          </div>
        </div>
        <ChevronRight class="create-arrow" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.create-list-page {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-app);
}

.create-list-content {
  flex: 1;
  padding: 16px 16px calc(88px + max(env(safe-area-inset-bottom), var(--safe-area-bottom, 0px)));
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.create-card {
  width: 100%;
  border: none;
  border-radius: 16px;
  background: var(--bg-card);
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  text-align: left;
  color: var(--text-primary);
  transition: transform 0.2s ease, background-color 0.2s ease;
}

.create-card:active {
  transform: scale(0.98);
  background: var(--bg-hover);
}

.create-card-main {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.create-icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-color);
  color: var(--accent-text);
  flex-shrink: 0;
}

.create-icon :deep(svg) {
  width: 24px !important;
  height: 24px !important;
}

.create-copy {
  min-width: 0;
  flex: 1;
}

.create-copy h2 {
  font-size: 17px;
  font-weight: 600;
  line-height: 1.3;
  margin-bottom: 4px;
  letter-spacing: -0.02em;
}

.create-copy p {
  font-size: 13px;
  line-height: 1.4;
  color: var(--text-secondary);
}

.create-arrow {
  width: 20px;
  height: 20px;
  color: var(--text-tertiary);
  flex-shrink: 0;
  opacity: 0.6;
}
</style>
