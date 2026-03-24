<script setup lang="ts">
import HtmlPreview from './HtmlPreview.vue'
import Tabs from './Tabs.vue'
import { buildSandboxPreviewDocument, buildSandboxTree, getSandboxFileLanguage, normalizeSandboxPath } from '@renderer/services/sandbox'
import { common, createLowlight } from 'lowlight'
import { toHtml } from 'hast-util-to-html'
import 'highlight.js/styles/github.css'
import 'highlight.js/styles/atom-one-dark.css'

type PreviewLogItem = {
  id: string
  kind: 'console' | 'error' | 'ready'
  level?: string
  text: string
}

type TreeRow = {
  id: string
  name: string
  path: string
  type: 'directory' | 'file'
  depth: number
}

const chatsStore = useChatsStores()
const settingsStore = useSettingsStore()
const canvasStore = useCanvasStore()
const myAppsStore = useMyAppsStore()
const lowlight = createLowlight(common)
const message = messageApi
const modal = useModal()
const { Download: DownloadIcon, Plus: AddIcon, Trash: TrashIcon, Settings: SettingsIcon, Box: BoxIcon } = useIcon([
  'Download',
  'Plus',
  'Trash',
  'Settings',
  'Box'
])
const { showContextMenu, hideContextMenu } = useContextMenu()

const canvasTabs = [
  { id: 'preview', name: '预览' },
  { id: 'code', name: '代码' }
]
const SANDBOX_TREE_WIDTH_KEY = 'sandbox-tree-width'
const sandboxTreeWidth = ref(Number(localStorage.getItem(SANDBOX_TREE_WIDTH_KEY)) || 180)
const sandboxTreeCollapsed = ref(false)

const currentChatId = computed(() => chatsStore.currentChat?.id)
const currentCanvas = computed(() => canvasStore.getCanvas(currentChatId.value))
const sandboxTreeRows = computed<TreeRow[]>(() => {
  const rows: TreeRow[] = []
  const walk = (nodes: ReturnType<typeof buildSandboxTree>, depth = 0) => {
    for (const node of nodes) {
      rows.push({
        id: node.id,
        name: node.name,
        path: node.path,
        type: node.type,
        depth
      })
      if (node.children?.length) {
        walk(node.children, depth + 1)
      }
    }
  }
  walk(buildSandboxTree(currentCanvas.value))
  return rows
})

const activeFilePath = computed({
  get: () => canvasStore.getActiveFilePath(currentChatId.value),
  set: (value: string) => canvasStore.setActiveFilePath(value, currentChatId.value)
})

const activeFile = computed(() => canvasStore.getActiveFile(currentChatId.value))

const activeFileContent = computed({
  get: () => activeFile.value?.content || '',
  set: (value: string) => {
    const filePath = activeFilePath.value
    if (!filePath) return
    canvasStore.updateFileContent(filePath, value, currentChatId.value)
  }
})

const activeLanguage = computed(() => getSandboxFileLanguage(activeFilePath.value || '/index.html'))
const hasCanvasFiles = computed(() => sandboxTreeRows.value.some((row) => row.type === 'file'))
const suggestedAppName = computed(() => {
  const title = String(chatsStore.currentChat?.title || '').trim()
  return title || '未命名应用'
})

const previewChannelId = computed(() => `sandbox-preview:${currentChatId.value || 'default'}`)
const previewDocument = computed(() => buildSandboxPreviewDocument(currentCanvas.value, previewChannelId.value))
const previewLogs = ref<PreviewLogItem[]>([])

const downloadCurrentFile = () => {
  const file = activeFile.value
  if (!file) {
    message.warning('当前没有可下载文件')
    return
  }

  try {
    const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = file.path.split('/').pop() || 'sandbox-file.txt'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    message.success(`已开始下载 ${file.path}`)
  } catch (error) {
    console.error('Sandbox download error:', error)
    message.error('下载文件失败')
  }
}

const clearCanvas = () => {
  canvasStore.clearCanvas(currentChatId.value)
  previewLogs.value = []
}

