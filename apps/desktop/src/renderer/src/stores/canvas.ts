import {
  applySandboxOperation,
  createSandboxState,
  ensureSandboxState,
  getSandboxFile,
  setSandboxActiveFile,
  sortSandboxFiles,
  updateSandboxFileContent,
  type SandboxOperationType,
  type SandboxState
} from '@renderer/services/sandbox'

type ChatCanvasState = SandboxState

let resolveRestore: () => void
const restorePromise = new Promise<void>((resolve) => {
  resolveRestore = resolve
})
const transientActiveFilePaths = reactive<Record<string, string>>({})

export const useCanvasStore = defineStore(
  'canvas',
  () => {
    const canvases = ref<Record<string, ChatCanvasState>>({})
    const isAfterRestore = restorePromise

    const resolveChatId = (chatId?: string) => {
      if (chatId) return chatId
      return useChatsStores().currentChat?.id || 'default'
    }

    const createAndStoreCanvas = (chatId?: string) => {
      const resolvedChatId = resolveChatId(chatId)
      const canvas = createSandboxState()
      canvases.value = {
        ...canvases.value,
        [resolvedChatId]: canvas
      }
      transientActiveFilePaths[resolvedChatId] = canvas.activeFilePath
      return { chatId: resolvedChatId, canvas }
    }

    const getCanvas = (chatId?: string) => {
      const resolvedChatId = resolveChatId(chatId)
      const existing = canvases.value[resolvedChatId]
      return existing || createSandboxState()
    }

    const ensureStoredCanvas = (chatId?: string) => {
      const resolvedChatId = resolveChatId(chatId)
      const existing = canvases.value[resolvedChatId]
      if (existing) return { chatId: resolvedChatId, canvas: existing }
      return createAndStoreCanvas(resolvedChatId)
    }

    const replaceCanvas = (canvas: ChatCanvasState, chatId?: string) => {
      const resolvedChatId = resolveChatId(chatId)
      const normalizedCanvas = ensureSandboxState(canvas)
      canvases.value = {
        ...canvases.value,
        [resolvedChatId]: normalizedCanvas
      }
      transientActiveFilePaths[resolvedChatId] = normalizedCanvas.activeFilePath
    }

    const listCanvasFiles = (chatId?: string) => {
      return sortSandboxFiles(getCanvas(chatId))
    }

    const getActiveFilePath = (chatId?: string) => {
      const resolvedChatId = resolveChatId(chatId)
      const storedActiveFilePath = transientActiveFilePaths[resolvedChatId]
      if (typeof storedActiveFilePath === 'string') {
        return storedActiveFilePath
      }
      return getCanvas(chatId).activeFilePath
    }

    const setActiveFilePath = (filePath: string, chatId?: string) => {
      const { chatId: resolvedChatId, canvas } = ensureStoredCanvas(chatId)
      const normalizedState = ensureSandboxState(canvas)
      const nextState = setSandboxActiveFile(normalizedState, filePath)
      if (transientActiveFilePaths[resolvedChatId] === nextState.activeFilePath) return
      transientActiveFilePaths[resolvedChatId] = nextState.activeFilePath
    }

    const getActiveFile = (chatId?: string) => {
      return getSandboxFile(getCanvas(chatId), getActiveFilePath(chatId))
    }

    const updateFileContent = (filePath: string, content: string, chatId?: string) => {
      replaceCanvas(updateSandboxFileContent(getCanvas(chatId), filePath, content), chatId)
    }

    const updateActiveFileContent = (content: string, chatId?: string) => {
      const activeFilePath = getActiveFilePath(chatId)
      updateFileContent(activeFilePath, content, chatId)
    }

    const applyOperation = (
      operation: {
        type?: SandboxOperationType
        filePath: string
        oldStr?: string
        newStr?: string
        targetPath?: string
        overwrite?: boolean
      },
      chatId?: string
    ) => {
      const result = applySandboxOperation(getCanvas(chatId), operation)
      replaceCanvas(result.state, chatId)
      return result
    }

    const clearCanvas = (chatId?: string) => {
      const resolvedChatId = resolveChatId(chatId)
      if (!canvases.value[resolvedChatId]) {
        createAndStoreCanvas(chatId)
        return
      }
      replaceCanvas(createSandboxState(), chatId)
    }

    const deleteCanvas = (chatId: string) => {
      const nextCanvases = { ...canvases.value }
      delete nextCanvases[chatId]
      canvases.value = nextCanvases
      delete transientActiveFilePaths[chatId]
    }

    const deleteCanvases = (chatIds: string[]) => {
      if (chatIds.length === 0) return
      const ids = new Set(chatIds)
      canvases.value = Object.fromEntries(
        Object.entries(canvases.value).filter(([chatId]) => !ids.has(chatId))
      )
      Object.keys(transientActiveFilePaths).forEach((chatId) => {
        if (ids.has(chatId)) {
          delete transientActiveFilePaths[chatId]
        }
      })
    }

    const syncWithChats = (chatIds: string[]) => {
      const validIds = new Set(chatIds)
      canvases.value = Object.fromEntries(
        Object.entries(canvases.value).filter(([chatId]) => chatId === 'default' || validIds.has(chatId))
      )
      Object.keys(transientActiveFilePaths).forEach((chatId) => {
        if (chatId !== 'default' && !validIds.has(chatId)) {
          delete transientActiveFilePaths[chatId]
        }
      })
    }

    return {
      canvases,
      getCanvas,
      replaceCanvas,
      listCanvasFiles,
      getActiveFilePath,
      setActiveFilePath,
      getActiveFile,
      updateFileContent,
      updateActiveFileContent,
      applyOperation,
      clearCanvas,
      deleteCanvas,
      deleteCanvases,
      syncWithChats,
      isAfterRestore
    }
  },
  {
    persist: {
      paths: ['canvases'],
      afterRestore: () => {
        resolveRestore()
      }
    }
  }
)
