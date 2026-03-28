<script setup lang="ts">
import { useVirtualList } from '@vueuse/core'
import AppImage from './Image.vue'
import HtmlPreview from './HtmlPreview.vue'
import ModelSelector from './ModelSelector.vue'
import SandboxCodeEditor from './SandboxCodeEditor.vue'
import Tabs from './Tabs.vue'
import JSZip from 'jszip'
import { useLocalStorage } from '@renderer/composables/vueuse'
import { gitService, type GitRepositoryStatus, type GitStatusEntry } from '@renderer/services/gitService'
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

interface Props {
  chatId?: string
  hideGitTab?: boolean
  hideLocalFolderActions?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  chatId: '',
  hideGitTab: false,
  hideLocalFolderActions: false
})

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

type GitDiffMode = 'staged' | 'worktree'

type GitDiffPreview = {
  kind: 'diff'
  path: string
  originalText: string
  modifiedText: string
  originalPath: string
  modifiedPath: string
  hint: string
  availableModes: GitDiffMode[]
  activeMode: GitDiffMode
} | {
  kind: 'message'
  message: string
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

const canvasTabs = computed(() => {
  const tabs = [
    { id: 'preview', name: '预览' },
    { id: 'code', name: '代码' }
  ]

  if (!props.hideGitTab) {
    tabs.push({ id: 'git', name: 'Git' })
  }

  return tabs
})
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

const currentChatId = computed(() => props.chatId || chatsStore.currentChat?.id)
const currentWorkspaceVersion = computed(() => canvasStore.getWorkspaceVersion(currentChatId.value))
const currentWorkspaceDir = computed(() => canvasStore.getWorkspaceDir(currentChatId.value))
const isPreviewTab = computed(() => settingsStore.display.canvasEditorTab === 'preview')
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
const gitStatus = ref<GitRepositoryStatus | null>(null)
const gitSelectedPath = ref('')
const gitDiffPreview = ref<GitDiffPreview | null>(null)
const gitDiffMode = ref<GitDiffMode>('worktree')
const gitCommitMessage = ref('')
const gitLoading = ref(false)
const gitDiffLoading = ref(false)
const gitGeneratingCommitMessage = ref(false)
const gitCommitting = ref(false)
const gitError = ref('')
const gitCommitProviderId = ref('')
const gitCommitModelId = ref('')
const gitGenerateAfterModelPick = ref(false)
const gitActionLoading = ref(false)
const isSandboxRuntimeVisible = computed(
  () => settingsStore.display.canvasEditorTab === 'preview' && !sandboxLogsCollapsed.value
)
const gitEntries = computed(() => gitStatus.value?.entries || [])
const gitSelectedEntry = computed(() => gitEntries.value.find((entry) => entry.path === gitSelectedPath.value) || null)
const hasGitRepo = computed(() => Boolean(gitStatus.value))
const hasGitChanges = computed(() => gitEntries.value.length > 0)
const hasStagedGitChanges = computed(() => gitEntries.value.some((entry) => entry.staged))
const gitAheadCount = computed(() => Math.max(0, gitStatus.value?.ahead || 0))
const isGitPrimaryPushAction = computed(() => !hasGitChanges.value && gitAheadCount.value > 0)
const gitPrimaryButtonLabel = computed(() => {
  if (isGitPrimaryPushAction.value) {
    return `推送（${gitAheadCount.value}）`
  }
  return '提交'
})
const gitPrimaryButtonLoadingLabel = computed(() => (isGitPrimaryPushAction.value ? '推送中...' : '提交中...'))
const isGitPrimaryButtonDisabled = computed(() => {
  if (isGitPrimaryPushAction.value) {
    return gitActionLoading.value
  }
  return gitCommitting.value || !gitCommitMessage.value.trim()
})
const gitDiffView = computed(() => gitDiffPreview.value?.kind === 'diff' ? gitDiffPreview.value : null)

const ensureGitModelSelection = () => {
  if (gitCommitProviderId.value && gitCommitModelId.value) return
  const providerId = settingsStore.selectedProviderId
  const modelId = settingsStore.selectedModelId
  const provider = providerId ? settingsStore.getProviderById(providerId) : null
  const hasTextModel = Boolean(provider?.models?.some((item) => item.id === modelId && item.category === 'text'))

  if (providerId && modelId && hasTextModel) {
    gitCommitProviderId.value = providerId
    gitCommitModelId.value = modelId
    return
  }

  const fallback = gitService.listCommitMessageModels()[0]
  gitCommitProviderId.value = fallback?.providerId || ''
  gitCommitModelId.value = fallback?.modelId || ''
}

const [GitCloneForm, gitCloneFormActions] = useForm({
  showHeader: false,
  fields: [
    {
      name: 'repoUrl',
      type: 'text',
      label: '仓库地址',
      placeholder: 'https://github.com/user/repo.git',
      required: true
    },
    {
      name: 'targetDir',
      type: 'path',
      label: '目标目录',
      required: true,
      dialogOptions: {
        properties: ['openDirectory']
      }
    },
    {
      name: 'directoryName',
      type: 'text',
      label: '文件夹名称',
      placeholder: '可选，默认使用仓库名'
    }
  ]
})

const getGitAbsolutePath = (cwd: string, path: string) => {
  return window.api.path.join(cwd, path)
}

const buildGitDiffPreview = async (cwd: string, entry: GitStatusEntry, preferredMode = gitDiffMode.value): Promise<GitDiffPreview> => {
  if (entry.untracked) {
    const absolutePath = getGitAbsolutePath(cwd, entry.path)
    const content = window.api.fs.existsSync(absolutePath)
      ? window.api.fs.readFileSync(absolutePath, 'utf-8')
      : ''

    return {
      kind: 'diff',
      path: entry.path,
      originalText: '',
      modifiedText: content,
      originalPath: `/dev/null/${entry.path}`,
      modifiedPath: entry.path,
      hint: '未跟踪文件，对比的是空白内容与当前工作区文件。',
      availableModes: ['worktree'],
      activeMode: 'worktree'
    }
  }

  const availableModes: GitDiffMode[] = []
  if (entry.staged) {
    availableModes.push('staged')
  }
  if (entry.workingTreeStatus !== ' ' && entry.workingTreeStatus !== '?') {
    availableModes.push('worktree')
  }
  const activeMode = availableModes.includes(preferredMode) ? preferredMode : (availableModes[0] || 'worktree')

  const worktreeAbsolutePath = getGitAbsolutePath(cwd, entry.path)

  if (activeMode === 'staged') {
    const headPath = entry.originalPath || entry.path
    const originalText = await gitService.getFileContent(cwd, {
      ref: 'HEAD',
      filePath: headPath,
      allowMissing: true
    }) || ''
    const modifiedText = await gitService.getFileContent(cwd, {
      ref: 'INDEX',
      filePath: entry.path,
      allowMissing: true
    }) || ''

    return {
      kind: 'diff',
      path: entry.path,
      originalText,
      modifiedText,
      originalPath: headPath,
      modifiedPath: entry.path,
      hint: '暂存区对比：左侧是 HEAD，右侧是 INDEX。',
      availableModes,
      activeMode
    }
  }

  const indexPath = entry.workingTreeStatus === 'R' && entry.originalPath ? entry.originalPath : entry.path
  const originalText = await gitService.getFileContent(cwd, {
    ref: 'INDEX',
    filePath: indexPath,
    allowMissing: true
  }) || ''
  const modifiedText = window.api.fs.existsSync(worktreeAbsolutePath)
    ? window.api.fs.readFileSync(worktreeAbsolutePath, 'utf-8')
    : ''

  return {
    kind: 'diff',
    path: entry.path,
    originalText,
    modifiedText,
    originalPath: indexPath,
    modifiedPath: entry.path,
    hint: '工作区对比：左侧是 INDEX，右侧是 WORKTREE。',
    availableModes,
    activeMode
  }
}

const refreshGitDiff = async (path = gitSelectedPath.value, preferredMode = gitDiffMode.value) => {
  gitSelectedPath.value = path
  gitDiffPreview.value = null
  const entry = gitEntries.value.find((item) => item.path === path)
  if (!entry) return

  gitDiffLoading.value = true
  try {
    gitDiffPreview.value = await buildGitDiffPreview(currentWorkspaceDir.value, entry, preferredMode)
    if (gitDiffPreview.value.kind === 'diff') {
      gitDiffMode.value = gitDiffPreview.value.activeMode
    }
  } catch (error) {
    gitDiffPreview.value = {
      kind: 'message',
      message: `加载 diff 失败：${(error as Error).message}`
    }
  } finally {
    gitDiffLoading.value = false
  }
}

const refreshGitStatus = async () => {
  gitLoading.value = true
  gitError.value = ''

  try {
    ensureGitModelSelection()
    const cwd = currentWorkspaceDir.value
    if (!(await gitService.isGitRepository(cwd))) {
      gitStatus.value = null
      gitSelectedPath.value = ''
      gitDiffPreview.value = null
      return
    }

    const status = await gitService.getStatus(cwd)
    gitStatus.value = status
    const nextPath = status.entries.find((entry) => entry.path === gitSelectedPath.value)?.path || status.entries[0]?.path || ''
    await refreshGitDiff(nextPath)
  } catch (error) {
    gitStatus.value = null
    gitSelectedPath.value = ''
    gitDiffPreview.value = null
    gitError.value = (error as Error).message
  } finally {
    gitLoading.value = false
  }
}

const generateGitCommitMessage = async () => {
  ensureGitModelSelection()
  if (!gitCommitProviderId.value || !gitCommitModelId.value) {
    message.warning('请先选择模型')
    return
  }

  gitGeneratingCommitMessage.value = true
  try {
    gitCommitMessage.value = await gitService.generateCommitMessage(currentWorkspaceDir.value, {
      providerId: gitCommitProviderId.value,
      modelId: gitCommitModelId.value,
      staged: hasStagedGitChanges.value
    })
  } catch (error) {
    message.error((error as Error).message)
  } finally {
    gitGeneratingCommitMessage.value = false
  }
}

const handleGitCommitModelSelect = ({ modelId, providerId }: { modelId: string; providerId: string }) => {
  gitCommitProviderId.value = providerId
  gitCommitModelId.value = modelId
  if (!gitGenerateAfterModelPick.value) return
  gitGenerateAfterModelPick.value = false
  void generateGitCommitMessage()
}

const commitGitChanges = async () => {
  const commitMessage = gitCommitMessage.value.trim()
  if (!commitMessage) {
    message.warning('请先输入提交信息')
    return
  }
  if (!gitEntries.value.length) {
    message.warning('当前没有可提交的变更')
    return
  }

  gitCommitting.value = true
  try {
    if (!hasStagedGitChanges.value) {
      await gitService.stageAll(currentWorkspaceDir.value)
    }
    await gitService.commit(currentWorkspaceDir.value, commitMessage)
    gitCommitMessage.value = ''
    await refreshGitStatus()
    message.success('提交成功')
  } catch (error) {
    message.error((error as Error).message)
  } finally {
    gitCommitting.value = false
  }
}

const runGitHeaderAction = async (action: () => Promise<void>, successMessage: string) => {
  if (gitActionLoading.value) return
  gitActionLoading.value = true
  try {
    await action()
    await refreshGitStatus()
    message.success(successMessage)
  } catch (error) {
    message.error((error as Error).message)
  } finally {
    gitActionLoading.value = false
  }
}

const pullGitChanges = async () => {
  await runGitHeaderAction(async () => {
    await gitService.pull(currentWorkspaceDir.value)
  }, '拉取完成')
}

const pushGitChanges = async () => {
  await runGitHeaderAction(async () => {
    await gitService.push(currentWorkspaceDir.value)
  }, '推送完成')
}

const runGitPrimaryAction = async () => {
  if (isGitPrimaryPushAction.value) {
    await pushGitChanges()
    return
  }
  await commitGitChanges()
}

const fetchGitChanges = async () => {
  await runGitHeaderAction(async () => {
    await gitService.fetch(currentWorkspaceDir.value)
  }, '抓取完成')
}

const checkoutGitBranch = async (branchName: string) => {
  await runGitHeaderAction(async () => {
    await gitService.checkoutBranch(currentWorkspaceDir.value, branchName)
  }, `已切换到 ${branchName}`)
}

const cloneGitRepository = async () => {
  const workspaceDir = currentWorkspaceDir.value
  gitCloneFormActions.setFieldValue('repoUrl', '')
  gitCloneFormActions.setFieldValue('targetDir', window.api.path.dirname(workspaceDir))
  gitCloneFormActions.setFieldValue('directoryName', '')

  const confirmed = await modal.confirm({
    title: '克隆仓库',
    content: GitCloneForm,
    confirmText: '开始克隆',
    cancelText: '取消'
  })

  if (!confirmed) return

  const repoUrl = String(gitCloneFormActions.getFieldValue('repoUrl') || '').trim()
  const targetDir = String(gitCloneFormActions.getFieldValue('targetDir') || '').trim()
  const directoryName = String(gitCloneFormActions.getFieldValue('directoryName') || '').trim()

  if (!repoUrl) {
    message.warning('请输入仓库地址')
    return
  }
  if (!targetDir) {
    message.warning('请选择目标目录')
    return
  }

  gitActionLoading.value = true
  try {
    const clonedPath = await gitService.cloneRepository(currentWorkspaceDir.value, repoUrl, targetDir, directoryName)
    message.success(`克隆完成：${clonedPath}`)
    await window.api.shell.openPath(clonedPath)
  } catch (error) {
    message.error((error as Error).message)
  } finally {
    gitActionLoading.value = false
  }
}

const openGitActionsMenu = async (event: MouseEvent) => {
  let branchChildren: MenuItem<TreeRow>[] = []

  if (hasGitRepo.value) {
    try {
      const branches = await gitService.listBranches(currentWorkspaceDir.value)
      branchChildren = branches.map((branch) => ({
        label: branch.name,
        disabled: branch.current || gitActionLoading.value,
        shortcut: branch.current ? '当前' : branch.upstream || '',
        onClick: () => {
          void checkoutGitBranch(branch.name)
        }
      }))
    } catch (error) {
      message.error((error as Error).message)
      return
    }
  }

  const options: MenuItem<TreeRow>[] = [
    {
      label: '拉取',
      disabled: !hasGitRepo.value || gitActionLoading.value,
      onClick: () => {
        void pullGitChanges()
      }
    },
    {
      label: '推送',
      disabled: !hasGitRepo.value || gitActionLoading.value,
      onClick: () => {
        void pushGitChanges()
      }
    },
    {
      label: '克隆仓库',
      disabled: gitActionLoading.value,
      onClick: () => {
        void cloneGitRepository()
      }
    },
    {
      label: '切换到...',
      disabled: !hasGitRepo.value || branchChildren.length === 0 || gitActionLoading.value,
      children: branchChildren
    },
    {
      label: '抓取',
      disabled: !hasGitRepo.value || gitActionLoading.value,
      onClick: () => {
        void fetchGitChanges()
      }
    }
  ]

  showContextMenu(event, options)
}

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
  [gitCommitProviderId, gitCommitModelId],
  ([providerId, modelId], [prevProviderId, prevModelId]) => {
    if (!gitGenerateAfterModelPick.value) return
    if (!providerId || !modelId) return
    if (providerId === prevProviderId && modelId === prevModelId) return
    gitGenerateAfterModelPick.value = false
    void generateGitCommitMessage()
  }
)

