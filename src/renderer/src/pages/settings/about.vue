<script setup lang="ts">
import { FormItem } from '@renderer/composables/useForm'
import Divider from '@renderer/components/Divider.vue'
import List from '@renderer/components/List.vue'
import Card from '@renderer/components/Card.vue'

const version = ref('')
const updateStatus = ref('idle') // idle, checking, available, not-available, downloading, downloaded, error
const updateInfo = ref<any>(null)
const downloadProgress = ref<any>(null)
const errorMessage = ref('')

const { ChevronRight } = useIcon(['ChevronRight'])

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

const handleLinkClick = (url: string) => {
  window.open(url, '_blank')
}

const checkUpdates = async () => {
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
  try {
    updateStatus.value = 'downloading'
    await window.api.updater.downloadUpdate()
  } catch (error: any) {
    updateStatus.value = 'error'
    errorMessage.value = error.message || '下载更新失败'
  }
}

const installUpdate = () => {
  window.api.updater.quitAndInstall()
}

let removeListener: (() => void) | null = null

onMounted(async () => {
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
      <div class="about-wrapper">
        <FormItem>
          <div class="header-card">
            <Image src="/logo.png" alt="logo" class="app-logo" />
            <div class="header-info">
              <div class="title-row">
                <h1 class="app-name">Agent Qi</h1>
                <Tags :tags="['v' + version]" color="orange" />
              </div>
            </div>
          </div>
          <Divider margin="24px 0 0 0" />
        </FormItem>
        <!-- App Header -->

        <!-- Update Section -->
        <FormItem label="软件更新">
          <Card>
            <div class="update-row">
              <div class="update-status-text">
                <span v-if="updateStatus === 'idle'">检查新版本</span>
                <span v-else-if="updateStatus === 'checking'">正在检查更新...</span>
                <span v-else-if="updateStatus === 'not-available'">当前已是最新版本</span>
                <span v-else-if="updateStatus === 'available'">发现新版本 {{ updateInfo?.version }}</span>
                <span v-else-if="updateStatus === 'downloading'">正在下载更新...</span>
                <span v-else-if="updateStatus === 'downloaded'">更新已就绪</span>
                <span v-else-if="updateStatus === 'error'" class="error-text">检查失败: {{ errorMessage }}</span>
              </div>

              <div class="update-actions">
                <Button v-if="['idle', 'not-available', 'error'].includes(updateStatus)" @click="checkUpdates">
                  检查更新
                </Button>
                <Button v-if="updateStatus === 'available'" @click="startDownload">
                  立即下载
                </Button>
                <Button v-if="updateStatus === 'downloaded'" @click="installUpdate">
                  重启安装
                </Button>
              </div>
            </div>

            <!-- Progress Bar -->
            <div v-if="updateStatus === 'downloading'" class="progress-section">
              <div class="progress-track">
                <div class="progress-bar" :style="{ width: downloadProgress?.percent + '%' }"></div>
              </div>
              <span class="progress-value">{{ downloadProgress?.percent?.toFixed(0) }}%</span>
            </div>

            <!-- Release Notes -->
            <div v-if="updateInfo?.releaseNotes && updateStatus === 'available'" class="release-notes">
              <div class="notes-content" v-html="updateInfo.releaseNotes"></div>
            </div>
          </Card>
        </FormItem>

        <FormItem label="相关链接">
          <List :items="aboutLinks" variant="card" key-field="url" main-field="name" @select="handleLinkClick">
            <template #actions>
              <component :is="ChevronRight" class="link-icon" />
            </template>
          </List>
        </FormItem>
      </div>
    </template>
  </FormContainer>
</template>

<style scoped>
.about-wrapper {
  max-width: 640px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
}

/* Header Card */
.header-card {
  display: flex;
  align-items: center;
  gap: 20px;
}

.app-logo {
  width: 64px;
  height: 64px;
  border-radius: 8px;
}

.header-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.app-name {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  text-wrap: nowrap;
}

.version-tag {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  padding: 2px 8px;
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
}

.app-desc {
  font-size: 13px;
  color: var(--text-tertiary);
  margin: 0;
}

/* Section Common */
.section-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Update Card */
.update-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  min-height: 56px;
}

.update-status-text {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
  height: 30px;
  align-items: center;
  display: flex;
}

.error-text {
  color: #ef4444;
}

/* Buttons */
.btn {
  padding: 6px 16px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  outline: none;
}

.btn-secondary {
  background: transparent;
  border: 1px solid var(--border-subtle);
  color: var(--text-primary);
}

.btn-secondary:hover {
  background: var(--bg-hover);
  border-color: var(--border-hover);
}

.btn-primary {
  background: var(--text-primary);
  color: var(--bg-primary);
  border: 1px solid transparent;
}

.btn-primary:hover {
  opacity: 0.9;
}

/* Progress Bar */
.progress-section {
  padding: 0 16px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.progress-track {
  flex: 1;
  height: 4px;
  background: var(--border-subtle);
  border-radius: 2px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background: var(--text-primary);
  transition: width 0.2s ease;
}

.progress-value {
  font-size: 12px;
  color: var(--text-secondary);
  width: 36px;
  text-align: right;
}

/* Release Notes */
.release-notes {
  padding: 0 16px 16px;
}

.notes-content {
  margin-top: 12px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
  max-height: 200px;
  overflow-y: auto;
}

/* Link Icon */
.link-icon {
  width: 16px;
  height: 16px;
  color: var(--text-tertiary);
}

/* Copyright */
.copyright {
  text-align: center;
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: auto;
}
</style>
