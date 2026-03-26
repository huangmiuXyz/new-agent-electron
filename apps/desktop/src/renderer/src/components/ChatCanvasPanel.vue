<script setup lang="ts">
import { useVirtualList } from '@vueuse/core'
import AppImage from './Image.vue'
import HtmlPreview from './HtmlPreview.vue'
import SandboxCodeEditor from './SandboxCodeEditor.vue'
import Tabs from './Tabs.vue'
import JSZip from 'jszip'
import { useLocalStorage } from '@renderer/composables/vueuse'
import {
  buildSandboxPreviewDocument,
  getSandboxFileLanguage,
  isSandboxImageFile,
  parseSandboxDataUrl,
  normalizeSandboxPath,
  sortSandboxFiles,
  type SandboxFile,
  type SandboxWorkspaceEntry
} from '@renderer/services/sandbox'
import { blobToDataURL } from 'blob-util'
import { isTextFile } from '@renderer/utils'

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
const { createTab } = useTerminal()
const {
  Download: DownloadIcon,
  FileZip: FileZipIcon,
  Plus: AddIcon,
  Folder: FolderIcon,
  Refresh: RefreshIcon,
  Trash: TrashIcon,
  Edit: EditIcon,
  Settings: SettingsIcon,
  Box: BoxIcon,
  Terminal: TerminalIcon
} = useIcon([
  'Download',
  'FileZip',
  'Plus',
  'Folder',
  'Refresh',
  'Trash',
  'Edit',
  'Settings',
  'Box',
  'Terminal'
])
const { showContextMenu, hideContextMenu } = useContextMenu<TreeRow>()
const { showContextMenu: showTabContextMenu } = useContextMenu<{ filePath: string }>()

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
const isCanvasDragOver = ref(false)
const dragDepth = ref(0)
const draggingCanvasFilePath = ref('')
const dragTargetDirectoryPath = ref('')
const CANVAS_FILE_DRAG_MIME = 'application/x-agent-qi-canvas-file'

const currentChatId = computed(() => chatsStore.currentChat?.id)
const currentWorkspaceVersion = computed(() => canvasStore.getWorkspaceVersion(currentChatId.value))
const currentWorkspaceDir = computed(() => canvasStore.getWorkspaceDir(currentChatId.value))
const isUsingTempWorkspace = computed(() => {
  const chatId = currentChatId.value || 'default'
  return currentWorkspaceDir.value === window.api.path.join(window.api.getPath('temp'), 'agent-qi-canvas-exec', chatId)
})
const previewReady = ref(false)
const directoryEntries = ref<Record<string, SandboxWorkspaceEntry[]>>({})
const expandedDirectoryPathSet = computed(() => new Set(expandedDirectoryPaths.value))
const SANDBOX_TREE_ROW_HEIGHT = 22
const sandboxTreeRows = computed<TreeRow[]>(() => {
  const rows: TreeRow[] = []
  const walk = (directoryPath: string, depth = 0) => {
    const entries = directoryEntries.value[directoryPath] || []
    for (const entry of entries) {
      const isExpanded = entry.type === 'directory' && expandedDirectoryPathSet.value.has(entry.path)
      rows.push({
        id: entry.path,
        name: entry.name,
        path: entry.path,
        type: entry.type,
        depth,
        hasChildren: entry.hasChildren,
        isExpanded
      })
      if (entry.type === 'directory' && isExpanded) {
        walk(entry.path, depth + 1)
      }
    }
  }
  walk('/')
  return rows
})
const {
  list: virtualSandboxTreeRows,
  containerProps: sandboxTreeContainerProps,
  wrapperProps: sandboxTreeWrapperProps
} = useVirtualList(sandboxTreeRows, {
  itemHeight: SANDBOX_TREE_ROW_HEIGHT,
  overscan: 10
})

const availableDirectoryPathSet = computed(() => {
  const paths = new Set<string>()
  Object.entries(directoryEntries.value).forEach(([directoryPath, entries]) => {
    if (directoryPath !== '/') {
      paths.add(directoryPath)
    }
    entries.forEach((entry) => {
      if (entry.type === 'directory') {
        paths.add(entry.path)
      }
    })
  })
  return paths
})

const activeFilePath = computed({
  get: () => canvasStore.getActiveFilePath(currentChatId.value),
  set: (value: string) => canvasStore.setActiveFilePath(value, currentChatId.value)
})

