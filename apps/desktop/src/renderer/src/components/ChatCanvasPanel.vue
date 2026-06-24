<script setup lang="ts">
import Tabs from './Tabs.vue'
import SandboxGitPanel from './SandboxGitPanel.vue'
import SandboxFileTreePanel from './SandboxFileTreePanel.vue'
import SandboxPreviewPanel from './SandboxPreviewPanel.vue'
import SandboxCodePanel from './SandboxCodePanel.vue'
import {
  buildSandboxPreviewDocument,
  getSandboxFileLanguage,
  isSandboxImageFile,
  getSandboxTempWorkspacePath,
  normalizeSandboxPath,
} from '@renderer/services/sandbox'
import { useCanvasFileEditor } from '@renderer/composables/useCanvasFileEditor'
import { useCanvasFileTree } from '@renderer/composables/useCanvasFileTree'
import type { TreeRow } from '@renderer/composables/useCanvasFileTree'
import { useCanvasDragDrop } from '@renderer/composables/useCanvasDragDrop'
import { useCanvasFileOps } from '@renderer/composables/useCanvasFileOps'
import { useCanvasActions } from '@renderer/composables/useCanvasActions'
import { useCanvasGit } from '@renderer/composables/useCanvasGit'
import { useCanvasMenus } from '@renderer/composables/useCanvasMenus'
import { useCanvasPreview } from '@renderer/composables/useCanvasPreview'

interface Props { chatId?: string; hideGitTab?: boolean; hideLocalFolderActions?: boolean }
const props = withDefaults(defineProps<Props>(), { chatId: '', hideGitTab: false, hideLocalFolderActions: false })

const chatsStore = useChatsStores()
const settingsStore = useSettingsStore()
const canvasStore = useCanvasStore()
const agentStore = useAgentStore()
const {
  Terminal: TerminalIcon,
  Settings: SettingsIcon,
} = useIcon(['Terminal', 'Settings'])
const { showContextMenu, hideContextMenu } = useContextMenu<any>()
const { showContextMenu: showTabContextMenu } = useContextMenu<{ filePath: string }>()

const sandboxTreeWidth = useLocalStorage<number>('sandbox-tree-width', 180)
const sandboxTreeCollapsed = ref(false)
const sandboxLogsHeight = useLocalStorage<number>('sandbox-logs-height', 140)
const sandboxLogsCollapsed = ref(false)
const previewReady = ref(false)

const currentTab = computed(() => settingsStore.display.canvasEditorTab)
const canvasTabs = computed(() => {
  const tabs = [{ id: 'preview', name: '预览' }, { id: 'code', name: '代码' }]
  if (!props.hideGitTab) tabs.push({ id: 'git', name: 'Git' })
  return tabs
})

const currentChatId = computed(() => props.chatId || chatsStore.currentChat?.id)
const currentChatAgentWorkspaceDir = computed(() => {
  if (isMobile.value || !window.api?.path) return ''
  const w = agentStore.getAgentById(chatsStore.getChatById(currentChatId.value || '')?.agentId || '')?.workPath?.trim()
  return w ? window.api.path.resolve(window.api.path.normalize(w)) : ''
})
const currentWorkspaceVersion = computed(() => canvasStore.getWorkspaceVersion(currentChatId.value))
const currentWorkspaceDir = computed(() => canvasStore.getWorkspaceDir(currentChatId.value))
const isPreviewTab = computed(() => currentTab.value === 'preview')
const isUsingTempWorkspace = computed(() => currentWorkspaceDir.value === getSandboxTempWorkspacePath(currentChatId.value || 'default'))
const hasCanvasFiles = computed(() => { currentWorkspaceVersion.value; return canvasStore.hasAnyFiles(currentChatId.value) })
const activeFilePath = computed({ get: () => canvasStore.getActiveFilePath(currentChatId.value), set: (v: string) => canvasStore.setActiveFilePath(v, currentChatId.value) })

const previewChannelId = computed(() => `sandbox-preview:${currentChatId.value || 'default'}`)
const previewDocument = computed(() => {
  if (!isUsingTempWorkspace.value || settingsStore.display.canvasEditorTab !== 'preview' || !previewReady.value) return ''
  return buildSandboxPreviewDocument(canvasStore.getCanvas(currentChatId.value), previewChannelId.value)
})
const isSandboxRuntimeVisible = computed(() => currentTab.value === 'preview' && !sandboxLogsCollapsed.value)

