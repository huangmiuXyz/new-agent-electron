<script setup lang="ts">
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

const openCreatePage = (path: string) => {
  router.push(path)
}
</script>

<template>
  <div class="create-list-page">
    <AppHeader :current-view="'image'" mode="list" />

    <div class="create-list-content">
      <button
        v-for="option in createOptions"
        :key="option.key"
        class="create-card"
        type="button"
        @click="openCreatePage(option.path)"
      >
        <div class="create-card-main">
          <div class="create-icon">
            <component :is="option.icon" />
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
  background:
    radial-gradient(circle at top left, rgba(var(--accent-rgb), 0.08), transparent 38%),
    linear-gradient(180deg, var(--bg-app) 0%, var(--bg-secondary) 100%);
}

.create-list-content {
  flex: 1;
  padding: 8px 16px calc(88px + max(env(safe-area-inset-bottom), var(--safe-area-bottom, 0px)));
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.create-card {
  width: 100%;
  border: 1px solid var(--border-subtle);
  border-radius: 22px;
  background: color-mix(in srgb, var(--bg-card) 92%, transparent);
  backdrop-filter: blur(14px);
  padding: 18px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  text-align: left;
  color: var(--text-primary);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.06);
}

.create-card:active {
  transform: scale(0.985);
}

.create-card-main {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.create-icon {
  width: 50px;
  height: 50px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--accent-color) 12%, var(--bg-card));
  color: var(--accent-color);
  flex-shrink: 0;
}

.create-icon :deep(svg) {
  width: 24px;
  height: 24px;
}

.create-copy {
  min-width: 0;
}

.create-copy h2 {
  font-size: 18px;
  line-height: 1.2;
  margin-bottom: 6px;
}

.create-copy p {
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.create-arrow {
  width: 18px;
  height: 18px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}
</style>
