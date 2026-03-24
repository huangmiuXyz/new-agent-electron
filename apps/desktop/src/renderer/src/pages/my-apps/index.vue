<script setup lang="ts">
import HtmlPreview from '@renderer/components/HtmlPreview.vue'
import { buildSandboxPreviewDocument, ensureSandboxState } from '@renderer/services/sandbox'

const myAppsStore = useMyAppsStore()
const chatsStore = useChatsStores()
const canvasStore = useCanvasStore()
const settingsStore = useSettingsStore()
const router = useRouter()
const modal = useModal()
const { setTitle } = useAppHeader()
const { Play, Trash, Chat, Sparkles } = useIcon(['Play', 'Trash', 'Chat', 'Sparkles'])

setTitle('我的应用')

const appCards = computed(() => myAppsStore.apps)

const buildPreviewChannelId = (id: string) => `saved-app-preview:${id}`
const buildPreviewDocument = (id: string) => {
  const app = myAppsStore.getAppById(id)
  return buildSandboxPreviewDocument(ensureSandboxState(app?.canvas), buildPreviewChannelId(id))
}

const formatDateTime = (value: number) => new Date(value).toLocaleString()

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
  <div class="my-apps-page">
    <div class="page-hero">
      <div>
        <p class="hero-kicker">Saved canvas apps</p>
        <h2>我的应用</h2>
        <p class="hero-text">把画布里的原型保存下来，之后一键恢复到聊天画布里继续使用和迭代。</p>
      </div>
      <div class="hero-badge">
        <Sparkles />
        <span>{{ appCards.length }} 个应用</span>
      </div>
    </div>

    <div v-if="appCards.length === 0" class="empty-state">
      <div class="empty-icon">
        <Chat />
      </div>
      <h3>还没有保存的应用</h3>
      <p>先在聊天右侧画布中生成页面，然后点击“保存应用”。</p>
    </div>

    <div v-else class="apps-grid">
      <article v-for="app in appCards" :key="app.id" class="app-card">
        <div class="app-preview-shell">
          <HtmlPreview
            :srcdoc="buildPreviewDocument(app.id)"
            :channel-id="buildPreviewChannelId(app.id)"
          />
        </div>

        <div class="app-card-body">
          <div class="app-card-head">
            <div class="app-meta">
              <div class="app-icon">{{ app.iconEmoji }}</div>
              <div>
                <h3>{{ app.name }}</h3>
                <p>{{ app.description || '未填写描述' }}</p>
              </div>
            </div>
            <div class="app-time">{{ formatDateTime(app.updatedAt) }}</div>
          </div>

          <div class="app-card-footer">
            <div class="app-info">
              <span>{{ Object.keys(app.canvas.files || {}).length }} 个文件</span>
            </div>
            <div class="app-actions">
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
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.my-apps-page {
  height: 100%;
  overflow: auto;
  padding: 24px;
  background:
    radial-gradient(circle at top right, rgba(59, 130, 246, 0.12), transparent 28%),
    linear-gradient(180deg, var(--bg-card) 0%, var(--bg-app) 100%);
}

.page-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}

.hero-kicker {
  margin-bottom: 8px;
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text-tertiary);
}

.page-hero h2 {
  font-size: 28px;
  line-height: 1.1;
  color: var(--text-primary);
}

.hero-text {
  margin-top: 10px;
  max-width: 640px;
  color: var(--text-secondary);
  line-height: 1.7;
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 999px;
  background: rgba(var(--color-primary-rgb), 0.1);
  color: var(--text-primary);
  border: 1px solid rgba(var(--color-primary-rgb), 0.12);
  white-space: nowrap;
}

.apps-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 18px;
}

.app-card {
  display: flex;
  flex-direction: column;
  min-height: 360px;
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid rgba(var(--text-rgb), 0.08);
  background: linear-gradient(180deg, rgba(var(--bg-rgb), 0.92), rgba(var(--bg-rgb), 0.98));
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.08);
}

.app-preview-shell {
  height: 220px;
  padding: 10px;
  background:
    linear-gradient(135deg, rgba(var(--color-primary-rgb), 0.08), rgba(16, 185, 129, 0.06)),
    var(--bg-secondary);
  border-bottom: 1px solid rgba(var(--text-rgb), 0.08);
}

.app-preview-shell :deep(.preview-wrapper) {
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.06);
}

.app-card-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
}

.app-card-head {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.app-meta {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.app-icon {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: rgba(var(--color-primary-rgb), 0.12);
  font-size: 20px;
  flex-shrink: 0;
}

.app-meta h3 {
  font-size: 16px;
  color: var(--text-primary);
}

.app-meta p {
  margin-top: 4px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.app-time {
  font-size: 12px;
  color: var(--text-tertiary);
}

.app-card-footer {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.app-info {
  color: var(--text-tertiary);
  font-size: 12px;
}

.app-actions {
  display: flex;
  gap: 8px;
}

.empty-state {
  height: calc(100% - 120px);
  min-height: 320px;
  display: grid;
  place-items: center;
  text-align: center;
  color: var(--text-secondary);
  border: 1px dashed rgba(var(--text-rgb), 0.12);
  border-radius: 20px;
  background: rgba(var(--bg-rgb), 0.5);
}

.empty-icon {
  width: 68px;
  height: 68px;
  margin: 0 auto 16px;
  display: grid;
  place-items: center;
  border-radius: 20px;
  background: rgba(var(--color-primary-rgb), 0.08);
}

.empty-state h3 {
  margin-bottom: 8px;
  color: var(--text-primary);
}

@media (max-width: 768px) {
  .my-apps-page {
    padding: 18px 16px 24px;
  }

  .page-hero {
    flex-direction: column;
    align-items: flex-start;
  }

  .apps-grid {
    grid-template-columns: 1fr;
  }

  .app-card-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .app-actions {
    width: 100%;
  }
}
</style>
