<script setup lang="ts">
import { h } from 'vue'
import HtmlPreview from '@renderer/components/HtmlPreview.vue'
import { buildSandboxPreviewDocument } from '@renderer/services/sandbox'

const myAppsStore = useMyAppsStore()
const chatsStore = useChatsStores()
const canvasStore = useCanvasStore()
const settingsStore = useSettingsStore()
const router = useRouter()
const modal = useModal()
const { setTitle } = useAppHeader()
const { Play, Trash, Chat, Eye } = useIcon(['Play', 'Trash', 'Chat', 'Eye'])

const appCards = computed(() => myAppsStore.apps)
const selectedAppId = ref('')
const selectedApp = computed(() => myAppsStore.getAppById(selectedAppId.value))
const selectedAppCanvasChatId = computed(() => (selectedApp.value ? `my-app-preview:${selectedApp.value.id}` : ''))

const buildPreviewChannelId = (id: string) => `saved-app-preview:${id}`
const buildPreviewDocument = (id: string) => {
  const app = myAppsStore.getAppById(id)
  if (!app) return ''
  return buildSandboxPreviewDocument(app.canvas, buildPreviewChannelId(id))
}

const formatDateTime = (value: number) => new Date(value).toLocaleString()
const getFileCount = (app: (typeof appCards.value)[number]) => Object.keys(app.canvas.files || {}).length

watch(
  appCards,
  (apps) => {
    if (apps.length === 0) {
      selectedAppId.value = ''
      return
    }

    if (!apps.some((app) => app.id === selectedAppId.value)) {
      selectedAppId.value = apps[0]!.id
    }
  },
  { immediate: true }
)

watch(
  selectedApp,
  (app) => {
    setTitle(app?.name || '我的应用')

    if (!app) return
    canvasStore.importCanvasTemplate(app.canvas, selectedAppCanvasChatId.value)
  },
  { immediate: true }
)

const selectApp = (appId: string) => {
  selectedAppId.value = appId
}

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
  canvasStore.importCanvasTemplate(app.canvas, chatId)
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
  <div class="my-apps-layout">
    <Teleport v-if="!isMobile" defer to="#global-left-panel-content">
      <MyAppsSidebar :apps="appCards" :active-app-id="selectedAppId" @select="selectApp" />
    </Teleport>

    <div class="my-apps-content">
      <FormContainer no-padding :show-header="false" class="my-apps-page">
        <template #content>
          <div class="page-content">
            <div v-if="isMobile && appCards.length > 0" class="mobile-sidebar-shell">
              <MyAppsSidebar :apps="appCards" :active-app-id="selectedAppId" @select="selectApp" />
            </div>

            <div v-if="appCards.length === 0" class="empty-canvas-state">
              <div class="empty-state-card">
                <div class="empty-icon">
                  <Chat />
                </div>
                <div class="empty-state-copy">
                  <h3>还没有保存的应用</h3>
                  <p>先在聊天右侧画布中生成页面，然后点击“保存应用”。</p>
                </div>
              </div>
            </div>

            <template v-else-if="selectedApp">
              <div class="canvas-panel-shell">
                <ChatCanvasPanel
                  :chat-id="selectedAppCanvasChatId"
                  :hide-git-tab="true"
                  :hide-local-folder-actions="true"
                />
              </div>
            </template>
          </div>
        </template>
      </FormContainer>
    </div>
  </div>
</template>

<style scoped>
.my-apps-layout {
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.my-apps-content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  background: var(--bg-card);
}

.my-apps-page {
  background: var(--bg-card);
}

.page-content {
  display: flex;
  flex-direction: column;
  gap: 0;
  height: 100%;
  padding: 0;
  box-sizing: border-box;
}

.mobile-sidebar-shell {
  flex-shrink: 0;
  min-height: 220px;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  overflow: hidden;
  background: var(--bg-settings-mobile-sidebar);
}

.canvas-panel-shell {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-card);
}

.canvas-panel-shell :deep(.canvas-panel) {
  height: 100%;
  border-left: none;
}

.empty-canvas-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  padding: 28px;
  border: 1px solid color-mix(in srgb, var(--border-subtle) 88%, transparent);
  border-radius: 12px;
  background:
    radial-gradient(circle at top, rgba(var(--accent-rgb), 0.035), transparent 34%),
    linear-gradient(180deg, color-mix(in srgb, var(--bg-card) 94%, var(--bg-hover) 6%) 0%, var(--bg-card) 100%);
}

.empty-state-card {
  width: min(560px, 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  text-align: center;
}

.empty-icon {
  width: 52px;
  height: 52px;
  border-radius: 16px;
  background: var(--bg-card);
  border: 1px solid color-mix(in srgb, var(--border-subtle) 88%, transparent);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-state-copy {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}

.empty-state-copy h3 {
  margin: 0;
  font-size: 18px;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}

.empty-state-copy p {
  margin: 0;
  max-width: 460px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary);
}

@media (max-width: 768px) {
  .page-content {
    padding: 0;
  }

  .canvas-panel-shell {
    min-height: 420px;
  }
}
</style>