const openFileTabs = ref<string[]>([])
const fileDrafts = ref<Record<string, string>>({})
const currentTabFilePath = computed(() => {
  const filePath = activeFilePath.value
  return filePath && openFileTabs.value.includes(filePath) ? filePath : ''
})
const activeFile = ref<SandboxFile | null>(null)

const ensureFileTabOpen = (filePath: string) => {
  if (!filePath) return
  if (!openFileTabs.value.includes(filePath)) {
    openFileTabs.value = [...openFileTabs.value, filePath]
  }
}

const hasDraftForFile = (filePath: string) => Object.prototype.hasOwnProperty.call(fileDrafts.value, filePath)

const getPersistedFile = (filePath: string) => {
  if (!filePath) return null
  if (activeFile.value?.path === filePath) {
    return activeFile.value
  }
  try {
    return canvasStore.readFile(filePath, currentChatId.value)
  } catch {
    return null
  }
}

const getDraftContent = (filePath: string) => {
  if (!filePath) return ''
  if (hasDraftForFile(filePath)) {
    return fileDrafts.value[filePath] || ''
  }
  return getPersistedFile(filePath)?.content || ''
}

const setDraftContent = (filePath: string, content: string) => {
  if (!filePath) return
  const fileContent = getPersistedFile(filePath)?.content || ''
  if (content === fileContent) {
    if (!hasDraftForFile(filePath)) return
    const nextDrafts = { ...fileDrafts.value }
    delete nextDrafts[filePath]
    fileDrafts.value = nextDrafts
    return
  }

  fileDrafts.value = {
    ...fileDrafts.value,
    [filePath]: content
  }
}

const activeFileContent = computed({
  get: () => getDraftContent(currentTabFilePath.value),
  set: (value: string) => {
    setDraftContent(currentTabFilePath.value, value)
  }
})

const isActiveFileDirty = computed(() => {
  const filePath = currentTabFilePath.value
  const file = filePath ? getPersistedFile(filePath) : null
  if (!filePath || !file) return false
  return getDraftContent(filePath) !== file.content
})

const activeLanguage = computed(() => getSandboxFileLanguage(currentTabFilePath.value || '/index.html'))
const isActiveImageFile = computed(() => isSandboxImageFile(currentTabFilePath.value ? activeFile.value : null))
const isActiveBinaryFile = computed(() => activeFile.value?.encoding === 'data-url' && !isActiveImageFile.value)
const hasCanvasFiles = computed(() => {
  currentWorkspaceVersion.value
  return canvasStore.hasAnyFiles(currentChatId.value)
})
const suggestedAppName = computed(() => {
  const title = String(chatsStore.currentChat?.title || '').trim()
  return title || '未命名应用'
})

const hasFileDrag = (event: DragEvent) => {
  return Array.from(event.dataTransfer?.types || []).includes('Files')
}

const hasCanvasFileDrag = (event: DragEvent) => {
  return Array.from(event.dataTransfer?.types || []).includes(CANVAS_FILE_DRAG_MIME)
}

const sanitizeDownloadName = (value: string) => {
  const normalized = String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '')

  return normalized || 'untitled-app'
}

const previewChannelId = computed(() => `sandbox-preview:${currentChatId.value || 'default'}`)
const previewDocument = computed(() => {
  if (!isUsingTempWorkspace.value) return ''
  if (settingsStore.display.canvasEditorTab !== 'preview' || !previewReady.value) return ''
  return buildSandboxPreviewDocument(canvasStore.getCanvas(currentChatId.value), previewChannelId.value)
})
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

watch(
  () => settingsStore.display.canvasEditorTab,
  (tab) => {
    if (tab === 'preview' && isUsingTempWorkspace.value) {
      previewReady.value = true
      return
    }

    previewReady.value = false
  },
  { immediate: true }
)

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

const expandDirectory = (path: string) => {
  const next = new Set(expandedDirectoryPaths.value)
  next.add(path)
  expandedDirectoryPaths.value = [...next]
}

const loadDirectory = (directoryPath = '/') => {
  directoryEntries.value = {
    ...directoryEntries.value,
    [directoryPath]: canvasStore.listDirectory(directoryPath, currentChatId.value)
  }
}

const handleTreeRowClick = (row: TreeRow) => {
  if (row.type === 'directory') {
    if (row.hasChildren) {
      loadDirectory(row.path)
      toggleDirectory(row.path)
    }
    return
  }
  ensureFileTabOpen(row.path)
  activeFilePath.value = row.path
}

