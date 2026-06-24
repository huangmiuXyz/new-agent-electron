import { ref, computed, type ComputedRef } from 'vue'
import {
  getSandboxMediaType,
  normalizeSandboxPath,
  type SandboxFile,
} from '@renderer/services/sandbox'
import { isTextFile } from '@renderer/utils'

export function useCanvasFileEditor(options: {
  currentChatId: ComputedRef<string | undefined>
  currentWorkspaceDir: ComputedRef<string>
}) {
  const message = messageApi
  const modal = useModal()

  const openFileTabs = ref<string[]>([])
  const fileDrafts = ref<Record<string, string>>({})
  const activeFile = ref<SandboxFile | null>(null)

  const ensureFileTabOpen = (filePath: string) => {
    if (!filePath) return
    if (!openFileTabs.value.includes(filePath)) {
      openFileTabs.value = [...openFileTabs.value, filePath]
    }
  }

  const hasDraftForFile = (filePath: string) =>
    Object.prototype.hasOwnProperty.call(fileDrafts.value, filePath)

  const currentWorkspaceDir = options.currentWorkspaceDir
  const currentChatId = options.currentChatId

  const getPersistedFile = (filePath: string, opts?: { force?: boolean }) => {
    if (!filePath) return null
    if (!opts?.force && activeFile.value?.path === filePath) {
      return activeFile.value
    }
    try {
      if (!isTextFile(filePath)) {
        const normalizedPath = normalizeSandboxPath(filePath)
        const workspaceDir = currentWorkspaceDir.value
        const fullPath = window.api.path.join(workspaceDir, normalizedPath.replace(/^\/+/, ''))
        if (!window.api.fs.existsSync(fullPath)) return null
        const stat = window.api.fs.statSync(fullPath)
        return {
          path: normalizedPath,
          content: '',
          encoding: 'data-url' as const,
          mediaType: getSandboxMediaType(normalizedPath),
          updatedAt: stat.mtimeMs || Date.now()
        }
      }
      const canvasStore = useCanvasStore()
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

  const currentTabFilePath = computed(() => {
    const canvasStore = useCanvasStore()
    const filePath = canvasStore.getActiveFilePath(options.currentChatId.value)
    return filePath && openFileTabs.value.includes(filePath) ? filePath : ''
  })

  const saveActiveFile = () => {
    const filePath = currentTabFilePath.value
    if (!filePath || !activeFile.value) return
    if (!isActiveFileDirty.value) return

    const canvasStore = useCanvasStore()
    canvasStore.updateFileContent(filePath, getDraftContent(filePath), options.currentChatId.value)
    message.success(`已保存 ${filePath}`)
  }

  const saveDraftForFile = (filePath: string) => {
    const currentFile = getPersistedFile(filePath)
    if (!currentFile) return
    const draftContent = getDraftContent(filePath)
    if (draftContent === currentFile.content) return
    const canvasStore = useCanvasStore()
    canvasStore.updateFileContent(filePath, draftContent, options.currentChatId.value)
  }

  const closeFileTabs = async (filePaths: string[]) => {
    const targetPaths = Array.from(new Set(filePaths)).filter((filePath) =>
      openFileTabs.value.includes(filePath)
    )
    if (targetPaths.length === 0) return

    const dirtyPaths = targetPaths.filter((filePath) => {
      const currentFile = getPersistedFile(filePath)
      if (!currentFile) return false
      return getDraftContent(filePath) !== currentFile.content
    })

    if (dirtyPaths.length > 0) {
      const shouldSave = await modal.confirm({
        title: targetPaths.length === 1 ? '关闭标签页' : '批量关闭标签页',
        content:
          dirtyPaths.length === 1
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

    const canvasStore = useCanvasStore()
    if (!targetPaths.includes(canvasStore.getActiveFilePath(options.currentChatId.value))) return

    const nextActiveFilePath = nextTabs[nextTabs.length - 1] || ''
    if (nextActiveFilePath) {
      canvasStore.setActiveFilePath(nextActiveFilePath, options.currentChatId.value)
    }
  }

  const closeFileTab = async (filePath: string) => {
    await closeFileTabs([filePath])
  }

  const getPersistedFileContent = (filePath: string) => {
    const file = getPersistedFile(filePath)
    return file?.content || ''
  }

  return {
    openFileTabs,
    fileDrafts,
    activeFile,
    currentTabFilePath,
    activeFileContent,
    isActiveFileDirty,
    ensureFileTabOpen,
    hasDraftForFile,
    getPersistedFile,
    getDraftContent,
    setDraftContent,
    saveActiveFile,
    saveDraftForFile,
    closeFileTabs,
    closeFileTab,
  }
}