const activeLanguage = computed(() => getSandboxFileLanguage(currentTabFilePath.value || '/index.html'))
const isActiveImageFile = computed(() => isSandboxImageFile(currentTabFilePath.value ? activeFile.value : null))
const isActiveBinaryFile = computed(() => activeFile.value?.encoding === 'data-url' && !isActiveImageFile.value)

const fe = useCanvasFileEditor({ currentChatId, currentWorkspaceDir })
const { openFileTabs, fileDrafts, currentTabFilePath, activeFile, hasDraftForFile, getPersistedFile, getDraftContent, activeFileContent, isActiveFileDirty, ensureFileTabOpen, closeFileTab, closeFileTabs, saveActiveFile } = fe

const ft = useCanvasFileTree({ currentChatId })
const { expandedDirectoryPaths, sandboxTreeRows, virtualSandboxTreeRows, sandboxTreeContainerProps, sandboxTreeWrapperProps, availableDirectoryPathSet, loadDirectory, expandDirectory, revealFileAncestors, handleTreeRowClick } = ft

function syncWorkspaceView() {
  previewLogs.value = []
  hideContextMenu()
  resetDragState()
  fileDrafts.value = {}
  previewReady.value = settingsStore.display.canvasEditorTab === 'preview' && isUsingTempWorkspace.value
  const n = canvasStore.getActiveFilePath(currentChatId.value)
  if (n) {
    const wd = canvasStore.getWorkspaceDir(currentChatId.value)
    if (!window.api.fs.existsSync(window.api.path.join(wd, n.replace(/^\/+/, '')))) canvasStore.resetActiveFilePath(currentChatId.value)
  }
  loadDirectory('/')
  revealFileAncestors(activeFilePath.value)
  openFileTabs.value = activeFilePath.value ? [activeFilePath.value] : []
}

function refreshTreeDirectories(paths: string[] = []) {
  const dirs = new Set<string>(['/', ...expandedDirectoryPaths.value])
  paths.forEach((p) => {
    if (!p) return
    const np = p === '/' ? '/' : normalizeSandboxPath(p)
    dirs.add(np)
    const pp = normalizeSandboxPath(p).split('/').filter(Boolean).slice(0, -1).join('/')
    if (pp) dirs.add(`/${pp}`)
  })
  dirs.forEach((d) => loadDirectory(d))
}

const dd = useCanvasDragDrop({ currentChatId, currentWorkspaceDir, syncWorkspaceView, expandDirectory, sandboxTreeRows: ft.sandboxTreeRows })
const { isCanvasDragOver, draggingCanvasFilePath, dragTargetDirectoryPath, resetDragState, handleCanvasDragEnter, handleCanvasDragOver, handleCanvasDragLeave, handleCanvasDrop, handleTreeRowDragStart, handleTreeRowDragEnd, handleDirectoryDragEnter, handleDirectoryDragOver, handleDirectoryDragLeave, handleDirectoryDrop, handleDroppedDataTransfer } = dd

const fo = useCanvasFileOps({ currentChatId, currentWorkspaceDir, isUsingTempWorkspace, hasCanvasFiles, getPersistedFile, ensureFileTabOpen, revealFileAncestors, refreshTreeDirectories })
const { downloadCurrentFile, downloadDirectoryAsZip, downloadAppAsZip, renameTreeRow, deleteTreeRow, uploadCanvasFiles, uploadCanvasFolder, createFile, createFolder, clearCanvas } = fo

const ac = useCanvasActions({ currentChatId, currentWorkspaceDir, isUsingTempWorkspace, hasCanvasFiles, syncWorkspaceView, previewReady })
const { openSaveAppModal, openCanvasInTerminal, openCanvasInLocalFolder, syncLocalFolderToCanvas, chooseLocalWorkspaceFolder, toggleCanvasWorkspaceRoot } = ac

const gt = useCanvasGit({ currentChatId, currentWorkspaceDir })
const { gitStatus, gitCommitMessage, gitGeneratingCommitMessage, gitCommitting, gitCommitProviderId, gitCommitModelId, gitGenerateAfterModelPick, gitActionLoading, gitEntries, gitSelectedEntry, hasGitRepo, gitSelectedPath, gitDiffView, isGitPrimaryButtonDisabled, gitPrimaryButtonLabel, gitPrimaryButtonLoadingLabel, refreshGitDiff, refreshGitStatus, generateGitCommitMessage, runGitPrimaryAction, openGitActionsMenu } = gt

