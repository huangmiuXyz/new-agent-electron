import { computed, type ComputedRef } from 'vue'

export function useCanvasActions(options: {
  currentChatId: ComputedRef<string | undefined>
  currentWorkspaceDir: ComputedRef<string>
  isUsingTempWorkspace: ComputedRef<boolean>
  hasCanvasFiles: ComputedRef<boolean>
  syncWorkspaceView: () => void
  previewReady: { value: boolean }
}) {
  const message = messageApi
  const modal = useModal()
  const myAppsStore = useMyAppsStore()
  const chatsStore = useChatsStores()

  const suggestedAppName = computed(() => {
    const title = String(chatsStore.currentChat?.title || '').trim()
    return title || '未命名应用'
  })

  const openSaveAppModal = () => {
    if (!options.isUsingTempWorkspace.value) {
      message.warning('保存应用仅支持临时工作区')
      return
    }
    if (!options.hasCanvasFiles.value) {
      message.warning('当前画布还没有文件，先生成或创建内容后再保存应用')
      return
    }
    const [FormComponent, formActions] = useForm({
      fields: [
        { name: 'name', label: '应用名称', type: 'text', placeholder: '给这个应用起个名字', required: true },
        { name: 'iconEmoji', label: '图标', type: 'text', placeholder: '例如 ✨' },
        { name: 'description', label: '描述', type: 'textarea', placeholder: '简单描述这个应用是做什么的', rows: 3 }
      ],
      initialData: { name: suggestedAppName.value, iconEmoji: '✨', description: '' },
      onSubmit: (data) => {
        const canvasStore = useCanvasStore()
        const savedApp = myAppsStore.saveApp({
          name: String(data.name || '').trim(),
          description: String(data.description || '').trim(),
          iconEmoji: String(data.iconEmoji || '').trim() || '✨',
          canvas: canvasStore.getCanvas(options.currentChatId.value),
          sourceChatId: options.currentChatId.value || null
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
      onOk: () => { formActions.submit() }
    })
  }

  const openCanvasInTerminal = async () => {
    if (!options.hasCanvasFiles.value) {
      message.warning('当前画布还没有文件，先生成或创建内容后再打开终端')
      return
    }
    const closeLoading = message.loading('正在同步并打开终端...')
    try {
      const workspaceDir = options.currentWorkspaceDir.value
      await window.api.fs.promises.mkdir(workspaceDir, { recursive: true })
      const { createTab } = useTerminal()
      await createTab({ cwd: workspaceDir, promptLabel: 'canvas', showTerminal: true })
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
      const workspaceDir = options.currentWorkspaceDir.value
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
    const workspaceDir = options.currentWorkspaceDir.value
    if (!window.api.fs.existsSync(workspaceDir)) {
      message.warning('本地文件夹还不存在，请先打开本地文件夹或在终端中打开')
      return
    }
    const closeLoading = message.loading('正在从本地文件夹同步...')
    try {
      const canvasStore = useCanvasStore()
      canvasStore.touchWorkspace(options.currentChatId.value)
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
    const canvasStore = useCanvasStore()
    canvasStore.setWorkspaceRoot(result.filePaths[0], options.currentChatId.value)
    options.previewReady.value = false
    useSettingsStore().display.canvasEditorTab = 'code'
    options.syncWorkspaceView()
    message.success(`已切换到本地文件夹：${result.filePaths[0]}`)
  }

  const switchToTempWorkspace = () => {
    const canvasStore = useCanvasStore()
    canvasStore.useTempWorkspace(options.currentChatId.value)
    options.previewReady.value = false
    options.syncWorkspaceView()
    message.success('已切换回临时工作区')
  }

  const switchToCurrentAgentWorkspace = () => {
    const canvasStore = useCanvasStore()
    canvasStore.resetWorkspaceRoot(options.currentChatId.value)
    options.previewReady.value = false
    options.syncWorkspaceView()
    message.success('已切换到当前智能体的工作路径')
  }

  const toggleCanvasWorkspaceRoot = () => {
    if (options.isUsingTempWorkspace.value) {
      switchToCurrentAgentWorkspace()
      return
    }
    switchToTempWorkspace()
  }

  return {
    openSaveAppModal,
    openCanvasInTerminal,
    openCanvasInLocalFolder,
    syncLocalFolderToCanvas,
    chooseLocalWorkspaceFolder,
    switchToTempWorkspace,
    switchToCurrentAgentWorkspace,
    toggleCanvasWorkspaceRoot,
  }
}