const createFile = () => {
  const [FormComponent, formActions] = useForm({
    fields: [
      {
        name: 'path',
        label: '文件路径',
        type: 'text',
        placeholder: '例如 /components/card.js',
        required: true
      }
    ],
    initialData: {
      path: '/new-file.js'
    },
    onSubmit: (data) => {
      try {
        const filePath = normalizeSandboxPath(String(data.path || ''))
        canvasStore.applyOperation(
          {
            type: 'add',
            filePath,
            newStr: ''
          },
          currentChatId.value
        )
        message.success(`已创建文件 ${filePath}`)
        modal.remove()
      } catch (error) {
        message.error((error as Error).message)
      }
    }
  })

  modal.confirm({
    title: '新建文件',
    content: FormComponent,
    confirmText: '创建',
    cancelText: '取消',
    onOk: () => {
      formActions.submit()
    }
  })
}

const openSaveAppModal = () => {
  if (!hasCanvasFiles.value) {
    message.warning('当前画布还没有文件，先生成或创建内容后再保存应用')
    return
  }

  const [FormComponent, formActions] = useForm({
    fields: [
      {
        name: 'name',
        label: '应用名称',
        type: 'text',
        placeholder: '给这个应用起个名字',
        required: true
      },
      {
        name: 'iconEmoji',
        label: '图标',
        type: 'text',
        placeholder: '例如 ✨'
      },
      {
        name: 'description',
        label: '描述',
        type: 'textarea',
        placeholder: '简单描述这个应用是做什么的',
        rows: 3
      }
    ],
    initialData: {
      name: suggestedAppName.value,
      iconEmoji: '✨',
      description: ''
    },
    onSubmit: (data) => {
      const savedApp = myAppsStore.saveApp({
        name: String(data.name || '').trim(),
        description: String(data.description || '').trim(),
        iconEmoji: String(data.iconEmoji || '').trim() || '✨',
        canvas: currentCanvas.value,
        sourceChatId: currentChatId.value || null
      })

      message.success(`已保存应用：${savedApp.name}`)
      modal.remove()
    }
  })

  modal.confirm({
    title: '保存应用',
    content: FormComponent,
    confirmText: '保存',
    cancelText: '取消',
    onOk: () => {
      formActions.submit()
    }
  })
}

const deleteCurrentFile = async () => {
  const file = activeFile.value
  if (!file) return

  const confirmed = await modal.confirm({
    title: '删除文件',
    content: `确定删除 ${file.path} 吗？`,
    confirmProps: {
      danger: true
    },
    confirmText: '删除',
    cancelText: '取消'
  })
  if (!confirmed) return

  try {
    canvasStore.applyOperation(
      {
        type: 'delete',
        filePath: file.path
      },
      currentChatId.value
    )
    message.success(`已删除文件 ${file.path}`)
  } catch (error) {
    message.error((error as Error).message)
  }
}

const highlightedCode = computed(() => {
  const content = activeFileContent.value || ''
  const language = activeLanguage.value

  if (!content) {
    return `<code class="hljs language-${language}"></code>`
  }

  try {
    if (language === 'text') {
      throw new Error('plain text fallback')
    }
    return `<code class="hljs language-${language}">${toHtml(lowlight.highlight(language, content))}</code>`
  } catch {
    return `<code class="hljs language-${language}">${content
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')}</code>`
  }
})

const codeEditorRef = useTemplateRef('codeEditorRef')
const codeHighlightRef = useTemplateRef('codeHighlightRef')

const syncCodeScroll = () => {
  const editor = codeEditorRef.value
  const highlight = codeHighlightRef.value
  if (!editor || !highlight) return
  highlight.scrollTop = editor.scrollTop
  highlight.scrollLeft = editor.scrollLeft
}

const appendPreviewLog = (item: Omit<PreviewLogItem, 'id'>) => {
  previewLogs.value = [
    ...previewLogs.value.slice(-79),
    {
      ...item,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    }
  ]
}