const mu = useCanvasMenus({
  showContextMenu, showTabContextMenu,
  activeFilePath, openFileTabs, getPersistedFile, getDraftContent,
  closeFileTab, closeFileTabs,
  uploadCanvasFiles, uploadCanvasFolder, createFile, createFolder,
  renameTreeRow: (row: TreeRow) => renameTreeRow(row.path, row.name, row.type),
  deleteTreeRow: (row: TreeRow) => deleteTreeRow(row.path, row.type),
  downloadCurrentFile: (path?: string) => path ? downloadCurrentFile(path) : undefined,
  downloadDirectoryAsZip: (row: TreeRow) => downloadDirectoryAsZip(row.path, row.name, row.type),
  downloadAppAsZip, openSaveAppModal, openCanvasInTerminal, openCanvasInLocalFolder,
  syncLocalFolderToCanvas, chooseLocalWorkspaceFolder, toggleCanvasWorkspaceRoot,
  clearCanvas, hasCanvasFiles, isUsingTempWorkspace, currentChatAgentWorkspaceDir,
})
const { openTreeRowMenu, openTreeBlankMenu, openTabContextMenu, openActionsMenu } = mu

const pv = useCanvasPreview()
const { previewLogs, handleSandboxEvent } = pv

const getBaseNameFromPath = (path: string) => path.split('/').filter(Boolean).pop() || path || 'untitled'

const fileTabItems = computed(() => openFileTabs.value.map(fp => ({
  path: fp,
  isActive: fp === activeFilePath.value,
  isDirty: getDraftContent(fp) !== (getPersistedFile(fp)?.content || ''),
  name: getBaseNameFromPath(fp)
})))

const toggleSandboxRuntime = () => {
  if (isSandboxRuntimeVisible.value) { sandboxLogsCollapsed.value = true; return }
  settingsStore.display.canvasEditorTab = 'preview'
  sandboxLogsCollapsed.value = false
  if (sandboxLogsHeight.value < 120) sandboxLogsHeight.value = 140
}

const handleCanvasKeydown = (event: KeyboardEvent) => {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return
  if (settingsStore.display.canvasEditorTab !== 'code' || !currentTabFilePath.value || !isActiveFileDirty.value) return
  event.preventDefault()
  saveActiveFile()
}

watch([gitCommitProviderId, gitCommitModelId], ([pid, mid], [ppid, pmid]) => {
  if (!gitGenerateAfterModelPick.value || !pid || !mid || pid === ppid && mid === pmid) return
  gitGenerateAfterModelPick.value = false
  void generateGitCommitMessage()
})

watch(() => settingsStore.display.canvasEditorTab, (tab) => {
  if (tab === 'preview' && isUsingTempWorkspace.value) { previewReady.value = true; return }
  if (tab === 'git') void refreshGitStatus()
  previewReady.value = false
}, { immediate: true })

watchEffect(() => {
  if (!props.hideGitTab) return
  if (settingsStore.display.canvasEditorTab === 'git') {
    settingsStore.display.canvasEditorTab = 'preview'
  }
})

watch(currentChatId, () => syncWorkspaceView(), { immediate: true })
watch(currentWorkspaceDir, (n, p) => { if (n && n !== p) syncWorkspaceView() })

watch(() => sandboxTreeRows.value.length, () => nextTick(() => {
  const cr = sandboxTreeContainerProps.ref as Ref<HTMLElement | null>
  cr.value?.dispatchEvent(new Event('scroll'))
}))

watch([availableDirectoryPathSet, currentWorkspaceVersion], ([aps]) => {
  const next = expandedDirectoryPaths.value.filter((p) => aps.has(p))
  if (next.length !== expandedDirectoryPaths.value.length || next.some((p, i) => p !== expandedDirectoryPaths.value[i])) expandedDirectoryPaths.value = next
}, { immediate: true })

watch(currentWorkspaceVersion, () => {
  loadDirectory('/')
  expandedDirectoryPaths.value.forEach((p) => { if (p !== '/') loadDirectory(p) })
}, { immediate: true })

watch([currentWorkspaceDir, currentWorkspaceVersion], () => {
  if (settingsStore.display.canvasEditorTab === 'git') void refreshGitStatus()
}, { immediate: true })

