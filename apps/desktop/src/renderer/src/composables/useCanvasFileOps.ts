import { computed, type ComputedRef } from 'vue'
import {
  getSandboxMediaType,
  normalizeSandboxPath,
  parseSandboxDataUrl,
  sortSandboxFiles,
  type SandboxFile,
} from '@renderer/services/sandbox'
import { isTextFile } from '@renderer/utils'
import { blobToDataURL } from 'blob-util'
import JSZip from 'jszip'

export function useCanvasFileOps(options: {
  currentChatId: ComputedRef<string | undefined>
  currentWorkspaceDir: ComputedRef<string>
  isUsingTempWorkspace: ComputedRef<boolean>
  hasCanvasFiles: ComputedRef<boolean>
  getPersistedFile: (path: string, opts?: { force?: boolean }) => SandboxFile | null
  ensureFileTabOpen: (path: string) => void
  revealFileAncestors: (path?: string) => void
  refreshTreeDirectories: (paths: string[]) => void
}) {
  const message = messageApi
  const modal = useModal()

  const suggestedAppName = computed(() => {
    const title = String(useChatsStores().currentChat?.title || '').trim()
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

  const getWorkspaceFsPath = (sandboxPath = '/') => {
    if (sandboxPath === '/') return options.currentWorkspaceDir.value
    const relativePath = normalizeSandboxPath(sandboxPath).replace(/^\/+/, '')
    return window.api.path.join(options.currentWorkspaceDir.value, ...relativePath.split('/'))
  }

  const getBaseNameFromPath = (path: string) =>
    path.split('/').filter(Boolean).pop() || path || 'untitled'

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

  const getRowFilePaths = (rowPath: string, rowType: 'file' | 'directory') => {
    if (rowType === 'file') return [rowPath]
    const canvasStore = useCanvasStore()
    return canvasStore.collectFilePaths(rowPath, options.currentChatId.value)
  }

  const buildSiblingPath = (path: string, nextName: string) => {
    const parentPath = path === '/' ? '' : getParentPath(path)
    const trimmedName = String(nextName || '')
      .trim()
      .replaceAll('\\', '/')
    if (!trimmedName || trimmedName.includes('/')) {
      throw new Error('名称不能为空，且不能包含 / 或 \\')
    }
    return normalizeSandboxPath(parentPath ? `${parentPath}/${trimmedName}` : `/${trimmedName}`)
  }

  const downloadCurrentFile = (filePath: string) => {
    const file = options.getPersistedFile(filePath)
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
            return new Blob([bytes], {
              type: parsedDataUrl.mediaType || file.mediaType || 'application/octet-stream'
            })
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

  const downloadDirectoryAsZip = async (rowPath: string, rowName: string, rowType: string) => {
    if (rowType !== 'directory') return
    const filePaths = getRowFilePaths(rowPath, rowType as 'directory')
    if (filePaths.length === 0) {
      message.warning('当前目录下没有可下载的文件')
      return
    }
    try {
      const zip = new JSZip()
      filePaths.forEach((filePath: string) => {
        const file = options.getPersistedFile(filePath)
        if (!file) return
        const zipPath = filePath.slice(rowPath.length + 1)
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
      const fileName = `${sanitizeDownloadName(rowName)}.zip`
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      message.success(`已开始下载目录：${rowPath}`)
    } catch (error) {
      console.error('Sandbox directory zip download error:', error)
      message.error('下载目录失败')
    }
  }

  const downloadAppAsZip = async () => {
    if (!options.isUsingTempWorkspace.value) {
      message.warning('下载应用仅支持临时工作区')
      return
    }
    if (!options.hasCanvasFiles.value) {
      message.warning('当前画布还没有文件，先生成或创建内容后再下载应用')
      return
    }
    try {
      const zip = new JSZip()
      const canvasStore = useCanvasStore()
      const canvasSnapshot = canvasStore.getCanvas(options.currentChatId.value)
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
      confirmProps: { danger: true },
      confirmText: '清空',
      cancelText: '取消',
      onOk: () => {
        const canvasStore = useCanvasStore()
        canvasStore.clearCanvas(options.currentChatId.value)
        message.success('画布已清空')
        modal.remove()
      }
    })
  }

  const createFile = (directoryPath = '/') => {
    const normalizedDirectoryPath = directoryPath === '/' ? '/' : normalizeSandboxPath(directoryPath)
    const defaultFilePath =
      normalizedDirectoryPath === '/' ? '/new-file.js' : `${normalizedDirectoryPath}/new-file.js`
    const [FormComponent, formActions] = useForm({
      fields: [
        {
          name: 'path',
          label: '文件路径',
          type: 'text',
          placeholder:
            normalizedDirectoryPath === '/'
              ? '例如 /components/card.js'
              : `例如 ${normalizedDirectoryPath}/index.js`,
          required: true
        }
      ],
      initialData: { path: defaultFilePath },
      onSubmit: (data) => {
        try {
          const filePath = normalizeSandboxPath(String(data.path || ''))
          const canvasStore = useCanvasStore()
          canvasStore.applyOperation(
            { type: 'add', filePath, newStr: '' },
            options.currentChatId.value
          )
          options.ensureFileTabOpen(filePath)
          useCanvasStore().setActiveFilePath(filePath, options.currentChatId.value)
          options.revealFileAncestors(filePath)
          options.refreshTreeDirectories([getParentPath(filePath) || '/'])
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
      onOk: () => { formActions.submit() }
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
      initialData: { name: 'new-folder' },
      onSubmit: (data) => {
        try {
          const nextDirectoryPath = buildSiblingPath(
            `${normalizedDirectoryPath}/placeholder`,
            String(data.name || '')
          )
          const targetFsPath = getWorkspaceFsPath(nextDirectoryPath)
          if (window.api.fs.existsSync(targetFsPath)) {
            throw new Error(`目标已存在：${nextDirectoryPath}`)
          }
          window.api.fs.mkdirSync(targetFsPath, { recursive: true })
          const canvasStore = useCanvasStore()
          if (normalizedDirectoryPath !== '/') {
            options.refreshTreeDirectories([normalizedDirectoryPath])
          }
          canvasStore.touchWorkspace(options.currentChatId.value)
          options.refreshTreeDirectories([normalizedDirectoryPath, nextDirectoryPath])
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
      onOk: () => { formActions.submit() }
    })
  }

  const renameTreeRow = (rowPath: string, rowName: string, rowType: string) => {
    const [FormComponent, formActions] = useForm({
      fields: [
        {
          name: 'name',
          label: '名称',
          type: 'text',
          placeholder: rowType === 'directory' ? '例如 components' : '例如 index.html',
          required: true
        }
      ],
      initialData: { name: rowName },
      onSubmit: (data) => {
        try {
          const nextBasePath = buildSiblingPath(rowPath, String(data.name || ''))
          if (nextBasePath === rowPath) {
            modal.remove()
            return
          }
          const sourceFsPath = getWorkspaceFsPath(rowPath)
          const targetFsPath = getWorkspaceFsPath(nextBasePath)
          if (!window.api.fs.existsSync(sourceFsPath)) {
            throw new Error(rowType === 'directory' ? '目录不存在' : '文件不存在')
          }
          if (window.api.fs.existsSync(targetFsPath)) {
            throw new Error(`目标已存在：${nextBasePath}`)
          }
          window.api.fs.mkdirSync(window.api.path.dirname(targetFsPath), { recursive: true })
          window.api.fs.renameSync(sourceFsPath, targetFsPath)
          const canvasStore = useCanvasStore()
          canvasStore.touchWorkspace(options.currentChatId.value)
          options.refreshTreeDirectories([rowPath, nextBasePath])
          message.success(
            rowType === 'directory'
              ? `已重命名目录为 ${nextBasePath}`
              : `已重命名文件为 ${nextBasePath}`
          )
          modal.remove()
        } catch (error) {
          message.error((error as Error).message)
        }
      }
    })
    modal.confirm({
      title: rowType === 'directory' ? '重命名目录' : '重命名文件',
      content: FormComponent,
      confirmText: '确定',
      cancelText: '取消',
      onOk: () => { formActions.submit() }
    })
  }

  const deleteTreeRow = async (rowPath: string, rowType: string) => {
    const fsPath = getWorkspaceFsPath(rowPath)
    if (!window.api.fs.existsSync(fsPath)) {
      message.warning(rowType === 'directory' ? '目录不存在' : '文件不存在')
      return
    }
    const filePaths = getRowFilePaths(rowPath, rowType as 'file' | 'directory')
    const confirmed = await modal.confirm({
      title: rowType === 'directory' ? '删除目录' : '删除文件',
      content:
        rowType === 'directory'
          ? `确定删除 ${rowPath}${filePaths.length > 0 ? ` 及其下 ${filePaths.length} 个文件` : ''}吗？`
          : `确定删除 ${rowPath} 吗？`,
      confirmProps: { danger: true },
      confirmText: '删除',
      cancelText: '取消'
    })
    if (!confirmed) return
    try {
      window.api.fs.rmSync(fsPath, { recursive: true, force: true })
      const canvasStore = useCanvasStore()
      canvasStore.touchWorkspace(options.currentChatId.value)
      options.refreshTreeDirectories([getParentPath(rowPath) || '/'])
      message.success(rowType === 'directory' ? `已删除目录 ${rowPath}` : `已删除文件 ${rowPath}`)
    } catch (error) {
      message.error((error as Error).message)
    }
  }

  const isDirectoryStat = (stat: { mode?: number | null }) =>
    (Number(stat.mode) & 0o170000) === 0o040000

  const isFileStat = (stat: { mode?: number | null }) =>
    (Number(stat.mode) & 0o170000) === 0o100000

  const readLocalDirectoryFiles = async (
    directoryPath: string,
    basePath = directoryPath
  ): Promise<{ absolutePath: string; relativePath: string }[]> => {
    const results: { absolutePath: string; relativePath: string }[] = []
    const entries = await window.api.fs.promises.readdir(directoryPath, { withFileTypes: true })
    for (const entry of entries) {
      const absolutePath = window.api.path.join(directoryPath, entry.name)
      const stat = await window.api.fs.promises.stat(absolutePath)
      if (isDirectoryStat(stat)) {
        const childResults = await readLocalDirectoryFiles(absolutePath, basePath)
        results.push(...childResults)
        continue
      }
      if (!isFileStat(stat)) continue
      results.push({
        absolutePath,
        relativePath: window.api.path.relative(basePath, absolutePath).replaceAll('\\', '/')
      })
    }
    return results
  }

  const createCanvasFileFromLocalPath = async (
    absolutePath: string,
    relativePath: string,
    directoryPath?: string
  ): Promise<{
    path: string
    content: string
    encoding: 'text' | 'data-url'
    mediaType?: string
    updatedAt: number
  }> => {
    const baseDirectory = directoryPath ? normalizeSandboxPath(directoryPath) : ''
    const normalizedPath = normalizeSandboxPath(
      baseDirectory ? `${baseDirectory}/${relativePath}` : relativePath
    )
    const mediaType = getSandboxMediaType(normalizedPath)
    if (!isTextFile(normalizedPath)) {
      const bytes = await window.api.fs.promises.readFile(absolutePath)
      const content = await blobToDataURL(new Blob([bytes], { type: mediaType }))
      return { path: normalizedPath, content, encoding: 'data-url' as const, mediaType, updatedAt: Date.now() }
    }
    return {
      path: normalizedPath,
      content: await window.api.fs.promises.readFile(absolutePath, 'utf-8'),
      encoding: 'text' as const,
      mediaType,
      updatedAt: Date.now()
    }
  }

  const importLocalPathsToCanvas = async (
    fileInfos: { absolutePath: string; relativePath: string }[],
    directoryPath = '/'
  ) => {
    try {
      if (fileInfos.length === 0) return
      const importedFiles = await Promise.all(
        fileInfos.map(({ absolutePath, relativePath }) =>
          createCanvasFileFromLocalPath(absolutePath, relativePath, directoryPath)
        )
      )
      const canvasStore = useCanvasStore()
      importedFiles.forEach((file) => {
        canvasStore.writeFile(file, options.currentChatId.value)
      })
      const normalizedDirectoryPath = normalizeSandboxPath(directoryPath)
      options.refreshTreeDirectories([
        normalizedDirectoryPath,
        ...importedFiles.map((file) => getParentPath(file.path) || '/')
      ])
      const successText =
        normalizedDirectoryPath === '/'
          ? `已上传 ${importedFiles.length} 个文件`
          : `已上传 ${importedFiles.length} 个文件到 ${normalizedDirectoryPath}`
      message.success(successText)
    } catch (error) {
      console.error('Canvas local upload error:', error)
      message.error((error as Error).message || '上传文件失败')
    }
  }

  const uploadCanvasFiles = async (directoryPath = '/') => {
    const result = await window.api.showOpenDialog({
      title: '上传文件到画布',
      properties: ['openFile', 'multiSelections']
    })
    if (result.canceled || !result.filePaths?.length) return
    const fileInfos = result.filePaths.map((absolutePath: string) => ({
      absolutePath,
      relativePath: window.api.path.basename(absolutePath)
    }))
    await importLocalPathsToCanvas(fileInfos, directoryPath)
  }

  const uploadCanvasFolder = async (directoryPath = '/') => {
    const result = await window.api.showOpenDialog({
      title: '上传文件夹到画布',
      properties: ['openDirectory']
    })
    if (result.canceled || !result.filePaths?.[0]) return
    const selectedDirectoryPath = result.filePaths[0]
    const directoryName = window.api.path.basename(selectedDirectoryPath)
    const files = await readLocalDirectoryFiles(selectedDirectoryPath)
    const fileInfos = files.map((file: any) => ({
      ...file,
      relativePath: [directoryName, file.relativePath].filter(Boolean).join('/')
    }))
    await importLocalPathsToCanvas(fileInfos, directoryPath)
  }

  return {
    suggestedAppName,
    downloadCurrentFile,
    downloadDirectoryAsZip,
    downloadAppAsZip,
    clearCanvas,
    createFile,
    createFolder,
    renameTreeRow,
    deleteTreeRow,
    uploadCanvasFiles,
    uploadCanvasFolder,
    getFileExtensionLabel,
  }
}