const handleSandboxEvent = (payload: any) => {
  if (payload.kind === 'ready') {
    appendPreviewLog({
      kind: 'ready',
      text: payload.entryPath ? `Preview ready: ${payload.entryPath}` : 'Preview ready'
    })
    return
  }

  if (payload.kind === 'console') {
    appendPreviewLog({
      kind: 'console',
      level: payload.level,
      text: payload.text || ''
    })
    return
  }

  if (payload.kind === 'error') {
    appendPreviewLog({
      kind: 'error',
      text: payload.text || 'Unknown sandbox error'
    })
  }
}

const openActionsMenu = (event: MouseEvent) => {
  const options: MenuItem[] = [
    {
      label: '新建文件',
      icon: AddIcon,
      onClick: () => createFile()
    },
    {
      label: '下载文件',
      icon: DownloadIcon,
      disabled: !activeFile.value,
      onClick: () => downloadCurrentFile()
    },
    {
      label: '保存应用',
      icon: BoxIcon,
      disabled: !hasCanvasFiles.value,
      onClick: () => openSaveAppModal()
    },
    {
      label: '删除文件',
      icon: TrashIcon,
      danger: true,
      disabled: !activeFile.value,
      onClick: () => deleteCurrentFile()
    },
    {
      type: 'divider'
    },
    {
      label: '重置',
      onClick: () => clearCanvas()
    }
  ]

  showContextMenu(event, options)
}

watch(currentChatId, () => {
  previewLogs.value = []
  hideContextMenu()
})

watch(sandboxTreeWidth, (value) => {
  localStorage.setItem(SANDBOX_TREE_WIDTH_KEY, String(Math.round(value)))
})
</script>

<template>
  <div class="canvas-panel">
    <div class="canvas-panel-header">
      <div class="canvas-panel-left">
        <div class="canvas-tabs">
          <Tabs v-model="settingsStore.display.canvasEditorTab" :items="canvasTabs" size="sm" />
        </div>
      </div>
      <div class="canvas-panel-actions">
        <Button size="sm" variant="secondary" :disabled="!hasCanvasFiles" @click="openSaveAppModal">
          <template #icon>
            <BoxIcon />
          </template>
          保存应用
        </Button>
        <Button size="sm" variant="icon" title="Sandbox 操作" @click="openActionsMenu">
          <template #icon>
            <SettingsIcon />
          </template>
        </Button>
      </div>
    </div>

    <div class="sandbox-workspace">
      <ResizeBox
        v-model:width="sandboxTreeWidth"
        v-model:is-collapsed="sandboxTreeCollapsed"
        :min-size="140"
        :max-size="360"
        class="sandbox-sidebar-resize"
      >
        <aside class="sandbox-sidebar">
          <div v-if="sandboxTreeRows.length === 0" class="sandbox-sidebar-empty">
            还没有文件。你可以手动新建，或让 AI 通过 sandbox 工具创建。
          </div>
          <div v-else class="sandbox-tree">
            <button
              v-for="row in sandboxTreeRows"
              :key="row.id"
              type="button"
              class="sandbox-tree-row"
              :class="{ active: row.type === 'file' && row.path === activeFilePath, directory: row.type === 'directory' }"
              :style="{ paddingLeft: `${12 + row.depth * 16}px` }"
              @click="row.type === 'file' && (activeFilePath = row.path)"
            >
              <span class="sandbox-tree-label">{{ row.type === 'directory' ? `[DIR] ${row.name}` : row.name }}</span>
            </button>
          </div>
        </aside>
      </ResizeBox>

      <div class="sandbox-main">
        <div v-if="settingsStore.display.canvasEditorTab === 'preview'" class="canvas-preview">
          <div class="canvas-panel-surface canvas-preview-frame">
            <div class="canvas-surface-header">
              <span class="canvas-surface-title">PREVIEW</span>
              <span class="canvas-surface-meta">/index.html</span>
            </div>
            <HtmlPreview :srcdoc="previewDocument" :channel-id="previewChannelId" @sandbox-event="handleSandboxEvent" />
          </div>
          <div class="canvas-panel-surface sandbox-logs">
            <div class="canvas-surface-header">
              <span class="canvas-surface-title">TERMINAL</span>
              <span class="canvas-surface-meta">Sandbox runtime</span>
            </div>
            <div v-if="previewLogs.length === 0" class="sandbox-logs-empty">等待预览输出...</div>
            <div v-else class="sandbox-log-list">
              <div
                v-for="item in previewLogs"
                :key="item.id"
                class="sandbox-log-item"
                :class="[`kind-${item.kind}`, item.level ? `level-${item.level}` : '']"
              >
                {{ item.text }}
              </div>
            </div>
          </div>
        </div>

        <div v-else class="canvas-code">
          <template v-if="activeFile">
            <div class="canvas-panel-surface canvas-code-editor-shell">
              <div class="canvas-code-toolbar">
                <span class="canvas-code-file">{{ activeFilePath }}</span>
                <span class="canvas-code-lang">{{ activeLanguage }}</span>
              </div>
              <div class="canvas-code-editor">
                <pre ref="codeHighlightRef" class="canvas-code-highlight" v-html="highlightedCode"></pre>
                <textarea
                  ref="codeEditorRef"
                  v-model="activeFileContent"
                  class="canvas-code-input"
                  rows="20"
                  spellcheck="false"
                  placeholder="在这里编辑当前文件内容，AI 也可以通过 sandbox 工具读写这些文件。"
                  @scroll="syncCodeScroll"
                />
              </div>
            </div>
          </template>
          <div v-else class="canvas-empty-state">
            当前没有选中文件。请先在左侧选择文件，或新建一个文件。
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.canvas-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.canvas-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 4px;
}

