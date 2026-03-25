<script setup lang="ts">
import AppImage from './Image.vue'
import HtmlPreview from './HtmlPreview.vue'
import SandboxCodeEditor from './SandboxCodeEditor.vue'
import Tabs from './Tabs.vue'
import JSZip from 'jszip'
import { useLocalStorage } from '@renderer/composables/vueuse'
import {
  buildSandboxPreviewDocument,
  buildSandboxTree,
  getSandboxFileLanguage,
  isSandboxImageFile,
  parseSandboxDataUrl,
  normalizeSandboxPath,
  sortSandboxFiles
} from '@renderer/services/sandbox'

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
  hasChildren: boolean
  isExpanded: boolean
}

const chatsStore = useChatsStores()
const settingsStore = useSettingsStore()
const canvasStore = useCanvasStore()
const myAppsStore = useMyAppsStore()
const message = messageApi
const modal = useModal()
const {
  Download: DownloadIcon,
  FileZip: FileZipIcon,
  Plus: AddIcon,
  Trash: TrashIcon,
  Edit: EditIcon,
  Settings: SettingsIcon,
  Box: BoxIcon,
  Terminal: TerminalIcon
} = useIcon([
  'Download',
  'FileZip',
  'Plus',
  'Trash',
  'Edit',
  'Settings',
  'Box',
  'Terminal'
])
const { showContextMenu, hideContextMenu } = useContextMenu<TreeRow>()

const canvasTabs = [
  { id: 'preview', name: '预览' },
  { id: 'code', name: '代码' }
]
const SANDBOX_TREE_WIDTH_KEY = 'sandbox-tree-width'
const SANDBOX_LOGS_HEIGHT_KEY = 'sandbox-logs-height'
const sandboxTreeWidth = useLocalStorage<number>(SANDBOX_TREE_WIDTH_KEY, 180)
const sandboxTreeCollapsed = ref(false)
const sandboxLogsHeight = useLocalStorage<number>(SANDBOX_LOGS_HEIGHT_KEY, 140)
const sandboxLogsCollapsed = ref(false)
const expandedDirectoryPaths = ref<string[]>([])