const getFileExtensionLabel = (fileName: string) => {
  const extension = fileName.split('.').pop()?.trim().toUpperCase()
  return extension && extension !== fileName.toUpperCase() ? extension.slice(0, 4) : 'TXT'
}

const getBaseNameFromPath = (path: string) => path.split('/').filter(Boolean).pop() || path || 'untitled'

const getParentPath = (path: string) => {
  const normalizedPath = normalizeSandboxPath(path)
  const segments = normalizedPath.split('/').filter(Boolean)
  if (segments.length <= 1) return ''
  return `/${segments.slice(0, -1).join('/')}`
}

const getBaseName = (path: string) => {
  return normalizeSandboxPath(path).split('/').filter(Boolean).pop() || ''
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
  return canvasStore.collectFilePaths(row.path, currentChatId.value)
}

const downloadDirectoryAsZip = async (row: TreeRow) => {
  if (row.type !== 'directory') return

  const filePaths = getRowFilePaths(row)
  if (filePaths.length === 0) {
    message.warning('当前目录下没有可下载的文件')
    return
  }

  try {
    const zip = new JSZip()

    filePaths.forEach((filePath) => {
      const file = getPersistedFile(filePath)
      if (!file) return

      const zipPath = filePath.slice(row.path.length + 1)
      if (!zipPath) return

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
    const fileName = `${sanitizeDownloadName(row.name)}.zip`

    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    message.success(`已开始下载目录：${row.path}`)
  } catch (error) {
    console.error('Sandbox directory zip download error:', error)
    message.error('下载目录失败')
  }
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

        const occupiedPaths = new Set(canvasStore.collectFilePaths('/', currentChatId.value))
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
      : [{
        label: '下载目录',
        icon: DownloadIcon,
        onClick: (targetRow: TreeRow) => {
          void downloadDirectoryAsZip(targetRow)
        }
      }]),
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
  const file = filePath ? getPersistedFile(filePath) : null
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

const saveActiveFile = () => {
  const filePath = currentTabFilePath.value
  if (!filePath || !activeFile.value) return
  if (!isActiveFileDirty.value) return

  canvasStore.updateFileContent(filePath, getDraftContent(filePath), currentChatId.value)
  message.success(`已保存 ${filePath}`)
}

const saveDraftForFile = (filePath: string) => {
  const currentFile = getPersistedFile(filePath)
  if (!currentFile) return
  const draftContent = getDraftContent(filePath)
  if (draftContent === currentFile.content) return
  canvasStore.updateFileContent(filePath, draftContent, currentChatId.value)
}

const handleCanvasKeydown = (event: KeyboardEvent) => {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return
  if (settingsStore.display.canvasEditorTab !== 'code') return
  if (!currentTabFilePath.value || !isActiveFileDirty.value) return

  event.preventDefault()
  saveActiveFile()
}

const closeFileTabs = async (filePaths: string[]) => {
  const targetPaths = Array.from(new Set(filePaths)).filter((filePath) => openFileTabs.value.includes(filePath))
  if (targetPaths.length === 0) return

  const dirtyPaths = targetPaths.filter((filePath) => {
    const currentFile = getPersistedFile(filePath)
    return Boolean(currentFile) && getDraftContent(filePath) !== currentFile.content
  })

  if (dirtyPaths.length > 0) {
    const shouldSave = await modal.confirm({
      title: targetPaths.length === 1 ? '关闭标签页' : '批量关闭标签页',
      content: dirtyPaths.length === 1
        ? `${dirtyPaths[0]} 有未保存修改，是否先保存再关闭？`
        : `有 ${dirtyPaths.length} 个标签页未保存，是否先保存再关闭？`,
      confirmText: '保存并关闭',
      cancelText: '直接关闭'
    })

    if (shouldSave) {
      dirtyPaths.forEach((filePath) => {
        saveDraftForFile(filePath)
      })
    }
  }

  const nextTabs = openFileTabs.value.filter((path) => !targetPaths.includes(path))
  openFileTabs.value = nextTabs

  const nextDrafts = { ...fileDrafts.value }
  targetPaths.forEach((filePath) => {
    delete nextDrafts[filePath]
  })
  fileDrafts.value = nextDrafts

  if (!targetPaths.includes(activeFilePath.value)) return

  const nextActiveFilePath = nextTabs[nextTabs.length - 1] || ''
  if (nextActiveFilePath) {
    activeFilePath.value = nextActiveFilePath
  }
}

const closeFileTab = async (filePath: string) => {
  await closeFileTabs([filePath])
}

const openTabContextMenu = (event: MouseEvent, filePath: string) => {
  const currentIndex = openFileTabs.value.indexOf(filePath)
  const rightSideTabs = currentIndex >= 0 ? openFileTabs.value.slice(currentIndex + 1) : []
  const otherTabs = openFileTabs.value.filter((path) => path !== filePath)
  const savedTabs = openFileTabs.value.filter((path) => {
    const currentFile = getPersistedFile(path)
    return !currentFile || getDraftContent(path) === currentFile.content
  })

  const options: MenuItem<{ filePath: string }>[] = [
    {
      label: '关闭',
      onClick: ({ filePath: targetPath }) => {
        void closeFileTab(targetPath)
      }
    },
    {
      label: '关闭其他',
      disabled: otherTabs.length === 0,
      onClick: () => {
        void closeFileTabs(otherTabs)
      }
    },
    {
      label: '关闭右侧标签页',
      disabled: rightSideTabs.length === 0,
      onClick: () => {
        void closeFileTabs(rightSideTabs)
      }
    },
    {
      label: '关闭已保存',
      disabled: savedTabs.length === 0,
      onClick: () => {
        void closeFileTabs(savedTabs)
      }
    },
    {
      label: '全部关闭',
      disabled: openFileTabs.value.length === 0,
      onClick: () => {
        void closeFileTabs([...openFileTabs.value])
      }
    }
  ]

  showTabContextMenu(event, options, { filePath })
}

const downloadAppAsZip = async () => {
  if (!isUsingTempWorkspace.value) {
    message.warning('下载应用仅支持临时工作区')
    return
  }

  if (!hasCanvasFiles.value) {
    message.warning('当前画布还没有文件，先生成或创建内容后再下载应用')
    return
  }

  try {
    const zip = new JSZip()
    const canvasSnapshot = canvasStore.getCanvas(currentChatId.value)

    sortSandboxFiles(canvasSnapshot).forEach((file) => {
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
  if (!isUsingTempWorkspace.value) {
    message.warning('保存应用仅支持临时工作区')
    return
  }

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
        canvas: canvasStore.getCanvas(currentChatId.value),
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

const openCanvasInTerminal = async () => {
  if (!hasCanvasFiles.value) {
    message.warning('当前画布还没有文件，先生成或创建内容后再打开终端')
    return
  }

  const closeLoading = message.loading('正在同步并打开终端...')
  try {
    const workspaceDir = currentWorkspaceDir.value
    await window.api.fs.promises.mkdir(workspaceDir, { recursive: true })
    await createTab({
      cwd: workspaceDir,
      promptLabel: 'canvas',
      showTerminal: true
    })
    closeLoading()
  } catch (error) {
    closeLoading()
    console.error('Open canvas in terminal error:', error)
    message.error('在终端打开失败')
  }
}

const openCanvasInLocalFolder = async () => {
  const closeLoading = message.loading('正在同步并打开本地文件夹...')
  try {
    const workspaceDir = currentWorkspaceDir.value
    await window.api.fs.promises.mkdir(workspaceDir, { recursive: true })
    await window.api.shell.openPath(workspaceDir)
    closeLoading()
  } catch (error) {
    closeLoading()
    console.error('Open canvas local folder error:', error)
    message.error('打开本地文件夹失败')
  }
}

const syncLocalFolderToCanvas = async () => {
  const workspaceDir = currentWorkspaceDir.value

  if (!window.api.fs.existsSync(workspaceDir)) {
    message.warning('本地文件夹还不存在，请先打开本地文件夹或在终端中打开')
    return
  }

  const closeLoading = message.loading('正在从本地文件夹同步...')
  try {
    canvasStore.touchWorkspace(currentChatId.value)
    closeLoading()
    message.success('已从本地文件夹同步到画布')
  } catch (error) {
    closeLoading()
    console.error('Sync local folder to canvas error:', error)
    message.error('同步本地文件夹失败')
  }
}

const chooseLocalWorkspaceFolder = async () => {
  const result = await window.api.showOpenDialog({
    title: '选择画布工作区文件夹',
    properties: ['openDirectory', 'createDirectory']
  })

  if (result.canceled || !result.filePaths?.[0]) return

  canvasStore.setWorkspaceRoot(result.filePaths[0], currentChatId.value)
  previewReady.value = false
  settingsStore.display.canvasEditorTab = 'code'
  loadDirectory('/')
  message.success(`已切换到本地文件夹：${result.filePaths[0]}`)
}

const switchToTempWorkspace = () => {
  canvasStore.resetWorkspaceRoot(currentChatId.value)
  previewReady.value = false
  loadDirectory('/')
  message.success('已切换回临时工作区')
}

const createCanvasFileFromDrop = async (file: File, directoryPath?: string) => {
  const relativeName = file.webkitRelativePath || file.name
  const baseDirectory = directoryPath ? normalizeSandboxPath(directoryPath) : ''
  const normalizedPath = normalizeSandboxPath(
    baseDirectory ? `${baseDirectory}/${relativeName}` : relativeName
  )

  if (!isTextFile(file.name)) {
    const content = await blobToDataURL(file)
    return {
      path: normalizedPath,
      content,
      encoding: 'data-url' as const,
      mediaType: file.type || undefined,
      updatedAt: Date.now()
    }
  }

  return {
    path: normalizedPath,
    content: await file.text(),
    encoding: 'text' as const,
    mediaType: file.type || undefined,
    updatedAt: Date.now()
  }
}

const handleDroppedFiles = async (files: File[], directoryPath?: string) => {
  if (files.length === 0) return

  try {
    const droppedFiles = await Promise.all(files.map((file) => createCanvasFileFromDrop(file, directoryPath)))

    droppedFiles.forEach((file) => {
      canvasStore.writeFile(file, currentChatId.value)
    })
    const successText = directoryPath
      ? `已导入 ${droppedFiles.length} 个文件到 ${normalizeSandboxPath(directoryPath)}`
      : `已导入 ${droppedFiles.length} 个文件`
    message.success(successText)
  } catch (error) {
    console.error('Canvas drop import error:', error)
    message.error((error as Error).message || '导入文件失败')
  }
}

const moveCanvasFileToDirectory = (sourcePath: string, directoryPath: string) => {
  const normalizedSourcePath = normalizeSandboxPath(sourcePath)
  const normalizedDirectoryPath = normalizeSandboxPath(directoryPath)
  const targetPath = normalizeSandboxPath(`${normalizedDirectoryPath}/${getBaseName(normalizedSourcePath)}`)

  if (normalizedSourcePath === targetPath) return

  canvasStore.applyOperation(
    {
      type: 'move',
      filePath: normalizedSourcePath,
      targetPath
    },
    currentChatId.value
  )
  message.success(`已移动文件到 ${normalizedDirectoryPath}`)
}

const resetDragState = () => {
  dragDepth.value = 0
  isCanvasDragOver.value = false
  draggingCanvasFilePath.value = ''
  dragTargetDirectoryPath.value = ''
}

const handleCanvasDragEnter = (event: DragEvent) => {
  if (!hasFileDrag(event)) return
  event.preventDefault()
  dragDepth.value += 1
  isCanvasDragOver.value = true
}

const handleCanvasDragOver = (event: DragEvent) => {
  if (!hasFileDrag(event)) return
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy'
  }
}

const handleCanvasDragLeave = (event: DragEvent) => {
  if (!hasFileDrag(event)) return
  event.preventDefault()
  dragDepth.value = Math.max(0, dragDepth.value - 1)
  if (dragDepth.value === 0) {
    isCanvasDragOver.value = false
  }
}

const handleCanvasDrop = (event: DragEvent) => {
  if (!hasFileDrag(event)) return
  event.preventDefault()
  resetDragState()
  void handleDroppedFiles(Array.from(event.dataTransfer?.files || []))
}

const handleTreeRowDragStart = (row: TreeRow, event: DragEvent) => {
  if (row.type !== 'file' || !event.dataTransfer) return
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData(CANVAS_FILE_DRAG_MIME, row.path)
  draggingCanvasFilePath.value = row.path
}

const handleTreeRowDragEnd = () => {
  draggingCanvasFilePath.value = ''
  dragTargetDirectoryPath.value = ''
}

const handleDirectoryDragEnter = (row: TreeRow, event: DragEvent) => {
  if (row.type !== 'directory') return
  if (!hasFileDrag(event) && !hasCanvasFileDrag(event)) return
  event.preventDefault()
  event.stopPropagation()
  dragTargetDirectoryPath.value = row.path
  expandDirectory(row.path)
}

const handleDirectoryDragOver = (row: TreeRow, event: DragEvent) => {
  if (row.type !== 'directory') return
  if (!hasFileDrag(event) && !hasCanvasFileDrag(event)) return
  event.preventDefault()
  event.stopPropagation()
  dragTargetDirectoryPath.value = row.path
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = hasCanvasFileDrag(event) ? 'move' : 'copy'
  }
}

const handleDirectoryDragLeave = (row: TreeRow, event: DragEvent) => {
  if (row.type !== 'directory') return
  if (!hasFileDrag(event) && !hasCanvasFileDrag(event)) return
  const currentTarget = event.currentTarget as HTMLElement | null
  const relatedTarget = event.relatedTarget as Node | null
  if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) return
  event.preventDefault()
  event.stopPropagation()
  if (dragTargetDirectoryPath.value === row.path) {
    dragTargetDirectoryPath.value = ''
  }
}

const handleDirectoryDrop = (row: TreeRow, event: DragEvent) => {
  if (row.type !== 'directory') return
  if (!hasFileDrag(event) && !hasCanvasFileDrag(event)) return

  event.preventDefault()
  event.stopPropagation()
  dragTargetDirectoryPath.value = ''
  isCanvasDragOver.value = false
  dragDepth.value = 0

  const canvasFilePath = event.dataTransfer?.getData(CANVAS_FILE_DRAG_MIME) || draggingCanvasFilePath.value
  if (canvasFilePath) {
    draggingCanvasFilePath.value = ''
    try {
      moveCanvasFileToDirectory(canvasFilePath, row.path)
    } catch (error) {
      message.error((error as Error).message || '移动文件失败')
    }
    return
  }

  void handleDroppedFiles(Array.from(event.dataTransfer?.files || []), row.path)
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
      disabled: !hasCanvasFiles.value || !isUsingTempWorkspace.value,
      onClick: () => {
        void downloadAppAsZip()
      }
    },
    {
      label: '保存应用',
      icon: BoxIcon,
      disabled: !hasCanvasFiles.value || !isUsingTempWorkspace.value,
      onClick: () => openSaveAppModal()
    },
    {
      label: '在终端打开',
      icon: TerminalIcon,
      disabled: !hasCanvasFiles.value,
      onClick: () => {
        void openCanvasInTerminal()
      }
    },
    {
      label: '打开本地文件夹',
      icon: FolderIcon,
      onClick: () => {
        void openCanvasInLocalFolder()
      }
    },
    {
      label: '选择本地文件夹',
      icon: FolderIcon,
      onClick: () => {
        void chooseLocalWorkspaceFolder()
      }
    },
    {
      label: '切回临时工作区',
      icon: RefreshIcon,
      disabled: isUsingTempWorkspace.value,
      onClick: () => switchToTempWorkspace()
    },
    {
      label: '同步本地文件夹',
      icon: RefreshIcon,
      onClick: () => {
        void syncLocalFolderToCanvas()
      }
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

watch(
  currentChatId,
  () => {
    previewLogs.value = []
    hideContextMenu()
    resetDragState()
    loadDirectory('/')
    openFileTabs.value = activeFilePath.value ? [activeFilePath.value] : []
    fileDrafts.value = {}
  },
  { immediate: true }
)

watch(
  () => sandboxTreeRows.value.length,
  () => {
    nextTick(() => {
      const containerRef = sandboxTreeContainerProps.ref as Ref<HTMLElement | null>
      containerRef.value?.dispatchEvent(new Event('scroll'))
    })
  }
)

watch(
  [availableDirectoryPathSet, currentWorkspaceVersion],
  ([availablePaths]) => {
    const nextExpandedPaths = new Set(
      expandedDirectoryPaths.value.filter((path) => availablePaths.has(path))
    )

    getAncestorDirectoryPaths(activeFilePath.value).forEach((path) => {
      if (availablePaths.has(path)) {
        nextExpandedPaths.add(path)
      }
    })

    const nextPaths = [...nextExpandedPaths]
    if (
      nextPaths.length === expandedDirectoryPaths.value.length &&
      nextPaths.every((path, index) => path === expandedDirectoryPaths.value[index])
    ) {
      return
    }

    expandedDirectoryPaths.value = nextPaths
  },
  { immediate: true }
)

watch(
  currentWorkspaceVersion,
  () => {
    loadDirectory('/')
    expandedDirectoryPaths.value.forEach((path) => {
      if (path !== '/') {
        loadDirectory(path)
      }
    })
  },
  { immediate: true }
)

watch(
  activeFilePath,
  (currentActiveFilePath) => {
    if (currentActiveFilePath) {
      ensureFileTabOpen(currentActiveFilePath)
    }

    const nextExpandedPaths = new Set(expandedDirectoryPaths.value)
    let changed = false

    getAncestorDirectoryPaths(currentActiveFilePath).forEach((path) => {
      if (!availableDirectoryPathSet.value.has(path) || nextExpandedPaths.has(path)) return
      nextExpandedPaths.add(path)
      changed = true
    })

    if (!changed) return
    expandedDirectoryPaths.value = [...nextExpandedPaths]
  }
)

watch(
  [currentTabFilePath, currentWorkspaceVersion],
  ([filePath]) => {
    if (!filePath) {
      activeFile.value = null
      return
    }
    activeFile.value = getPersistedFile(filePath)
  },
  { immediate: true }
)

watch(
  () => activeFile.value?.content,
  (content) => {
    const filePath = activeFilePath.value
    if (!filePath) return
    if (!hasDraftForFile(filePath)) return
    const draftContent = fileDrafts.value[filePath]
    if (draftContent !== (content || '')) return

    const nextDrafts = { ...fileDrafts.value }
    delete nextDrafts[filePath]
    fileDrafts.value = nextDrafts
  }
)

onMounted(() => {
  window.addEventListener('keydown', handleCanvasKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleCanvasKeydown)
})
</script>

<template>
  <div
    class="canvas-panel"
    :class="{ 'is-drag-over': isCanvasDragOver }"
    @dragenter="handleCanvasDragEnter"
    @dragover="handleCanvasDragOver"
    @dragleave="handleCanvasDragLeave"
    @drop="handleCanvasDrop"
  >
    <div v-if="isCanvasDragOver" class="canvas-drop-overlay">
      <div class="canvas-drop-card">
        <strong>拖入文件到画布</strong>
        <span>任意文件都可以拖入，松手后会同步到当前应用和临时工作区</span>
      </div>
    </div>
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
            <div class="sandbox-tree" v-bind="sandboxTreeContainerProps">
              <div class="sandbox-tree-wrapper" v-bind="sandboxTreeWrapperProps">
                <button v-for="item in virtualSandboxTreeRows" :key="item.data.id" type="button" class="sandbox-tree-row"
                  :class="{
                    active: item.data.type === 'file' && item.data.path === activeFilePath,
                    directory: item.data.type === 'directory',
                    'drop-target': item.data.type === 'directory' && item.data.path === dragTargetDirectoryPath,
                    dragging: item.data.type === 'file' && item.data.path === draggingCanvasFilePath
                  }" :style="{
                    paddingLeft: `${8 + item.data.depth * 14}px`,
                    height: `${SANDBOX_TREE_ROW_HEIGHT}px`
                  }" @click="handleTreeRowClick(item.data)" @contextmenu="openTreeRowMenu($event, item.data)"
                  :draggable="item.data.type === 'file'" @dragstart="handleTreeRowDragStart(item.data, $event)"
                  @dragend="handleTreeRowDragEnd" @dragenter="handleDirectoryDragEnter(item.data, $event)"
                  @dragover="handleDirectoryDragOver(item.data, $event)"
                  @dragleave="handleDirectoryDragLeave(item.data, $event)" @drop="handleDirectoryDrop(item.data, $event)">
                  <span class="sandbox-tree-chevron">
                    {{ item.data.type === 'directory' && item.data.hasChildren ? (item.data.isExpanded ? '▾' : '▸') : '' }}
                  </span>
                  <span class="sandbox-tree-file-icon" :class="[`type-${item.data.type}`]">
                    <span class="sandbox-tree-file-glyph"></span>
                  </span>
                  <span class="sandbox-tree-label">{{ item.data.name }}</span>
                  <span v-if="item.data.type === 'file'" class="sandbox-tree-badge">
                    {{ getFileExtensionLabel(item.data.name) }}
                  </span>
                </button>
              </div>
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
            <div v-if="!isUsingTempWorkspace" class="canvas-empty-state">
              预览仅支持临时工作区。切回临时工作区后可使用预览。
            </div>
            <HtmlPreview v-else-if="previewReady" :srcdoc="previewDocument" :channel-id="previewChannelId"
              @sandbox-event="handleSandboxEvent" />
            <div v-else class="canvas-empty-state">
              当前预览尚未准备好。
            </div>
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
              <div v-if="openFileTabs.length > 0" class="canvas-file-tabs">
                <button v-for="filePath in openFileTabs" :key="filePath" type="button" class="canvas-file-tab"
                  :class="{ active: filePath === activeFilePath }" @click="activeFilePath = filePath"
                  @contextmenu="openTabContextMenu($event, filePath)">
                  <span class="canvas-file-tab-name">{{ getBaseNameFromPath(filePath) }}</span>
                  <span v-if="getDraftContent(filePath) !== (getPersistedFile(filePath)?.content || '')"
                    class="canvas-file-tab-dirty"></span>
                  <span class="canvas-file-tab-close" @click.stop="void closeFileTab(filePath)">x</span>
                </button>
              </div>
              <div v-if="isActiveImageFile" class="canvas-image-preview">
                <AppImage :src="activeFile.content" preview class="canvas-image-preview-media" />
              </div>
              <div v-else-if="isActiveBinaryFile" class="canvas-binary-preview">
                <strong>二进制文件</strong>
                <span>{{ currentTabFilePath }}</span>
                <p>该文件已保存在画布工作区中，可直接在终端或 exec_command_canvas 中使用。</p>
              </div>
              <div v-else class="canvas-code-editor">
                <SandboxCodeEditor v-model="activeFileContent" :path="currentTabFilePath" :language="activeLanguage" />
              </div>
            </div>
          </template>
          <div v-else class="canvas-empty-state">
            当前没有打开的文件。请先在左侧选择文件，或新建一个文件。
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
  position: relative;
}

.canvas-drop-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  background: rgba(15, 23, 42, 0.12);
  backdrop-filter: blur(2px);
  pointer-events: none;
}

.canvas-drop-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: min(420px, calc(100% - 32px));
  padding: 18px 20px;
  border-radius: 16px;
  border: 1px solid rgba(var(--accent-rgb), 0.28);
  background: color-mix(in srgb, var(--bg-card) 88%, white 12%);
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.16);
  text-align: center;
}