.canvas-panel-left {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.canvas-panel-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.canvas-panel-meta strong {
  font-size: 13px;
  color: var(--text-primary);
}

.canvas-panel-meta span {
  font-size: 12px;
  color: var(--text-tertiary);
}

.canvas-panel-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.canvas-tabs {
  flex-shrink: 0;
  width: fit-content;
}

.sandbox-workspace {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0;
}

.sandbox-sidebar-resize {
  height: 100%;
  min-height: 0;
}

.sandbox-main {
  min-width: 0;
  min-height: 0;
  height: 100%;
  margin-left: 4px;
  display: flex;
  flex-direction: column;
}

.sandbox-sidebar {
  width: 100%;
  height: 100%;
  min-height: 0;
  background: transparent;
  display: flex;
  flex-direction: column;
  padding-right: 8px;
  margin-right: 12px;
}

.sandbox-sidebar-empty {
  padding: 6px 8px;
  color: var(--text-tertiary);
  font-size: 11px;
  line-height: 1.6;
}

.sandbox-tree {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 2px 0;
}

.sandbox-tree-row {
  width: 100%;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  text-align: left;
  padding-top: 3px;
  padding-bottom: 3px;
  cursor: pointer;
  font-size: 11px;
  line-height: 1.35;
  border-radius: 0;
}

.sandbox-tree-row.directory {
  color: var(--text-tertiary);
  cursor: default;
}

.sandbox-tree-row.active {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-primary);
}

.sandbox-tree-label {
  display: inline-block;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: middle;
}

.canvas-preview,
.canvas-code {
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  flex: 1;
}

.canvas-preview {
  gap: 8px;
}

.canvas-panel-surface {
  min-height: 0;
  height: 100%;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(var(--text-rgb), 0.08);
  border-radius: 0;
  overflow: hidden;
}

.canvas-surface-header {
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 10px;
  border-bottom: 1px solid rgba(var(--text-rgb), 0.08);
  background: rgba(255, 255, 255, 0.02);
  font-size: 11px;
}

.canvas-surface-title {
  color: var(--text-secondary);
  letter-spacing: 0.04em;
  font-weight: 600;
}

.canvas-surface-meta {
  color: var(--text-tertiary);
  font-family: Menlo, Monaco, "Courier New", monospace;
  font-size: 10px;
}

.canvas-preview-frame {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.canvas-preview-frame :deep(.preview-wrapper),
.canvas-preview-frame :deep(iframe) {
  flex: 1;
  min-height: 0;
  background: #1e1e1e;
}

.sandbox-logs {
  background: #181818;
  min-height: 140px;
  max-height: 140px;
  display: flex;
  flex-direction: column;
}

.sandbox-logs-empty,
.sandbox-log-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 10px 12px 12px;
  font-family: Menlo, Monaco, "Courier New", monospace;
  font-size: 11px;
  line-height: 1.55;
}

