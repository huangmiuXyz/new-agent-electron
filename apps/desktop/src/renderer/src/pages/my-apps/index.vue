<script setup lang="ts">
import { h } from 'vue'
import HtmlPreview from '@renderer/components/HtmlPreview.vue'
import { buildSandboxPreviewDocument, ensureSandboxState } from '@renderer/services/sandbox'

const myAppsStore = useMyAppsStore()
const chatsStore = useChatsStores()
const canvasStore = useCanvasStore()
const settingsStore = useSettingsStore()
const router = useRouter()
const modal = useModal()
const { setTitle } = useAppHeader()
const { Play, Trash, Chat, Eye } = useIcon(['Play', 'Trash', 'Chat', 'Eye'])

setTitle('我的应用')

const appCards = computed(() => myAppsStore.apps)

const buildPreviewChannelId = (id: string) => `saved-app-preview:${id}`
const buildPreviewDocument = (id: string) => {
  const app = myAppsStore.getAppById(id)
  return buildSandboxPreviewDocument(ensureSandboxState(app?.canvas), buildPreviewChannelId(id))
}

const formatDateTime = (value: number) => new Date(value).toLocaleString()
const getFileCount = (app: (typeof appCards.value)[number]) => Object.keys(app.canvas.files || {}).length

const openPreviewModal = async (appId: string) => {
  const app = myAppsStore.getAppById(appId)
  if (!app) return

  await modal.confirm({
    title: `预览 · ${app.name}`,
    content: h(HtmlPreview, {
      srcdoc: buildPreviewDocument(appId),
      channelId: `${buildPreviewChannelId(appId)}:modal`
    }),
    width: '90%',
    height: '90vh',
    confirmText: '关闭',
    modalBodyStyle: {
      padding: 0
    },
    showFooter: true,
    showCancel: false
  })
}

const useSavedApp = (appId: string) => {
  const app = myAppsStore.getAppById(appId)
  if (!app) return

  const chatId = chatsStore.createChat(`应用：${app.name}`)
  canvasStore.replaceCanvas(app.canvas, chatId)
  chatsStore.setActiveChat(chatId)
  settingsStore.display.speechSidebarCollapsed = false
  settingsStore.display.assistantSidebarTab = 'canvas'

  if (isMobile.value) {
    router.push('/mobile/chat/session')
    return
  }

  router.push('/chat')
}

const removeSavedApp = async (appId: string) => {
  const app = myAppsStore.getAppById(appId)
  if (!app) return

  const confirmed = await modal.confirm({
    title: '删除应用',
    content: `确定删除“${app.name}”吗？`,
    confirmProps: {
      danger: true
    },
    confirmText: '删除',
    cancelText: '取消'
  })

  if (!confirmed) return
  myAppsStore.deleteApp(appId)
}
</script>

<template>
  <FormContainer no-padding class="my-apps-page">
    <template #header>
      <div class="page-header">
        <span>我的应用</span>
        <span class="count-badge">{{ appCards.length }} 个应用</span>
      </div>
    </template>

    <template #content>
      <div class="page-content">

        <div v-if="appCards.length === 0" class="empty-state">
          <div class="empty-icon">
            <Chat />
          </div>
          <h3>还没有保存的应用</h3>
          <p>先在聊天右侧画布中生成页面，然后点击“保存应用”。</p>
        </div>

        <div v-else class="apps-grid">
          <Card
            v-for="app in appCards"
            :key="app.id"
            padding="0"
            radius="14px"
            class="app-card"
          >
            <div class="app-card-body">
              <div class="app-card-head">
                <div class="app-meta">
                  <div class="app-icon">{{ app.iconEmoji }}</div>
                  <div class="app-title-wrap">
                    <h3>{{ app.name }}</h3>
                    <p>{{ app.description || '未填写描述' }}</p>
                  </div>
                </div>
              </div>

              <div class="app-stats">
                <div class="app-stat">
                  <span class="app-stat-label">更新时间</span>
                  <span class="app-stat-value">{{ formatDateTime(app.updatedAt) }}</span>
                </div>
                <div class="app-stat">
                  <span class="app-stat-label">文件数</span>
                  <span class="app-stat-value">{{ getFileCount(app) }} 个</span>
                </div>
              </div>

              <div class="app-card-footer">
                <Button size="sm" variant="secondary" @click="openPreviewModal(app.id)">
                  <template #icon>
                    <Eye />
                  </template>
                  预览
                </Button>
                <Button size="sm" variant="secondary" @click="removeSavedApp(app.id)">
                  <template #icon>
                    <Trash />
                  </template>
                  删除
                </Button>
                <Button size="sm" variant="primary" @click="useSavedApp(app.id)">
                  <template #icon>
                    <Play />
                  </template>
                  使用
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </template>
  </FormContainer>
</template>

<style scoped>
.my-apps-page {
  background: var(--bg-card);
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 12px;
}

.count-badge {
  font-size: 11px;
  color: var(--accent-color);
  background: var(--bg-active);
  border: 1px solid rgba(var(--accent-rgb), 0.2);
  border-radius: 999px;
  padding: 2px 8px;
  white-space: nowrap;
}

.page-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  padding: 20px;
  box-sizing: border-box;
}

.page-intro {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.page-intro h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.page-intro p {
  margin: 0;
  max-width: 720px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.apps-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px;
}

.app-card {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.app-card-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
}

.app-meta {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.app-icon {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: var(--bg-hover);
  border: 1px solid var(--border-subtle);
  font-size: 18px;
  flex-shrink: 0;
}

.app-title-wrap {
  min-width: 0;
  flex: 1;
}

.app-meta h3 {
  margin: 0;
  font-size: 16px;
  line-height: 1.35;
  color: var(--text-primary);
}

.app-meta p {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.55;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.app-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.app-stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 10px 12px;
  background: var(--bg-hover);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
}

.app-stat-label {
  font-size: 11px;
  color: var(--text-tertiary);
}

.app-stat-value {
  font-size: 12px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.app-card-footer {
  margin-top: auto;
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.empty-state {
  min-height: 280px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 36px 24px;
  text-align: center;
  background: var(--bg-hover);
  border: 1px dashed var(--border-subtle);
  border-radius: 14px;
}

.empty-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-state h3 {
  margin: 0;
  font-size: 16px;
  color: var(--text-primary);
}

.empty-state p {
  margin: 0;
  max-width: 420px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
}

@media (max-width: 768px) {
  .page-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .page-content {
    padding: 16px;
  }

  .apps-grid {
    grid-template-columns: 1fr;
  }

  .app-stats {
    grid-template-columns: 1fr;
  }

  .app-card-footer {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