watch(
  () => settingsStore.display.canvasEditorTab,
  (tab) => {
    if (tab === 'preview' && isUsingTempWorkspace.value) {
      previewReady.value = true
      return
    }
    if (tab === 'git') {
      void refreshGitStatus()
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

const revealFileAncestors = (filePath?: string) => {
  if (!filePath) return

  const nextExpandedPaths = new Set(expandedDirectoryPaths.value)
  let changed = false

  getAncestorDirectoryPaths(filePath).forEach((path) => {
    if (!availableDirectoryPathSet.value.has(path) || nextExpandedPaths.has(path)) return
    nextExpandedPaths.add(path)
    changed = true
  })

  if (!changed) return
  expandedDirectoryPaths.value = [...nextExpandedPaths]
}

const loadDirectory = (directoryPath = '/') => {
  directoryEntries.value = {
    ...directoryEntries.value,
    [directoryPath]: canvasStore.listDirectory(directoryPath, currentChatId.value)
  }
}

const syncWorkspaceView = () => {
  previewLogs.value = []
  hideContextMenu()
  resetDragState()
  directoryEntries.value = {}
  expandedDirectoryPaths.value = []
  fileDrafts.value = {}
  previewReady.value = settingsStore.display.canvasEditorTab === 'preview' && isUsingTempWorkspace.value

  const nextActiveFilePath = canvasStore.getActiveFilePath(currentChatId.value)
  if (nextActiveFilePath) {
    try {
      canvasStore.readFile(nextActiveFilePath, currentChatId.value)
    } catch {
      canvasStore.resetActiveFilePath(currentChatId.value)
    }
  }

  loadDirectory('/')
  revealFileAncestors(activeFilePath.value)
  openFileTabs.value = activeFilePath.value ? [activeFilePath.value] : []
}

const handleTreeRowClick = (row: TreeRow) => {
  if (row.type === 'directory') {
    if (row.hasChildren) {
      if (expandedDirectoryPathSet.value.has(row.path)) {
        toggleDirectory(row.path)
      } else {
        loadDirectory(row.path)
        expandDirectory(row.path)
      }
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

const getWorkspaceFsPath = (sandboxPath = '/') => {
  if (sandboxPath === '/') return currentWorkspaceDir.value
  const relativePath = normalizeSandboxPath(sandboxPath).replace(/^\/+/, '')
  return window.api.path.join(currentWorkspaceDir.value, ...relativePath.split('/'))
}

const remapSandboxPath = (path: string, sourcePath: string, targetPath: string) => {
  if (path === sourcePath) return targetPath
  if (!path.startsWith(`${sourcePath}/`)) return path
  return normalizeSandboxPath(`${targetPath}${path.slice(sourcePath.length)}`)
}

const updateClientPathsAfterMove = (sourcePath: string, targetPath: string) => {
  if (activeFilePath.value) {
    const nextActiveFilePath = remapSandboxPath(activeFilePath.value, sourcePath, targetPath)
    if (nextActiveFilePath !== activeFilePath.value) {
      activeFilePath.value = nextActiveFilePath
    }
  }

  openFileTabs.value = openFileTabs.value.map((path) => remapSandboxPath(path, sourcePath, targetPath))

  const nextDrafts = Object.entries(fileDrafts.value).reduce<Record<string, string>>((acc, [path, content]) => {
    acc[remapSandboxPath(path, sourcePath, targetPath)] = content
    return acc
  }, {})
  fileDrafts.value = nextDrafts

  const nextExpandedPaths = expandedDirectoryPaths.value.map((path) => remapSandboxPath(path, sourcePath, targetPath))
  expandedDirectoryPaths.value = [...new Set(nextExpandedPaths)]
}

const removeClientPathsByPrefix = (targetPath: string) => {
  if (activeFilePath.value === targetPath || activeFilePath.value.startsWith(`${targetPath}/`)) {
    canvasStore.resetActiveFilePath(currentChatId.value)
  }

  openFileTabs.value = openFileTabs.value.filter((path) => path !== targetPath && !path.startsWith(`${targetPath}/`))

  fileDrafts.value = Object.entries(fileDrafts.value).reduce<Record<string, string>>((acc, [path, content]) => {
    if (path !== targetPath && !path.startsWith(`${targetPath}/`)) {
      acc[path] = content
    }
    return acc
  }, {})

  expandedDirectoryPaths.value = expandedDirectoryPaths.value.filter((path) => path !== targetPath && !path.startsWith(`${targetPath}/`))
}

const refreshTreeDirectories = (paths: string[] = []) => {
  const directoriesToReload = new Set<string>(['/'])

  expandedDirectoryPaths.value.forEach((path) => {
    directoriesToReload.add(path)
  })

  paths.forEach((path) => {
    if (!path) return
    const normalizedPath = path === '/' ? '/' : normalizeSandboxPath(path)
    directoriesToReload.add(normalizedPath)
    const parentPath = getParentPath(normalizedPath)
    directoriesToReload.add(parentPath || '/')
  })

  directoriesToReload.forEach((path) => {
    loadDirectory(path)
  })
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

        const sourceFsPath = getWorkspaceFsPath(row.path)
        const targetFsPath = getWorkspaceFsPath(nextBasePath)
        if (!window.api.fs.existsSync(sourceFsPath)) {
          throw new Error(row.type === 'directory' ? '目录不存在' : '文件不存在')
        }
        if (window.api.fs.existsSync(targetFsPath)) {
          throw new Error(`目标已存在：${nextBasePath}`)
        }

        window.api.fs.mkdirSync(window.api.path.dirname(targetFsPath), { recursive: true })
        window.api.fs.renameSync(sourceFsPath, targetFsPath)
        updateClientPathsAfterMove(row.path, nextBasePath)
        canvasStore.touchWorkspace(currentChatId.value)
        refreshTreeDirectories([row.path, nextBasePath])

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
  const fsPath = getWorkspaceFsPath(row.path)
  if (!window.api.fs.existsSync(fsPath)) {
    message.warning(row.type === 'directory' ? '目录不存在' : '文件不存在')
    return
  }

  const filePaths = getRowFilePaths(row)
  const confirmed = await modal.confirm({
    title: row.type === 'directory' ? '删除目录' : '删除文件',
    content: row.type === 'directory'
      ? `确定删除 ${row.path}${filePaths.length > 0 ? ` 及其下 ${filePaths.length} 个文件` : ''}吗？`
      : `确定删除 ${row.path} 吗？`,
    confirmProps: {
      danger: true
    },
    confirmText: '删除',
    cancelText: '取消'
  })
  if (!confirmed) return

  try {
    window.api.fs.rmSync(fsPath, { recursive: true, force: true })
    removeClientPathsByPrefix(row.path)
    canvasStore.touchWorkspace(currentChatId.value)
    refreshTreeDirectories([getParentPath(row.path) || '/'])
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
    ...(row.type === 'directory'
      ? [
        {
          label: '新建文件',
          icon: AddIcon,
          onClick: (targetRow: TreeRow) => createFile(targetRow.path)
        },
        {
          label: '新建文件夹',
          icon: FolderIcon,
          onClick: (targetRow: TreeRow) => createFolder(targetRow.path)
        },
        {
          type: 'divider' as const
        }
      ]
      : []),
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
    if (!currentFile) return false
    return getDraftContent(filePath) !== currentFile.content
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

const createFile = (directoryPath = '/') => {
  const normalizedDirectoryPath = directoryPath === '/' ? '/' : normalizeSandboxPath(directoryPath)
  const defaultFilePath = normalizedDirectoryPath === '/' ? '/new-file.js' : `${normalizedDirectoryPath}/new-file.js`
  const [FormComponent, formActions] = useForm({
    fields: [
      {
        name: 'path',
        label: '文件路径',
        type: 'text',
        placeholder: normalizedDirectoryPath === '/' ? '例如 /components/card.js' : `例如 ${normalizedDirectoryPath}/index.js`,
        required: true
      }
    ],
    initialData: {
      path: defaultFilePath
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
        ensureFileTabOpen(filePath)
        activeFilePath.value = filePath
        revealFileAncestors(filePath)
        refreshTreeDirectories([getParentPath(filePath) || '/'])
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

const createFolder = (directoryPath = '/') => {
  const normalizedDirectoryPath = directoryPath === '/' ? '/' : normalizeSandboxPath(directoryPath)
  const [FormComponent, formActions] = useForm({
    fields: [
      {
        name: 'name',
        label: '文件夹名称',
        type: 'text',
        placeholder: normalizedDirectoryPath === '/' ? '例如 components' : '例如 utils',
        required: true
      }
    ],
    initialData: {
      name: 'new-folder'
    },
    onSubmit: (data) => {
      try {
        const nextDirectoryPath = buildSiblingPath(`${normalizedDirectoryPath}/placeholder`, String(data.name || ''))
        const targetFsPath = getWorkspaceFsPath(nextDirectoryPath)
        if (window.api.fs.existsSync(targetFsPath)) {
          throw new Error(`目标已存在：${nextDirectoryPath}`)
        }

        window.api.fs.mkdirSync(targetFsPath, { recursive: true })
        if (normalizedDirectoryPath !== '/') {
          expandDirectory(normalizedDirectoryPath)
        }
        canvasStore.touchWorkspace(currentChatId.value)
        refreshTreeDirectories([normalizedDirectoryPath, nextDirectoryPath])
        message.success(`已创建文件夹 ${nextDirectoryPath}`)
        modal.remove()
      } catch (error) {
        message.error((error as Error).message)
      }
    }
  })

  modal.confirm({
    title: '新建文件夹',
    content: FormComponent,
    confirmText: '创建',
    cancelText: '取消',
    onOk: () => {
      formActions.submit()
    }
  })
}

const openTreeBlankMenu = (event: MouseEvent) => {
  const target = event.target as HTMLElement | null
  if (target?.closest('.sandbox-tree-row')) return

  const options: MenuItem<TreeRow>[] = [
    {
      label: '新建文件',
      icon: AddIcon,
      onClick: () => createFile('/')
    },
    {
      label: '新建文件夹',
      icon: FolderIcon,
      onClick: () => createFolder('/')
    }
  ]

  showContextMenu(event, options)
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
  syncWorkspaceView()
  message.success(`已切换到本地文件夹：${result.filePaths[0]}`)
}

const switchToTempWorkspace = () => {
  canvasStore.resetWorkspaceRoot(currentChatId.value)
  previewReady.value = false
  syncWorkspaceView()
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
      type: 'divider'
    },
    {
      label: '重置',
      onClick: () => clearCanvas()
    }
  ]

  if (!props.hideLocalFolderActions) {
    options.splice(4, 0,
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
      }
    )
  }

  showContextMenu(event, options)
}

watchEffect(() => {
  if (!props.hideGitTab) return
  if (settingsStore.display.canvasEditorTab === 'git') {
    settingsStore.display.canvasEditorTab = 'preview'
  }
})

watch(
  currentChatId,
  () => {
    syncWorkspaceView()
  },
  { immediate: true }
)

watch(
  currentWorkspaceDir,
  (nextDir, previousDir) => {
    if (!nextDir || nextDir === previousDir) return
    syncWorkspaceView()
  }
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
    const nextPaths = expandedDirectoryPaths.value.filter((path) => availablePaths.has(path))
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
  [currentWorkspaceDir, currentWorkspaceVersion],
  () => {
    if (settingsStore.display.canvasEditorTab === 'git') {
      void refreshGitStatus()
    }
  },
  { immediate: true }
)

watch(
  activeFilePath,
  (currentActiveFilePath) => {
    if (currentActiveFilePath) {
      ensureFileTabOpen(currentActiveFilePath)
    }
    revealFileAncestors(currentActiveFilePath)
  },
  { immediate: true }
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
        <span>任意文件都可以拖入，松手后会同步到当前画布工作区</span>
      </div>
    </div>
    <div class="sandbox-workspace" :class="{ 'is-preview-mode': isPreviewTab }">
      <div v-if="isPreviewTab" class="sandbox-preview-toolbar">
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

      <ResizeBox v-if="!isPreviewTab" v-model:width="sandboxTreeWidth" v-model:is-collapsed="sandboxTreeCollapsed" :min-size="140"
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
              <div class="sandbox-explorer-group-header-row">
                <span class="sandbox-explorer-group-title">{{ settingsStore.display.canvasEditorTab === 'git' ? '更改' : 'SANDBOX' }}</span>
                <div v-if="settingsStore.display.canvasEditorTab === 'git'" class="canvas-git-header-actions">
                  <button type="button" class="sandbox-sidebar-tool" title="刷新" @click="void refreshGitStatus()">↻</button>
                  <div
                    class="canvas-git-ai-selector"
                    :class="{ 'is-loading': gitGeneratingCommitMessage }"
                    :title="gitGeneratingCommitMessage ? '生成提交信息中' : '生成提交信息'"
                    @click.capture="gitGenerateAfterModelPick = true"
                  >
                    <ModelSelector
                      v-model:model-id="gitCommitModelId"
                      v-model:provider-id="gitCommitProviderId"
                      type="icon"
                      category="text"
                      popup-position="bottom"
                      @select="handleGitCommitModelSelect"
                    />
                  </div>
                  <button
                    type="button"
                    class="sandbox-sidebar-tool canvas-git-more-tool"
                    :disabled="gitActionLoading"
                    title="更多 Git 操作"
                    @click="void openGitActionsMenu($event)"
                  >⋯</button>
                </div>
              </div>
            </div>
            <div v-if="settingsStore.display.canvasEditorTab === 'git'" class="sandbox-tree">
                <div class="canvas-git-compose">
                  <textarea
                    v-model="gitCommitMessage"
                    class="canvas-git-commit-input"
                    rows="1"
                    :placeholder="`消息 (${hasGitRepo ? `⌘Enter 在“${gitStatus?.branch || 'HEAD'}”提交` : '提交'})`"
                  />
                  <button
                    type="button"
                    class="canvas-git-commit-primary"
                    :disabled="isGitPrimaryButtonDisabled"
                    @click="void runGitPrimaryAction()"
                  >
                    {{ gitCommitting || gitActionLoading ? gitPrimaryButtonLoadingLabel : gitPrimaryButtonLabel }}
                  </button>
                </div>
                <button
                  v-for="entry in gitEntries"
                  :key="entry.path"
                  type="button"
                  class="sandbox-tree-row canvas-git-tree-row"
                  :class="{ active: entry.path === gitSelectedPath }"
                  @click="void refreshGitDiff(entry.path)"
                >
                  <span class="sandbox-tree-file-icon type-file">
                    <span class="sandbox-tree-file-glyph"></span>
                  </span>
                  <span class="canvas-git-tree-name">{{ getBaseNameFromPath(entry.path) }}</span>
                  <span class="canvas-git-tree-dir">{{ getParentPath(entry.path).replace(/^\/+/, '') || '.' }}</span>
                  <span class="canvas-git-tree-code">{{ entry.untracked ? 'U' : `${entry.indexStatus}`.trim() || `${entry.workingTreeStatus}`.trim() || 'M' }}</span>
                </button>

            </div>
            <div v-else class="sandbox-tree" v-bind="sandboxTreeContainerProps" @contextmenu.prevent="openTreeBlankMenu">
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
                  }" @click="handleTreeRowClick(item.data)" @contextmenu.prevent="openTreeRowMenu($event, item.data)"
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

      <div class="sandbox-main" :class="{ 'is-preview-mode': isPreviewTab }">
        <div v-if="isPreviewTab" class="canvas-preview">
          <div class="canvas-panel-surface canvas-preview-frame">
            <div v-if="!isUsingTempWorkspace" class="canvas-empty-state">
              预览仅支持临时工作区。当前画布正跟随工作路径，可在未设置工作路径时使用预览。
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
          <template v-if="settingsStore.display.canvasEditorTab === 'git'">
            <div class="canvas-panel-surface canvas-code-editor-shell">
              <div v-if="gitSelectedEntry" class="canvas-file-tabs">
                <button type="button" class="canvas-file-tab active">
                  <span class="canvas-file-tab-name">{{ getBaseNameFromPath(gitSelectedEntry.path) }}</span>
                </button>
              </div>
              <div class="canvas-code-editor">
                <template v-if="gitDiffView">
                  <SandboxCodeEditor
                    :model-value="gitDiffView.modifiedText"
                    :original-model-value="gitDiffView.originalText"
                    :path="gitDiffView.modifiedPath"
                    :original-path="gitDiffView.originalPath"
                    :language="getSandboxFileLanguage(gitDiffView.path)"
                    read-only
                  />
                </template>
              </div>
            </div>
          </template>
          <template v-else-if="activeFile">
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

.sandbox-workspace.is-preview-mode {
  display: flex;
  flex-direction: column;
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
  flex-shrink: 0;
}

.sandbox-sidebar-resize {
  height: 100%;
  min-height: 0;
}

.sandbox-main {
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.sandbox-main.is-preview-mode {
  margin-left: 0;
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
  min-height: 26px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  gap: 1px;
  padding: 4px 8px 2px;
  color: var(--sandbox-sidebar-muted);
  font-size: 10px;
  letter-spacing: 0.06em;
}

.sandbox-explorer-group-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.sandbox-explorer-group-heading {
  min-width: 0;
}

.sandbox-explorer-group-title {
  font-weight: 700;
  font-size: 11px;
  line-height: 1;
}

.sandbox-explorer-group-subtitle {
  min-width: 0;
  font-size: 9px;
  color: var(--sandbox-sidebar-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.canvas-git-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.canvas-git-ai-selector {
  position: relative;
  flex-shrink: 0;
}

.canvas-git-ai-selector.is-loading {
  pointer-events: none;
  opacity: 0.7;
}

.canvas-git-ai-selector :deep(.btn) {
  width: auto;
  min-width: 18px;
  height: 18px;
  min-height: 18px;
  padding: 0 3px;
  border-radius: 2px;
  color: transparent;
  position: relative;
}

.canvas-git-ai-selector :deep(.btn:hover) {
  background: var(--sandbox-tool-hover);
}

.canvas-git-ai-selector :deep(.icon-btn),
.canvas-git-ai-selector :deep(img),
.canvas-git-ai-selector :deep(svg) {
  opacity: 0;
  pointer-events: none;
}

.canvas-git-ai-selector :deep(.btn)::after {
  content: 'AI';
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--sandbox-sidebar-muted);
  font-size: 11px;
  font-weight: 600;
}

.canvas-git-ai-selector.is-loading :deep(.btn)::after {
  content: '…';
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

.sidebar-empty {
  min-height: 80px;
}

.canvas-git-compose {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 2px 6px 4px;
  border-bottom: 1px solid var(--sandbox-sidebar-border);
}

.canvas-git-commit-input {
  width: 100%;
  min-height: 24px;
  max-height: 48px;
  resize: none;
  border: 1px solid var(--sandbox-sidebar-border);
  background: transparent;
  color: var(--text-primary);
  padding: 3px 6px;
  font: inherit;
  line-height: 1.2;
}

.canvas-git-commit-input:focus,
.canvas-git-commit-input:focus-visible {
  outline: none;
  border-color: var(--sandbox-sidebar-border);
  box-shadow: none;
}

.canvas-git-commit-primary {
  height: 22px;
  border: 1px solid #0e639c;
  background: #0e639c;
  color: #ffffff;
  font-size: 11px;
  cursor: pointer;
}

.canvas-git-commit-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.canvas-git-tree-row {
  padding-left: 8px;
  padding-right: 8px;
}

.canvas-git-tree-name {
  color: var(--text-primary);
}

.canvas-git-tree-dir {
  min-width: 0;
  flex: 1;
  color: var(--sandbox-sidebar-faint);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.canvas-git-tree-code {
  color: #d7ba7d;
  font-size: 11px;
  font-weight: 700;
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
  height: 24px;
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
  color: #d4d4d4;
}
</style>