.sandbox-logs-empty {
  color: var(--text-tertiary);
}

.sandbox-log-item {
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}

.sandbox-log-item + .sandbox-log-item {
  margin-top: 8px;
}

.sandbox-log-item.kind-error,
.sandbox-log-item.level-error {
  color: var(--color-danger);
}

.sandbox-log-item.level-warn {
  color: #d97706;
}

.sandbox-log-item.kind-ready {
  color: #0f766e;
}

.canvas-code-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  height: 30px;
  padding: 0 10px;
  font-size: 11px;
  border-bottom: 1px solid rgba(var(--text-rgb), 0.08);
  background: rgba(255, 255, 255, 0.02);
}

.canvas-empty-state {
  display: grid;
  place-items: center;
  flex: 1;
  border: 1px dashed rgba(var(--text-rgb), 0.1);
  border-radius: 0;
  color: var(--text-tertiary);
  text-align: center;
  padding: 24px;
  background: rgba(255, 255, 255, 0.02);
}

.canvas-code-file {
  color: var(--text-primary);
  font-weight: 600;
}

.canvas-code-lang {
  color: var(--text-tertiary);
  text-transform: uppercase;
}

.canvas-code-input {
  height: 100%;
  font-family: Menlo, Monaco, "Courier New", monospace;
  line-height: 1.6;
  resize: none;
}

.canvas-code-editor-shell {
  flex: 1;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.canvas-code-editor {
  position: relative;
  flex: 1;
  overflow: hidden;
  background: #1e1e1e;
  color: #d4d4d4;
}

.canvas-code-highlight,
.canvas-code-input {
  position: absolute;
  inset: 0;
  margin: 0;
  padding: 12px 14px;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre;
  overflow: auto;
}

.canvas-code-highlight {
  pointer-events: none;
  z-index: 1;
  color: #d4d4d4;
}

.canvas-code-input {
  z-index: 2;
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  color: transparent;
  caret-color: #d4d4d4;
}

.canvas-code-input::selection {
  background: rgba(38, 79, 120, 0.85);
}

.canvas-code-input::placeholder {
  color: var(--text-placeholder);
}

.canvas-code-highlight :deep(code),
.canvas-code-highlight :deep(.hljs) {
  display: block;
  min-height: 100%;
  background: transparent;
  color: #d4d4d4;
  font-family: inherit;
}

:global(.dark) .canvas-code-highlight :deep(.hljs) {
  background: #1e1e1e;
  color: #d4d4d4;
}

:global(.light) .canvas-code-highlight :deep(.hljs) {
  background: #1e1e1e;
  color: #d4d4d4;
}

:global(.light) .canvas-code-input {
  caret-color: #d4d4d4;
}

:global(.light) .canvas-code-input::placeholder {
  color: rgba(212, 212, 212, 0.45);
}

.canvas-code-highlight :deep(.hljs-selector-tag),
.canvas-code-highlight :deep(.hljs-selector-class),
.canvas-code-highlight :deep(.hljs-selector-id),
.canvas-code-highlight :deep(.hljs-selector-pseudo) {
  color: #d7ba7d;
}

.canvas-code-highlight :deep(.hljs-attribute),
.canvas-code-highlight :deep(.hljs-name),
.canvas-code-highlight :deep(.hljs-tag) {
  color: #9cdcfe;
}

.canvas-code-highlight :deep(.hljs-string),
.canvas-code-highlight :deep(.hljs-meta-string),
.canvas-code-highlight :deep(.hljs-regexp) {
  color: #ce9178;
}

.canvas-code-highlight :deep(.hljs-number),
.canvas-code-highlight :deep(.hljs-literal) {
  color: #b5cea8;
}

.canvas-code-highlight :deep(.hljs-keyword),
.canvas-code-highlight :deep(.hljs-built_in) {
  color: #569cd6;
}

.canvas-code-highlight :deep(.hljs-comment),
.canvas-code-highlight :deep(.hljs-quote) {
  color: #6a9955;
}
</style>
