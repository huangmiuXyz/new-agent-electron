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

export const useCanvasStore = defineStore(
  'canvas',
  () => {
    const canvases = ref<Record<string, ChatCanvasState>>({})

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
      return { chatId: resolvedChatId, canvas }
    }

    const getCanvas = (chatId?: string) => {
      const resolvedChatId = resolveChatId(chatId)
      const existing = canvases.value[resolvedChatId]
      return existing ? ensureSandboxState(existing) : createSandboxState()
    }

    const replaceCanvas = (canvas: ChatCanvasState, chatId?: string) => {
      const resolvedChatId = resolveChatId(chatId)
      canvases.value = {
        ...canvases.value,
        [resolvedChatId]: ensureSandboxState(canvas)
      }
    }

    const listCanvasFiles = (chatId?: string) => {
      return sortSandboxFiles(getCanvas(chatId))
    }

    const getActiveFilePath = (chatId?: string) => {
      return getCanvas(chatId).activeFilePath
    }

    const setActiveFilePath = (filePath: string, chatId?: string) => {
      replaceCanvas(setSandboxActiveFile(getCanvas(chatId), filePath), chatId)
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

    return {
      canvases,
      getCanvas,
      listCanvasFiles,
      getActiveFilePath,
      setActiveFilePath,
      getActiveFile,
      updateFileContent,
      updateActiveFileContent,
      applyOperation,
      clearCanvas
    }
  },
  {
    persist: {
      paths: ['canvases']
    }
  }
)