watch(activeFilePath, (p) => {
  if (p) ensureFileTabOpen(p)
  revealFileAncestors(p)
}, { immediate: true })

watch([currentTabFilePath, currentWorkspaceVersion], ([fp]) => {
  activeFile.value = fp ? getPersistedFile(fp, { force: true }) : null
}, { immediate: true })

watch(() => activeFile.value?.content, (c) => {
  const fp = activeFilePath.value
  if (!fp || !hasDraftForFile(fp) || fileDrafts.value[fp] === (c || '')) return
  const nd = { ...fileDrafts.value }
  delete nd[fp]
  fileDrafts.value = nd
})

onMounted(() => window.addEventListener('keydown', handleCanvasKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', handleCanvasKeydown))
</script>

<template>
  <div class="canvas-panel" :class="{ 'is-drag-over': isCanvasDragOver }" @dragenter="handleCanvasDragEnter"
    @dragover="handleCanvasDragOver" @dragleave="handleCanvasDragLeave"
    @drop="(e) => handleCanvasDrop(e, handleDroppedDataTransfer)">
    <div v-if="isCanvasDragOver" class="canvas-drop-overlay">
      <div class="canvas-drop-card"><strong>拖入文件到画布</strong><span>任意文件都可以拖入，松手后会同步到当前画布工作区</span></div>
    </div>
    <div class="sandbox-workspace" :class="{ 'is-preview-mode': isPreviewTab }">
      <div v-if="isPreviewTab" class="sandbox-preview-toolbar">
        <div class="canvas-tabs">
          <Tabs v-model="settingsStore.display.canvasEditorTab" :items="canvasTabs" size="sm" />
        </div>
        <div class="sandbox-sidebar-tools">
          <button type="button" class="sandbox-sidebar-tool" :class="{ active: isSandboxRuntimeVisible }"
            :title="isSandboxRuntimeVisible ? '隐藏 Sandbox runtime' : '显示 Sandbox runtime'"
            @click="toggleSandboxRuntime"><TerminalIcon /></button>
          <button type="button" class="sandbox-sidebar-tool" title="更多操作"
            @click="openActionsMenu($event, props.hideLocalFolderActions)"><SettingsIcon /></button>
        </div>
      </div>
      <ResizeBox v-if="!isPreviewTab" v-model:width="sandboxTreeWidth" v-model:is-collapsed="sandboxTreeCollapsed"
        :min-size="140" :max-size="360" class="sandbox-sidebar-resize">
        <aside class="sandbox-sidebar">
          <div class="sandbox-sidebar-header">
            <div class="canvas-tabs">
              <Tabs v-model="settingsStore.display.canvasEditorTab" :items="canvasTabs" size="sm" />
            </div>
            <div class="sandbox-sidebar-tools">
              <button type="button" class="sandbox-sidebar-tool" :class="{ active: isSandboxRuntimeVisible }"
                :title="isSandboxRuntimeVisible ? '隐藏 Sandbox runtime' : '显示 Sandbox runtime'"
                @click="toggleSandboxRuntime"><TerminalIcon /></button>
              <button type="button" class="sandbox-sidebar-tool" title="更多操作"
                @click="openActionsMenu($event, props.hideLocalFolderActions)"><SettingsIcon /></button>
            </div>
          </div>
          <div class="sandbox-explorer-group">
            <template v-if="currentTab === 'git'">
              <SandboxGitPanel
                :git-commit-message="gitCommitMessage"
                :git-selected-path="gitSelectedPath"
                :git-entries="gitEntries"
                :git-status="gitStatus"
                :has-git-repo="hasGitRepo"
                :is-git-primary-button-disabled="isGitPrimaryButtonDisabled"
                :git-committing="gitCommitting"
                :git-action-loading="gitActionLoading"
                :git-primary-button-label="gitPrimaryButtonLabel"
                :git-primary-button-loading-label="gitPrimaryButtonLoadingLabel"
                :git-generating-commit-message="gitGeneratingCommitMessage"
                :git-commit-provider-id="gitCommitProviderId"
                :git-commit-model-id="gitCommitModelId"
                @update:git-commit-message="gitCommitMessage = $event"
                @refresh-git-diff="(p) => p ? void refreshGitDiff(p) : void refreshGitStatus()"
                @run-git-primary-action="void runGitPrimaryAction()"
                @update:git-commit-provider-id="gitCommitProviderId = $event"
                @update:git-commit-model-id="gitCommitModelId = $event"
                @open-git-actions-menu="void openGitActionsMenu($event)"
                @git-generate-after-model-pick="gitGenerateAfterModelPick = true" />
            </template>
            <template v-else>
              <div class="sandbox-explorer-group-header">
                <div class="sandbox-explorer-group-header-row">
                  <span class="sandbox-explorer-group-title">SANDBOX</span>
                </div>
              </div>
              <SandboxFileTreePanel
                :sandbox-tree-container-props="sandboxTreeContainerProps"
                :sandbox-tree-wrapper-props="sandboxTreeWrapperProps"
                :virtual-sandbox-tree-rows="virtualSandboxTreeRows"
                :active-file-path="activeFilePath"
                :drag-target-directory-path="dragTargetDirectoryPath"
                :dragging-canvas-file-path="draggingCanvasFilePath"
                @blank-context-menu="openTreeBlankMenu"
                @tree-row-click="handleTreeRowClick"
                @tree-row-context-menu="openTreeRowMenu"
                @tree-row-drag-start="handleTreeRowDragStart"
                @tree-row-drag-end="handleTreeRowDragEnd"
                @directory-drag-enter="handleDirectoryDragEnter"
                @directory-drag-over="handleDirectoryDragOver"
                @directory-drag-leave="handleDirectoryDragLeave"
                @directory-drop="handleDirectoryDrop" />
            </template>
          </div>
        </aside>
      </ResizeBox>
      <div class="sandbox-main">
        <SandboxPreviewPanel v-if="isPreviewTab"
          :is-using-temp-workspace="isUsingTempWorkspace"
          :preview-ready="previewReady"
          :preview-document="previewDocument"
          :preview-channel-id="previewChannelId"
          :sandbox-logs-height="sandboxLogsHeight"
          :sandbox-logs-collapsed="sandboxLogsCollapsed"
          :preview-logs="previewLogs"
          @sandbox-event="handleSandboxEvent"
          @update:sandbox-logs-height="sandboxLogsHeight = $event"
          @update:sandbox-logs-collapsed="sandboxLogsCollapsed = $event" />
        <SandboxCodePanel v-else
          :file-tabs="fileTabItems"
          :active-file="activeFile"
          :current-tab-file-path="currentTabFilePath"
          :active-file-content="activeFileContent"
          :active-language="activeLanguage"
          :is-active-image-file="isActiveImageFile"
          :is-active-binary-file="isActiveBinaryFile"
          :current-tab="currentTab"
          :git-diff-view="gitDiffView"
          :git-selected-entry="gitSelectedEntry"
          @update:active-file-content="activeFileContent = $event"
          @update:active-file-path="activeFilePath = $event"
          @close-file-tab="void closeFileTab($event)"
          @open-tab-context-menu="openTabContextMenu" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.canvas-panel {
  --sandbox-sidebar-bg: color-mix(in srgb, var(--bg-secondary) 92%, #111827 8%);
  --sandbox-sidebar-border: rgba(var(--text-rgb), 0.08);
  --sandbox-sidebar-text: var(--text-primary);
  --sandbox-sidebar-muted: var(--text-secondary);
  --sandbox-sidebar-faint: var(--text-tertiary);
  --sandbox-tool-hover: rgba(var(--text-rgb), 0.08);
  --sandbox-tool-active: rgba(var(--text-rgb), 0.12);
  --sandbox-tree-hover: rgba(var(--text-rgb), 0.06);
  --sandbox-tree-active-bg: rgba(10, 132, 255, 0.16);
  --sandbox-tree-active-bg-hover: rgba(10, 132, 255, 0.22);
  --sandbox-tree-active-text: var(--text-primary);
  --sandbox-surface-bg: color-mix(in srgb, var(--bg-card) 78%, var(--bg-app) 22%);
  --sandbox-surface-header-bg: color-mix(in srgb, var(--bg-card) 86%, var(--bg-app) 14%);
  --sandbox-preview-bg: #f8fafc;
  --sandbox-log-bg: color-mix(in srgb, var(--bg-card) 72%, #0f172a 28%);
  --sandbox-log-text: color-mix(in srgb, var(--text-primary) 82%, #94a3b8 18%);
  --sandbox-log-ready: #0f766e;
  height: 100%;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  position: relative
}

.canvas-drop-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  background: rgba(15, 23, 42, 0.12);
  backdrop-filter: blur(2px);
  pointer-events: none
}

.canvas-drop-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: min(420px, calc(100% - 32px));
  padding: 18px 20px;
  border-radius: 16px;
  border: 1px solid rgba(var(--accent-rgb), 0.28);
  background: color-mix(in srgb, var(--bg-card) 88%, #fff 12%);
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.16);
  text-align: center
}

.canvas-drop-card strong {
  font-size: 16px;
  color: var(--text-primary)
}

.canvas-drop-card span {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary)
}

.canvas-tabs {
  flex-shrink: 0;
  width: fit-content
}

.canvas-tabs :deep(.tabs-container) {
  border-radius: 6px;
  padding: 1px;
  gap: 1px
}

.canvas-tabs :deep(.tabs-sm .tab-item) {
  padding: 1px 6px;
  font-size: 10px;
  line-height: 1.4;
  border-radius: 4px
}

.sandbox-workspace {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0
}

.sandbox-workspace.is-preview-mode {
  display: flex;
  flex-direction: column
}

.sandbox-preview-toolbar {
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 0 4px;
  background: var(--sandbox-sidebar-bg);
  border-bottom: 1px solid var(--sandbox-sidebar-border);
  flex-shrink: 0
}

.sandbox-sidebar-resize {
  height: 100%;
  min-height: 0
}

.sandbox-main {
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column
}

.sandbox-sidebar {
  width: 100%;
  height: 100%;
  min-height: 0;
  background: var(--sandbox-sidebar-bg);
  display: flex;
  flex-direction: column
}

.sandbox-sidebar-header {
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 0 4px;
  border-bottom: 1px solid var(--sandbox-sidebar-border)
}

.sandbox-sidebar-tools {
  display: flex;
  align-items: center;
  gap: 0
}

.sandbox-sidebar-tool {
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  color: var(--sandbox-sidebar-muted);
  display: grid;
  place-items: center;
  cursor: pointer;
  border-radius: 2px
}

.sandbox-sidebar-tool:disabled {
  opacity: 0.4;
  cursor: default
}

.sandbox-sidebar-tool:hover {
  background: var(--sandbox-tool-hover);
  color: var(--sandbox-sidebar-text)
}

.sandbox-sidebar-tool.active {
  background: var(--sandbox-tool-active);
  color: var(--sandbox-sidebar-text)
}

.sandbox-sidebar-tool :deep(svg) {
  width: 11px;
  height: 11px
}

.sandbox-explorer-group {
  min-height: 0;
  display: flex;
  flex: 1;
  flex-direction: column
}

.sandbox-explorer-group-header {
  min-height: 26px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  gap: 1px;
  padding: 4px 8px 2px;
  color: var(--sandbox-sidebar-muted);
  font-size: 10px;
  letter-spacing: 0.06em
}

.sandbox-explorer-group-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px
}

.sandbox-explorer-group-title {
  font-weight: 700;
  font-size: 11px;
  line-height: 1
}

:global(.dark-mode) .canvas-panel {
  --sandbox-sidebar-bg: #252526;
  --sandbox-sidebar-border: rgba(255, 255, 255, 0.04);
  --sandbox-sidebar-text: rgba(255, 255, 255, 0.9);
  --sandbox-sidebar-muted: rgba(255, 255, 255, 0.62);
  --sandbox-sidebar-faint: rgba(255, 255, 255, 0.38);
  --sandbox-tool-hover: rgba(255, 255, 255, 0.06);
  --sandbox-tool-active: rgba(255, 255, 255, 0.08);
  --sandbox-tree-hover: rgba(255, 255, 255, 0.045);
  --sandbox-tree-active-bg: rgba(9, 71, 113, 0.52);
  --sandbox-tree-active-bg-hover: rgba(9, 71, 113, 0.68);
  --sandbox-tree-active-text: #fff;
  --sandbox-surface-bg: rgba(255, 255, 255, 0.02);
  --sandbox-surface-header-bg: rgba(255, 255, 255, 0.02);
  --sandbox-preview-bg: #1e1e1e;
  --sandbox-log-bg: #181818;
  --sandbox-log-text: var(--text-secondary);
  --sandbox-log-ready: #0f766e
}
</style>
