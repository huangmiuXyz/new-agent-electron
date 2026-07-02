<script setup lang="ts">
import Divider from '@renderer/components/Divider.vue'

const version = ref('')
const updateStatus = ref('idle') // idle, checking, available, not-available, downloading, downloaded, error
const updateInfo = ref<any>(null)
const downloadProgress = ref<any>(null)
const errorMessage = ref('')
const hasUpdater = computed(() => Boolean(window.api?.updater))
const hasDevTools = computed(() => Boolean(window.api?.openDevTools))

const { ChevronRight } = useIcon(['ChevronRight'])

const updateStatusText = computed(() => {
  switch (updateStatus.value) {
    case 'idle': return '检查新版本'
    case 'checking': return '正在检查更新…'
    case 'not-available': return '当前已是最新版本'
    case 'available': return `发现新版本 ${updateInfo.value?.version ?? ''}`
    case 'downloading': return '正在下载更新…'
    case 'downloaded': return '更新已就绪'
    case 'error': return '检查失败'
    default: return ''
  }
})

const openLink = (url: string) => {
  window.open(url, '_blank')
}

const aboutLinks = [
  {
    name: 'GitHub 项目主页',
    url: 'https://github.com/huangmiuXyz/new-agent-electron'
  },
  {
    name: '反馈问题',
    url: 'https://github.com/huangmiuXyz/new-agent-electron/issues'
  }
]

const checkUpdates = async () => {
  if (!window.api?.updater) return
  if (updateStatus.value === 'checking' || updateStatus.value === 'downloading') return

  updateStatus.value = 'checking'
  try {
    await window.api.updater.checkForUpdates()
  } catch (error: any) {
    updateStatus.value = 'error'
    errorMessage.value = error.message || '检查更新失败'
  }
}

const startDownload = async () => {
  if (!window.api?.updater) return
  try {
    updateStatus.value = 'downloading'
    await window.api.updater.downloadUpdate()
  } catch (error: any) {
    updateStatus.value = 'error'
    errorMessage.value = error.message || '下载更新失败'
  }
}

const installUpdate = () => {
  window.api?.updater?.quitAndInstall()
}

const openDevTools = () => {
  window.api?.openDevTools?.()
}

let removeListener: (() => void) | null = null

onMounted(async () => {
  if (!window.api?.updater) return

  version.value = await window.api.updater.getVersion()

  removeListener = window.api.updater.onStatus((status: any) => {
    updateStatus.value = status.status
    if (status.info) updateInfo.value = status.info
    if (status.progress) downloadProgress.value = status.progress
    if (status.message) errorMessage.value = status.message
  })
})

onUnmounted(() => {
  if (removeListener) removeListener()
})
</script>

<template>
  <FormContainer header-title="关于我们">
    <template #content>
      <div class="settings-page-wrapper">
      <div class="about-wrapper">
        <!-- Hero -->
        <div class="about-hero">
          <Image src="/logo.png" alt="logo" class="about-logo" />
          <div class="about-hero-info">
            <div class="about-hero-top">
              <h1 class="about-app-name">Agent Qi</h1>
              <Tags v-if="version" :tags="['v' + version]" color="orange" size="sm" />
            </div>
            <p class="about-desc">一个智能的 AI 助手，帮助你更高效地工作和创作</p>
          </div>
        </div>

        <Divider margin="24px 0" />

        <!-- Software Update -->
        <div v-if="hasUpdater" class="about-section">
          <SettingsGroup label="软件更新">
            <SettingsRow
              :name="updateStatusText"
              :desc="updateStatus === 'error' ? errorMessage : ''"
              :muted="updateStatus === 'error'"
            >
              <template #icon>
                <component :is="useIcon('Download')" />
              </template>
              <template #actions>
                <Button
                  v-if="['idle', 'not-available', 'error'].includes(updateStatus)"
                  size="sm"
                  @click="checkUpdates"
                >
                  检查更新
                </Button>
                <Button
                  v-if="updateStatus === 'available'"
                  size="sm"
                  @click="startDownload"
                >
                  立即下载
                </Button>
                <Button
                  v-if="updateStatus === 'downloaded'"
                  size="sm"
                  @click="installUpdate"
                >
                  重启安装
                </Button>
              </template>
            </SettingsRow>

            <!-- Progress -->
            <div v-if="updateStatus === 'downloading'" class="about-progress">
              <div class="about-progress-track">
                <div class="about-progress-bar" :style="{ width: downloadProgress?.percent + '%' }"></div>
              </div>
              <span class="about-progress-value">{{ downloadProgress?.percent?.toFixed(0) }}%</span>
            </div>

            <!-- Release Notes -->
            <div v-if="updateInfo?.releaseNotes && updateStatus === 'available'" class="about-release-notes">
              <div class="about-notes-content" v-html="updateInfo.releaseNotes"></div>
            </div>
          </SettingsGroup>
        </div>

        <!-- Dev Tools -->
        <div v-if="hasDevTools" class="about-section">
          <SettingsGroup label="开发者">
            <SettingsRow name="调试窗口">
              <template #icon>
                <component :is="useIcon('Terminal')" />
              </template>
              <template #actions>
                <Button size="sm" @click="openDevTools">打开调试窗口</Button>
              </template>
            </SettingsRow>
          </SettingsGroup>
        </div>

        <!-- Links -->
        <div class="about-section">
          <SettingsGroup label="相关链接">
            <SettingsRow
              v-for="link in aboutLinks"
              :key="link.url"
              :name="link.name"
              clickable
              @click="openLink(link.url)"
            >
              <template #icon>
                <component :is="useIcon('Link')" />
              </template>
              <template #actions>
                <ChevronRight class="about-link-arrow" />
              </template>
            </SettingsRow>
          </SettingsGroup>
        </div>

        <!-- Footer -->
        <p class="about-footer">© {{ new Date().getFullYear() }} Agent Qi</p>
      </div>
      </div>
    </template>
  </FormContainer>
</template>

<style scoped>
.about-wrapper {
  display: flex;
  flex-direction: column;
}

/* Hero */
.about-hero {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 4px 0;
}

.about-logo {
  width: 64px;
  height: 64px;
  border-radius: 14px;
  flex-shrink: 0;
}

.about-hero-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.about-hero-top {
  display: flex;
  align-items: center;
  gap: 10px;
}

.about-app-name {
  font-size: 22px;
  font-weight: 650;
  color: var(--text-primary);
  margin: 0;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.about-desc {
  font-size: 13px;
  color: var(--text-tertiary);
  margin: 0;
  line-height: 1.5;
}

/* Section */
.about-section {
  margin-bottom: 16px;
}

/* Progress */
.about-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px 14px;
}

.about-progress-track {
  flex: 1;
  height: 4px;
  background: var(--border-subtle);
  border-radius: 2px;
  overflow: hidden;
}

.about-progress-bar {
  height: 100%;
  background: var(--accent-color, var(--color-primary));
  transition: width 0.3s ease;
  border-radius: 2px;
}

.about-progress-value {
  font-size: 11px;
  color: var(--text-tertiary);
  width: 34px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* Release Notes */
.about-release-notes {
  border-top: 1px solid var(--border-subtle);
  padding: 14px 16px;
}

.about-notes-content {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
  max-height: 200px;
  overflow-y: auto;
}

/* Link arrow */
.about-link-arrow {
  width: 14px;
  height: 14px;
  color: var(--text-tertiary);
}

/* Footer */
.about-footer {
  text-align: center;
  font-size: 11px;
  color: var(--text-tertiary);
  opacity: 0.5;
  margin-top: 32px;
}
</style>