.canvas-drop-card strong {
  font-size: 16px;
  color: var(--text-primary);
}

.canvas-drop-card span {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.canvas-binary-preview {
  height: 100%;
  min-height: 240px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  text-align: center;
  color: var(--text-secondary);
}

.canvas-binary-preview strong {
  font-size: 16px;
  color: var(--text-primary);
}

.canvas-binary-preview span {
  font-size: 12px;
  color: var(--text-tertiary);
  word-break: break-all;
}

.canvas-binary-preview p {
  margin: 0;
  max-width: 460px;
  font-size: 13px;
  line-height: 1.6;
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
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--sandbox-sidebar-faint) 72%, transparent) transparent;
  -ms-overflow-style: auto;
}

.sandbox-tree::-webkit-scrollbar {
  width: 10px;
  height: 10px;
  display: block;
}

.sandbox-tree::-webkit-scrollbar-track {
  background: transparent;
}

.sandbox-tree::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--sandbox-sidebar-faint) 68%, transparent);
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}

.sandbox-tree::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--sandbox-sidebar-text) 54%, transparent);
  border: 2px solid transparent;
  background-clip: padding-box;
}

.sandbox-tree-wrapper {
  min-width: 100%;
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
  height: 22px;
  max-height: 22px;
  box-sizing: border-box;
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

.sandbox-tree-row.dragging {
  opacity: 0.56;
}

.sandbox-tree-row.drop-target {
  background: color-mix(in srgb, var(--accent-color) 14%, transparent);
  box-shadow: inset 0 0 0 1px rgba(var(--accent-rgb), 0.32);
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

.canvas-file-tabs {
  display: flex;
  align-items: stretch;
  gap: 1px;
  border-bottom: 1px solid rgba(var(--text-rgb), 0.08);
  background: rgba(255, 255, 255, 0.02);
  overflow-x: auto;
}

.canvas-file-tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 220px;
  height: 30px;
  padding: 0 10px;
  border: none;
  border-radius: 0;
  background: rgba(var(--text-rgb), 0.04);
  color: var(--text-secondary);
  cursor: pointer;
  flex-shrink: 0;
}

.canvas-file-tab.active {
  background: color-mix(in srgb, var(--bg-card) 86%, transparent);
  color: var(--text-primary);
}

.canvas-file-tab-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.canvas-file-tab-dirty {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #d97706;
  flex-shrink: 0;
}

.canvas-file-tab-close {
  display: inline-grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.canvas-file-tab-close:hover {
  background: rgba(var(--text-rgb), 0.08);
  color: var(--text-primary);
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
