import {
  clearSandboxWorkspace,
  collectSandboxWorkspaceFiles,
  createSandboxState,
  getSandboxMediaType,
  getSandboxTempWorkspacePath,
  getSandboxTempWorkspaceRoot,
  listSandboxWorkspaceDirectory,
  moveSandboxFileInWorkspace,
  normalizeSandboxPath,
  readSandboxFileFromWorkspace,
  readSandboxWorkspace,
  sortSandboxFiles,
  writeSandboxFileToWorkspace,
  deleteSandboxFileFromWorkspace,
  type SandboxFile,
  type SandboxOperationType,
  type SandboxWorkspaceEntry,
  type SandboxState
} from '@renderer/services/sandbox'

type ChatCanvasState = SandboxState

const transientActiveFilePaths = reactive<Record<string, string>>({})
const workspaceRoots = reactive<Record<string, string>>({})

export const useCanvasStore = defineStore(
  'canvas',
  () => {
    const workspaceVersions = ref<Record<string, number>>({})
    const isAfterRestore = Promise.resolve()

    const resolveChatId = (chatId?: string) => {
      if (chatId) return chatId
      return useChatsStores().currentChat?.id || 'default'
    }

    const getAgentWorkspaceDir = (chatId?: string) => {
      const resolvedChatId = resolveChatId(chatId)
      const chat = useChatsStores().allChats.find((item) => item.id === resolvedChatId)
      const workPath = useAgentStore().getAgentById(chat?.agentId || '')?.workPath?.trim()
      if (!workPath) return ''
      return window.api.path.resolve(window.api.path.normalize(workPath))
    }

    const getWorkspaceDir = (chatId?: string) => {
      const resolvedChatId = resolveChatId(chatId)
      return workspaceRoots[resolvedChatId] || getAgentWorkspaceDir(resolvedChatId) || getSandboxTempWorkspacePath(resolvedChatId)
    }

    const bumpWorkspaceVersion = (chatId?: string) => {
      const resolvedChatId = resolveChatId(chatId)
      workspaceVersions.value = {
        ...workspaceVersions.value,
        [resolvedChatId]: (workspaceVersions.value[resolvedChatId] || 0) + 1
      }
    }

    const ensureWorkspace = (chatId?: string) => {
      const resolvedChatId = resolveChatId(chatId)
      const workspaceDir = getWorkspaceDir(resolvedChatId)
      window.api.fs.mkdirSync(workspaceDir, { recursive: true })
      return {
        chatId: resolvedChatId,
        workspaceDir
      }
    }

    const hasWorkspaceSnapshot = (chatId?: string) => {
      try {
        const { workspaceDir } = ensureWorkspace(chatId)
        return window.api.fs.readdirSync(workspaceDir).length > 0
      } catch {
        return false
      }
    }

    const readCanvasFromWorkspace = (chatId?: string) => {
      const resolvedChatId = resolveChatId(chatId)
      const { workspaceDir } = ensureWorkspace(resolvedChatId)
      const baseCanvas = hasWorkspaceSnapshot(resolvedChatId)
        ? readSandboxWorkspace(workspaceDir)
        : createSandboxState()
      const activeFilePath = transientActiveFilePaths[resolvedChatId]

      if (activeFilePath && baseCanvas.files[activeFilePath]) {
        return {
          ...baseCanvas,
          activeFilePath
        }
      }

      return baseCanvas
    }

    const deleteCanvasWorkspace = (chatId: string) => {
      const workspaceDir = getWorkspaceDir(chatId)
      const managedTempWorkspace = getSandboxTempWorkspacePath(chatId)
      if (workspaceDir !== managedTempWorkspace) return
      if (!window.api.fs.existsSync(workspaceDir)) return
      window.api.fs.rmSync(workspaceDir, { recursive: true, force: true })
    }

    const getCanvas = (chatId?: string) => {
      const resolvedChatId = resolveChatId(chatId)
      workspaceVersions.value[resolvedChatId]
      return readCanvasFromWorkspace(resolvedChatId)
    }

    const getActiveFilePath = (chatId?: string) => {
      const resolvedChatId = resolveChatId(chatId)
      const storedActiveFilePath = transientActiveFilePaths[resolvedChatId]
      if (typeof storedActiveFilePath === 'string') {
        return storedActiveFilePath
      }
      return ''
    }

    const getWorkspaceVersion = (chatId?: string) => {
      const resolvedChatId = resolveChatId(chatId)
      return workspaceVersions.value[resolvedChatId] || 0
    }

    const listDirectory = (directoryPath = '/', chatId?: string): SandboxWorkspaceEntry[] => {
      const resolvedChatId = resolveChatId(chatId)
      const workspaceDir = ensureWorkspace(resolvedChatId).workspaceDir
      workspaceVersions.value[resolvedChatId]
      return listSandboxWorkspaceDirectory(workspaceDir, directoryPath)
    }

    const readFile = (filePath: string, chatId?: string): SandboxFile => {
      const resolvedChatId = resolveChatId(chatId)
      const workspaceDir = ensureWorkspace(resolvedChatId).workspaceDir
      workspaceVersions.value[resolvedChatId]
      return readSandboxFileFromWorkspace(workspaceDir, filePath)
    }

    const collectFilePaths = (directoryPath = '/', chatId?: string) => {
      const resolvedChatId = resolveChatId(chatId)
      const workspaceDir = ensureWorkspace(resolvedChatId).workspaceDir
      workspaceVersions.value[resolvedChatId]
      return collectSandboxWorkspaceFiles(workspaceDir, directoryPath)
    }

    const hasAnyFiles = (chatId?: string) => {
      return listDirectory('/', chatId).length > 0
    }

    const setActiveFilePath = (filePath: string, chatId?: string) => {
      const resolvedChatId = resolveChatId(chatId)
      const nextFile = readFile(filePath, resolvedChatId)
      if (transientActiveFilePaths[resolvedChatId] === nextFile.path) return
      transientActiveFilePaths[resolvedChatId] = nextFile.path
      bumpWorkspaceVersion(resolvedChatId)
    }

    const updateFileContent = (filePath: string, content: string, chatId?: string) => {
      const resolvedChatId = resolveChatId(chatId)
      const workspaceDir = ensureWorkspace(resolvedChatId).workspaceDir
      const currentFile = readFile(filePath, resolvedChatId)

      writeSandboxFileToWorkspace(workspaceDir, {
        path: currentFile.path,
        content,
        encoding: 'text',
        mediaType: getSandboxMediaType(currentFile.path),
        updatedAt: Date.now()
      })
      bumpWorkspaceVersion(resolvedChatId)
    }

    const writeFile = (
      file: {
        path: string
        content: string
        encoding?: 'text' | 'data-url'
        mediaType?: string
        updatedAt?: number
      },
      chatId?: string
    ) => {
      const resolvedChatId = resolveChatId(chatId)
      const workspaceDir = ensureWorkspace(resolvedChatId).workspaceDir
      const normalizedPath = normalizeSandboxPath(file.path)
      const nextFile = {
        path: normalizedPath,
        content: file.content,
        encoding: file.encoding === 'data-url' ? 'data-url' : 'text',
        mediaType: file.mediaType || getSandboxMediaType(normalizedPath),
        updatedAt: file.updatedAt || Date.now()
      } as const
      writeSandboxFileToWorkspace(workspaceDir, nextFile)
      if (!transientActiveFilePaths[resolvedChatId]) {
        transientActiveFilePaths[resolvedChatId] = nextFile.path
      }
      bumpWorkspaceVersion(resolvedChatId)
    }

    const importCanvasTemplate = (canvas: ChatCanvasState, chatId?: string) => {
      const resolvedChatId = resolveChatId(chatId)
      const workspaceDir = ensureWorkspace(resolvedChatId).workspaceDir

      clearSandboxWorkspace(workspaceDir)
      sortSandboxFiles(canvas).forEach((file) => {
        writeSandboxFileToWorkspace(workspaceDir, file)
      })

      if (canvas.activeFilePath && canvas.files[canvas.activeFilePath]) {
        transientActiveFilePaths[resolvedChatId] = canvas.activeFilePath
      } else {
        delete transientActiveFilePaths[resolvedChatId]
      }

      bumpWorkspaceVersion(resolvedChatId)
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
      const resolvedChatId = resolveChatId(chatId)
      const workspaceDir = ensureWorkspace(resolvedChatId).workspaceDir
      const type = operation.type || 'modify'
      const sourcePath = normalizeSandboxPath(operation.filePath)

      if (type === 'modify') {
        const file = readFile(sourcePath, resolvedChatId)
        if (typeof operation.oldStr !== 'string' || operation.oldStr.length === 0 || typeof operation.newStr !== 'string') {
          throw new Error('type=modify 需要 old_str 和 new_str')
        }

        const originalContent = file.content
        const nextContent = originalContent.includes(operation.oldStr)
          ? originalContent.replace(operation.oldStr, operation.newStr)
          : (() => {
            const normalizedContent = originalContent.replace(/\r\n/g, '\n')
            const normalizedOldStr = operation.oldStr!.replace(/\r\n/g, '\n')
            if (!normalizedContent.includes(normalizedOldStr)) {
              throw new Error('old_str was not found in the file. Ensure the snippet matches exactly.')
            }
            return normalizedContent.replace(normalizedOldStr, operation.newStr!.replace(/\r\n/g, '\n'))
          })()

        writeSandboxFileToWorkspace(workspaceDir, {
          ...file,
          content: nextContent,
          encoding: 'text',
          updatedAt: Date.now()
        })
        transientActiveFilePaths[resolvedChatId] = sourcePath
        bumpWorkspaceVersion(resolvedChatId)
        return {
          state: createSandboxState(),
          summary: `Successfully replaced content in ${sourcePath}`
        }
      }

      if (type === 'add') {
        if (typeof operation.newStr !== 'string') {
          throw new Error('type=add 需要 new_str')
        }
        const targetPath = sourcePath
        const exists = window.api.fs.existsSync(window.api.path.join(workspaceDir, targetPath.replace(/^\/+/, '')))
        if (exists && !operation.overwrite) {
          throw new Error(`Add file failed: file already exists ${targetPath}. Pass overwrite=true to replace it.`)
        }
        writeSandboxFileToWorkspace(workspaceDir, {
          path: targetPath,
          content: operation.newStr,
          encoding: 'text',
          mediaType: getSandboxMediaType(targetPath),
          updatedAt: Date.now()
        })
        transientActiveFilePaths[resolvedChatId] = targetPath
        bumpWorkspaceVersion(resolvedChatId)
        return {
          state: createSandboxState(),
          summary: exists ? `Successfully wrote file ${targetPath}` : `Successfully created file ${targetPath}`
        }
      }

      if (type === 'delete') {
        deleteSandboxFileFromWorkspace(workspaceDir, sourcePath)
        if (transientActiveFilePaths[resolvedChatId] === sourcePath) {
          delete transientActiveFilePaths[resolvedChatId]
        }
        bumpWorkspaceVersion(resolvedChatId)
        return {
          state: createSandboxState(),
          summary: `Successfully deleted file ${sourcePath}`
        }
      }

      const targetPath = normalizeSandboxPath(operation.targetPath || '')
      if (sourcePath === targetPath) {
        throw new Error('Move file failed: source and destination are the same.')
      }
      moveSandboxFileInWorkspace(
        workspaceDir,
        sourcePath,
        targetPath,
        Boolean(operation.overwrite)
      )
      if (transientActiveFilePaths[resolvedChatId] === sourcePath) {
        transientActiveFilePaths[resolvedChatId] = targetPath
      }
      bumpWorkspaceVersion(resolvedChatId)
      return {
        state: createSandboxState(),
        summary: `Successfully moved file from ${sourcePath} to ${targetPath}`
      }
    }

    const clearCanvas = (chatId?: string) => {
      const resolvedChatId = resolveChatId(chatId)
      const workspaceDir = ensureWorkspace(resolvedChatId).workspaceDir
      clearSandboxWorkspace(workspaceDir)
      delete transientActiveFilePaths[resolvedChatId]
      bumpWorkspaceVersion(resolvedChatId)
    }

    const deleteCanvas = (chatId: string) => {
      delete transientActiveFilePaths[chatId]
      delete workspaceRoots[chatId]
      deleteCanvasWorkspace(chatId)
      bumpWorkspaceVersion(chatId)
    }

    const deleteCanvases = (chatIds: string[]) => {
      if (chatIds.length === 0) return
      chatIds.forEach((chatId) => {
        delete transientActiveFilePaths[chatId]
        delete workspaceRoots[chatId]
        deleteCanvasWorkspace(chatId)
      })
      workspaceVersions.value = { ...workspaceVersions.value }
    }

    const syncWithChats = (chatIds: string[]) => {
      const validIds = new Set(chatIds)
      const workspaceRoot = getSandboxTempWorkspaceRoot()

      Object.keys(transientActiveFilePaths).forEach((chatId) => {
        if (chatId !== 'default' && !validIds.has(chatId)) {
          delete transientActiveFilePaths[chatId]
        }
      })
      Object.keys(workspaceRoots).forEach((chatId) => {
        if (chatId !== 'default' && !validIds.has(chatId)) {
          delete workspaceRoots[chatId]
        }
      })

      if (!window.api.fs.existsSync(workspaceRoot)) return

      window.api.fs.readdirSync(workspaceRoot, { withFileTypes: true }).forEach((entry) => {
        const fullPath = window.api.path.join(workspaceRoot, entry.name)
        const stat = window.api.fs.statSync(fullPath)
        if ((stat.mode & 0o170000) !== 0o040000) return
        if (entry.name === 'default' || validIds.has(entry.name)) return
        deleteCanvasWorkspace(entry.name)
      })
    }

    const touchWorkspace = (chatId?: string) => {
      ensureWorkspace(chatId)
      bumpWorkspaceVersion(chatId)
    }

    const setWorkspaceRoot = (workspaceDir: string, chatId?: string) => {
      const resolvedChatId = resolveChatId(chatId)
      workspaceRoots[resolvedChatId] = window.api.path.resolve(window.api.path.normalize(workspaceDir))
      ensureWorkspace(resolvedChatId)
      delete transientActiveFilePaths[resolvedChatId]
      bumpWorkspaceVersion(resolvedChatId)
    }

    const inheritWorkspaceFromChat = (sourceChatId: string, targetChatId: string) => {
      const sourceWorkspaceDir = getWorkspaceDir(sourceChatId)
      workspaceRoots[targetChatId] = sourceWorkspaceDir

      const sourceActiveFilePath = transientActiveFilePaths[sourceChatId]
      if (sourceActiveFilePath) {
        transientActiveFilePaths[targetChatId] = sourceActiveFilePath
      } else {
        delete transientActiveFilePaths[targetChatId]
      }

      ensureWorkspace(targetChatId)
      bumpWorkspaceVersion(targetChatId)
    }

    const resetWorkspaceRoot = (chatId?: string) => {
      const resolvedChatId = resolveChatId(chatId)
      delete workspaceRoots[resolvedChatId]
      delete transientActiveFilePaths[resolvedChatId]
      ensureWorkspace(resolvedChatId)
      bumpWorkspaceVersion(resolvedChatId)
    }

    const resetActiveFilePath = (chatId?: string) => {
      const resolvedChatId = resolveChatId(chatId)
      delete transientActiveFilePaths[resolvedChatId]
      bumpWorkspaceVersion(resolvedChatId)
    }

    return {
      getCanvas,
      getWorkspaceVersion,
      getWorkspaceDir,
      getActiveFilePath,
      listDirectory,
      readFile,
      collectFilePaths,
      hasAnyFiles,
      setActiveFilePath,
      writeFile,
      importCanvasTemplate,
      updateFileContent,
      applyOperation,
      clearCanvas,
      deleteCanvas,
      deleteCanvases,
      syncWithChats,
      touchWorkspace,
      setWorkspaceRoot,
      inheritWorkspaceFromChat,
      resetWorkspaceRoot,
      resetActiveFilePath,
      isAfterRestore
    }
  }
)