const currentChatId = computed(() => chatsStore.currentChat?.id)
const currentCanvas = computed(() => canvasStore.getCanvas(currentChatId.value))
const sandboxTreeNodes = computed(() => buildSandboxTree(currentCanvas.value))
const expandedDirectoryPathSet = computed(() => new Set(expandedDirectoryPaths.value))
const sandboxTreeRows = computed<TreeRow[]>(() => {
  const rows: TreeRow[] = []
  const walk = (nodes: ReturnType<typeof buildSandboxTree>, depth = 0) => {
    for (const node of nodes) {
      const hasChildren = Boolean(node.children?.length)
      const isExpanded = node.type === 'directory' && expandedDirectoryPathSet.value.has(node.path)

      rows.push({
        id: node.id,
        name: node.name,
        path: node.path,
        type: node.type,
        depth,
        hasChildren,
        isExpanded
      })
      if (hasChildren && isExpanded) {
        walk(node.children || [], depth + 1)
      }
    }
  }
  walk(sandboxTreeNodes.value)
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
const isActiveImageFile = computed(() => isSandboxImageFile(activeFile.value))
const hasCanvasFiles = computed(() => sandboxTreeRows.value.some((row) => row.type === 'file'))
const suggestedAppName = computed(() => {
  const title = String(chatsStore.currentChat?.title || '').trim()
  return title || '未命名应用'
})

const sanitizeDownloadName = (value: string) => {
  const normalized = String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '')

  return normalized || 'untitled-app'
}

const previewChannelId = computed(() => `sandbox-preview:${currentChatId.value || 'default'}`)
const previewDocument = computed(() => buildSandboxPreviewDocument(currentCanvas.value, previewChannelId.value))
const previewLogs = ref<PreviewLogItem[]>([])
const isSandboxRuntimeVisible = computed(
  () => settingsStore.display.canvasEditorTab === 'preview' && !sandboxLogsCollapsed.value
)

const toggleSandboxRuntime = () => {
  if (isSandboxRuntimeVisible.value) {
    sandboxLogsCollapsed.value = true
    return
  }

  settingsStore.display.canvasEditorTab = 'preview'
  sandboxLogsCollapsed.value = false

  if (sandboxLogsHeight.value < 120) {
    sandboxLogsHeight.value = 140
  }
}

const getAncestorDirectoryPaths = (path?: string) => {
  if (!path) return []
  const parts = path.split('/').filter(Boolean)
  const ancestors: string[] = []
  let current = ''

  parts.slice(0, -1).forEach((part) => {
    current += `/${part}`
    ancestors.push(current)
  })

  return ancestors
}

const toggleDirectory = (path: string) => {
  const next = new Set(expandedDirectoryPaths.value)
  if (next.has(path)) {
    next.delete(path)
  } else {
    next.add(path)
  }
  expandedDirectoryPaths.value = [...next]
}

const handleTreeRowClick = (row: TreeRow) => {
  if (row.type === 'directory') {
    if (row.hasChildren) {
      toggleDirectory(row.path)
    }
    return
  }
  activeFilePath.value = row.path
}

const getFileExtensionLabel = (fileName: string) => {
  const extension = fileName.split('.').pop()?.trim().toUpperCase()
  return extension && extension !== fileName.toUpperCase() ? extension.slice(0, 4) : 'TXT'
}

const getParentPath = (path: string) => {
  const normalizedPath = normalizeSandboxPath(path)
  const segments = normalizedPath.split('/').filter(Boolean)
  if (segments.length <= 1) return ''
  return `/${segments.slice(0, -1).join('/')}`
}

const buildSiblingPath = (path: string, nextName: string) => {
  const parentPath = getParentPath(path)
  const trimmedName = String(nextName || '').trim().replaceAll('\\', '/')
  if (!trimmedName || trimmedName.includes('/')) {
    throw new Error('名称不能为空，且不能包含 / 或 \\')
  }
  return normalizeSandboxPath(parentPath ? `${parentPath}/${trimmedName}` : `/${trimmedName}`)
}

const getRowFilePaths = (row: TreeRow) => {
  if (row.type === 'file') return [row.path]
  const prefix = `${row.path}/`
  return Object.keys(currentCanvas.value.files).filter((path) => path.startsWith(prefix))
}

const renameTreeRow = (row: TreeRow) => {
  const [FormComponent, formActions] = useForm({
    fields: [
      {
        name: 'name',
        label: '名称',
        type: 'text',
        placeholder: row.type === 'directory' ? '例如 components' : '例如 index.html',
        required: true
      }
    ],
    initialData: {
      name: row.name
    },
    onSubmit: (data) => {
      try {
        const nextBasePath = buildSiblingPath(row.path, String(data.name || ''))
        if (nextBasePath === row.path) {
          modal.remove()
          return
        }

        const filePaths = getRowFilePaths(row)
        if (filePaths.length === 0) {
          throw new Error(row.type === 'directory' ? '当前目录下没有可重命名的文件' : '文件不存在')
        }

        const renamePlan = filePaths.map((sourcePath) => ({
          sourcePath,
          targetPath: row.type === 'directory'
            ? normalizeSandboxPath(`${nextBasePath}${sourcePath.slice(row.path.length)}`)
            : nextBasePath
        }))

        const occupiedPaths = new Set(Object.keys(currentCanvas.value.files))
        const movingPaths = new Set(renamePlan.map((item) => item.sourcePath))
        for (const item of renamePlan) {
          if (occupiedPaths.has(item.targetPath) && !movingPaths.has(item.targetPath)) {
            throw new Error(`目标已存在：${item.targetPath}`)
          }
        }

        renamePlan.forEach(({ sourcePath, targetPath }) => {
          canvasStore.applyOperation(
            {
              type: 'move',
              filePath: sourcePath,
              targetPath
            },
            currentChatId.value
          )
        })

        message.success(row.type === 'directory' ? `已重命名目录为 ${nextBasePath}` : `已重命名文件为 ${nextBasePath}`)
        modal.remove()
      } catch (error) {
        message.error((error as Error).message)
      }
    }
  })

  modal.confirm({
    title: row.type === 'directory' ? '重命名目录' : '重命名文件',
    content: FormComponent,
    confirmText: '确定',
    cancelText: '取消',
    onOk: () => {
      formActions.submit()
    }
  })
}

const deleteTreeRow = async (row: TreeRow) => {
  const filePaths = getRowFilePaths(row)
  if (filePaths.length === 0) {
    message.warning(row.type === 'directory' ? '当前目录下没有可删除的文件' : '文件不存在')
    return
  }

  const confirmed = await modal.confirm({
    title: row.type === 'directory' ? '删除目录' : '删除文件',
    content: row.type === 'directory'
      ? `确定删除 ${row.path} 及其下 ${filePaths.length} 个文件吗？`
      : `确定删除 ${row.path} 吗？`,
    confirmProps: {
      danger: true
    },
    confirmText: '删除',
    cancelText: '取消'
  })
  if (!confirmed) return

  try {
    filePaths.forEach((filePath) => {
      canvasStore.applyOperation(
        {
          type: 'delete',
          filePath
        },
        currentChatId.value
      )
    })
    message.success(row.type === 'directory' ? `已删除目录 ${row.path}` : `已删除文件 ${row.path}`)
  } catch (error) {
    message.error((error as Error).message)
  }
}

const openTreeRowMenu = (event: MouseEvent, row: TreeRow) => {
  if (row.type === 'file') {
    activeFilePath.value = row.path
  }

  const options: MenuItem<TreeRow>[] = [
    {
      label: row.type === 'directory' ? '重命名目录' : '重命名',
      icon: EditIcon,
      onClick: (targetRow) => renameTreeRow(targetRow)
    },
    ...(row.type === 'file'
      ? [{
        label: '下载文件',
        icon: DownloadIcon,
        onClick: (targetRow: TreeRow) => downloadCurrentFile(targetRow.path)
      }]
      : []),
    {
      label: row.type === 'directory' ? '删除目录' : '删除',
      icon: TrashIcon,
      danger: true,
      onClick: (targetRow) => {
        void deleteTreeRow(targetRow)
      }
    }
  ]

  showContextMenu(event, options, row)
}

const downloadCurrentFile = (filePath = activeFilePath.value) => {
  const file = filePath ? currentCanvas.value.files[filePath] : null
  if (!file) {
    message.warning('当前没有可下载文件')
    return
  }

  try {
    const parsedDataUrl = file.encoding === 'data-url' ? parseSandboxDataUrl(file.content) : null
    const blob = parsedDataUrl
      ? (() => {
        const binary = atob(parsedDataUrl.base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i += 1) {
          bytes[i] = binary.charCodeAt(i)
        }
        return new Blob([bytes], { type: parsedDataUrl.mediaType || file.mediaType || 'application/octet-stream' })
      })()
      : new Blob([file.content], { type: `${file.mediaType || 'text/plain'};charset=utf-8` })
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

const downloadAppAsZip = async () => {
  if (!hasCanvasFiles.value) {
    message.warning('当前画布还没有文件，先生成或创建内容后再下载应用')
    return
  }

  try {
    const zip = new JSZip()

    sortSandboxFiles(currentCanvas.value).forEach((file) => {
      const zipPath = file.path.replace(/^\/+/, '')
      const parsedDataUrl = file.encoding === 'data-url' ? parseSandboxDataUrl(file.content) : null

      if (parsedDataUrl) {
        zip.file(zipPath, parsedDataUrl.base64, { base64: true })
        return
      }

      zip.file(zipPath, file.content)
    })

    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const fileName = `${sanitizeDownloadName(suggestedAppName.value)}.zip`

    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    message.success(`已开始下载应用：${fileName}`)
  } catch (error) {
    console.error('Sandbox app zip download error:', error)
    message.error('下载应用失败')
  }
}

const clearCanvas = () => {
  modal.confirm({
    title: '重置画布',
    content: '确定要清空当前画布吗？此操作无法撤销',
    confirmProps: {
      danger: true
    },
    confirmText: '清空',
    cancelText: '取消',
    onOk: () => {
      canvasStore.clearCanvas(currentChatId.value)
      previewLogs.value = []
      message.success('画布已清空')
      modal.remove()
    }
  })
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
  const options: MenuItem<TreeRow>[] = [
    {
      label: '新建文件',
      icon: AddIcon,
      onClick: () => createFile()
    },
    {
      label: '下载应用',
      icon: FileZipIcon,
      disabled: !hasCanvasFiles.value,
      onClick: () => {
        void downloadAppAsZip()
      }
    },
    {
      label: '保存应用',
      icon: BoxIcon,
      disabled: !hasCanvasFiles.value,
      onClick: () => openSaveAppModal()
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

watch(
  [sandboxTreeNodes, activeFilePath],
  ([nodes, currentActiveFilePath]) => {
    const availableDirectoryPaths = new Set<string>()

    const visit = (treeNodes: ReturnType<typeof buildSandboxTree>) => {
      for (const node of treeNodes) {
        if (node.type === 'directory') {
          availableDirectoryPaths.add(node.path)
          if (node.children?.length) {
            visit(node.children)
          }
        }
      }
    }

    visit(nodes)

    const nextExpandedPaths = new Set(
      expandedDirectoryPaths.value.filter((path) => availableDirectoryPaths.has(path))
    )

    nodes.forEach((node) => {
      if (node.type === 'directory') {
        nextExpandedPaths.add(node.path)
      }
    })

    getAncestorDirectoryPaths(currentActiveFilePath).forEach((path) => {
      if (availableDirectoryPaths.has(path)) {
        nextExpandedPaths.add(path)
      }
    })

    expandedDirectoryPaths.value = [...nextExpandedPaths]
  },
  { immediate: true }
)
</script>

<template>
  <div class="canvas-panel">
    <div class="sandbox-workspace">
      <ResizeBox v-model:width="sandboxTreeWidth" v-model:is-collapsed="sandboxTreeCollapsed" :min-size="140"
        :max-size="360" class="sandbox-sidebar-resize">
        <aside class="sandbox-sidebar">
          <div class="sandbox-sidebar-header">
            <div class="canvas-tabs">
              <Tabs v-model="settingsStore.display.canvasEditorTab" :items="canvasTabs" size="sm" />
            </div>
            <div class="sandbox-sidebar-tools">
              <button
                type="button"
                class="sandbox-sidebar-tool"
                :class="{ active: isSandboxRuntimeVisible }"
                :title="isSandboxRuntimeVisible ? '隐藏 Sandbox runtime' : '显示 Sandbox runtime'"
                @click="toggleSandboxRuntime"
              >
                <TerminalIcon />
              </button>
              <button type="button" class="sandbox-sidebar-tool" title="更多操作" @click="openActionsMenu">
                <SettingsIcon />
              </button>
            </div>
          </div>
          <div class="sandbox-explorer-group">
            <div class="sandbox-explorer-group-header">
              <span class="sandbox-explorer-group-title">SANDBOX</span>
              <span class="sandbox-explorer-group-subtitle">{{ suggestedAppName }}</span>
            </div>
            <div class="sandbox-tree">
              <button v-for="row in sandboxTreeRows" :key="row.id" type="button" class="sandbox-tree-row" :class="{
                active: row.type === 'file' && row.path === activeFilePath,
                directory: row.type === 'directory'
              }" :style="{ paddingLeft: `${8 + row.depth * 14}px` }" @click="handleTreeRowClick(row)"
                @contextmenu="openTreeRowMenu($event, row)">
                <span class="sandbox-tree-chevron">
                  {{ row.type === 'directory' && row.hasChildren ? (row.isExpanded ? '▾' : '▸') : '' }}
                </span>
                <span class="sandbox-tree-file-icon" :class="[`type-${row.type}`]">
                  <span class="sandbox-tree-file-glyph"></span>
                </span>
                <span class="sandbox-tree-label">{{ row.name }}</span>
                <span v-if="row.type === 'file'" class="sandbox-tree-badge">
                  {{ getFileExtensionLabel(row.name) }}
                </span>
              </button>
            </div>
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
          <ResizeBox
            v-model:height="sandboxLogsHeight"
            v-model:is-collapsed="sandboxLogsCollapsed"
            direction="vertical"
            handle-position="top"
            :min-size="120"
            :max-size="360"
            class="sandbox-logs-resize"
          >
            <div class="canvas-panel-surface sandbox-logs">
              <div class="canvas-surface-header">
                <span class="canvas-surface-title">TERMINAL</span>
                <span class="canvas-surface-meta">Sandbox runtime</span>
              </div>
              <div v-if="previewLogs.length === 0" class="sandbox-logs-empty">等待预览输出...</div>
              <div v-else class="sandbox-log-list">
                <div v-for="item in previewLogs" :key="item.id" class="sandbox-log-item"
                  :class="[`kind-${item.kind}`, item.level ? `level-${item.level}` : '']">
                  {{ item.text }}
                </div>
              </div>
            </div>
          </ResizeBox>
        </div>

        <div v-else class="canvas-code">
          <template v-if="activeFile">
            <div class="canvas-panel-surface canvas-code-editor-shell">
              <div class="canvas-code-toolbar">
                <span class="canvas-code-file">{{ activeFilePath }}</span>
                <span class="canvas-code-lang">{{ activeLanguage }}</span>
              </div>
              <div v-if="isActiveImageFile" class="canvas-image-preview">
                <AppImage :src="activeFile.content" preview class="canvas-image-preview-media" />
              </div>
              <div v-else class="canvas-code-editor">
                <SandboxCodeEditor v-model="activeFileContent" :path="activeFilePath" :language="activeLanguage" />
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
}

.canvas-panel-header {
  display: none;
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

.canvas-tabs :deep(.tabs-container) {
  border-radius: 6px;
  padding: 1px;
  gap: 1px;
}

.canvas-tabs :deep(.tabs-sm .tab-item) {
  padding: 1px 6px;
  font-size: 10px;
  line-height: 1.4;
  border-radius: 4px;
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
  background: var(--sandbox-sidebar-bg);
  display: flex;
  flex-direction: column;
}

.sandbox-sidebar-empty {
  padding: 10px 12px;
  color: var(--text-tertiary);
  font-size: 11px;
  line-height: 1.6;
}

.sandbox-sidebar-header {
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 0 4px;
  border-bottom: 1px solid var(--sandbox-sidebar-border);
}

.sandbox-sidebar-title-group {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.sandbox-sidebar-title {
  color: rgba(255, 255, 255, 0.92);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.sandbox-sidebar-meta {
  color: rgba(255, 255, 255, 0.36);
  font-size: 9px;
  letter-spacing: 0.08em;
}

.sandbox-sidebar-tools {
  display: flex;
  align-items: center;
  gap: 0;
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
  border-radius: 2px;
}

.sandbox-sidebar-tool:disabled {
  opacity: 0.4;
  cursor: default;
}

.sandbox-sidebar-tool:hover {
  background: var(--sandbox-tool-hover);
  color: var(--sandbox-sidebar-text);
}

.sandbox-sidebar-tool.active {
  background: var(--sandbox-tool-active);
  color: var(--sandbox-sidebar-text);
}

.sandbox-sidebar-tool :deep(svg) {
  width: 11px;
  height: 11px;
}

.sandbox-explorer-group {
  min-height: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
}

.sandbox-explorer-group-header {
  min-height: 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 12px;
  color: var(--sandbox-sidebar-muted);
  font-size: 10px;
  letter-spacing: 0.06em;
}

.sandbox-explorer-group-title {
  font-weight: 700;
}

.sandbox-explorer-group-subtitle {
  min-width: 0;
  font-size: 9px;
  color: var(--sandbox-sidebar-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sandbox-tree {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0 0 8px;
}

.sandbox-tree-row {
  width: 100%;
  border: none;
  background: transparent;
  color: var(--sandbox-sidebar-muted);
  text-align: left;
  padding-top: 0;
  padding-bottom: 0;
  padding-right: 8px;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  border-radius: 0;
  min-height: 22px;
  display: flex;
  align-items: center;
  gap: 4px;
  position: relative;
}

.sandbox-tree-row.directory {
  color: var(--sandbox-sidebar-text);
}

.sandbox-tree-row.active {
  background: var(--sandbox-tree-active-bg);
  color: var(--sandbox-tree-active-text);
}

.sandbox-tree-row:hover {
  background: var(--sandbox-tree-hover);
}

.sandbox-tree-row.active:hover {
  background: var(--sandbox-tree-active-bg-hover);
}

.sandbox-tree-chevron {
  width: 14px;
  height: 14px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: var(--sandbox-sidebar-faint);
}

.sandbox-tree-chevron :deep(svg) {
  width: 12px;
  height: 12px;
}

.sandbox-tree-file-icon {
  width: 16px;
  height: 16px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.sandbox-tree-file-glyph {
  display: block;
  width: 12px;
  height: 14px;
  position: relative;
  border-radius: 2px;
}

.sandbox-tree-file-icon.type-directory .sandbox-tree-file-glyph {
  width: 13px;
  height: 10px;
  margin-top: 1px;
  border-radius: 2px 2px 2px 2px;
  background: #dcb67a;
}

.sandbox-tree-file-icon.type-directory .sandbox-tree-file-glyph::before {
  content: '';
  position: absolute;
  left: 0;
  top: -3px;
  width: 7px;
  height: 4px;
  border-radius: 2px 2px 0 0;
  background: #c89d58;
}

.sandbox-tree-file-icon.type-file .sandbox-tree-file-glyph {
  background: linear-gradient(180deg, #89c7ff 0%, #5aa9ff 100%);
  clip-path: polygon(0 0, 78% 0, 100% 22%, 100% 100%, 0 100%);
}

.sandbox-tree-file-icon.type-file .sandbox-tree-file-glyph::before {
  content: '';
  position: absolute;
  right: 0;
  top: 0;
  width: 4px;
  height: 4px;
  background: rgba(255, 255, 255, 0.55);
  clip-path: polygon(0 0, 100% 100%, 100% 0);
}

.sandbox-tree-label {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sandbox-tree-badge {
  flex-shrink: 0;
  color: var(--sandbox-sidebar-faint);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.sandbox-tree-row.active .sandbox-tree-badge {
  color: color-mix(in srgb, var(--sandbox-tree-active-text) 72%, transparent);
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
  background: var(--sandbox-surface-bg);
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
  background: var(--sandbox-surface-header-bg);
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

.canvas-image-preview {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background:
    linear-gradient(45deg, rgba(var(--text-rgb), 0.04) 25%, transparent 25%, transparent 75%, rgba(var(--text-rgb), 0.04) 75%),
    linear-gradient(45deg, rgba(var(--text-rgb), 0.04) 25%, transparent 25%, transparent 75%, rgba(var(--text-rgb), 0.04) 75%);
  background-position: 0 0, 12px 12px;
  background-size: 24px 24px;
}

.canvas-image-preview-media {
  width: 100%;
  height: 100%;
}

.canvas-image-preview-media :deep(img) {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.canvas-preview-frame :deep(.preview-wrapper),
.canvas-preview-frame :deep(iframe) {
  flex: 1;
  min-height: 0;
  background: var(--sandbox-preview-bg);
}

.sandbox-logs {
  background: var(--sandbox-log-bg);
  height: 100%;
  min-height: 0;
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
  color: var(--sandbox-log-text);
  white-space: pre-wrap;
  word-break: break-word;
}

.sandbox-log-item+.sandbox-log-item {
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
  color: var(--sandbox-log-ready);
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
  --sandbox-tree-active-text: #ffffff;
  --sandbox-surface-bg: rgba(255, 255, 255, 0.02);
  --sandbox-surface-header-bg: rgba(255, 255, 255, 0.02);
  --sandbox-preview-bg: #1e1e1e;
  --sandbox-log-bg: #181818;
  --sandbox-log-text: var(--text-secondary);
  --sandbox-log-ready: #0f766e;
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

.canvas-code-editor-shell {
  flex: 1;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.canvas-code-editor {
  flex: 1;
  overflow: hidden;
  background: #1e1e1e;
  color: #d4d4d4;
}
</style>
