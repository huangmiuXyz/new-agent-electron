import { ref, type ComputedRef } from 'vue'
import {
  normalizeSandboxPath,
} from '@renderer/services/sandbox'
import { isTextFile } from '@renderer/utils'
import { blobToDataURL } from 'blob-util'

export function useCanvasDragDrop(options: {
  currentChatId: ComputedRef<string | undefined>
  currentWorkspaceDir: ComputedRef<string>
  syncWorkspaceView: () => void
  expandDirectory?: (path: string) => void
  sandboxTreeRows?: ComputedRef<any[]>
}) {
  const message = messageApi
  const isCanvasDragOver = ref(false)
  const dragDepth = ref(0)
  const draggingCanvasFilePath = ref('')
  const dragTargetDirectoryPath = ref('')
  const CANVAS_FILE_DRAG_MIME = 'application/x-agent-qi-canvas-file'

  const hasFileDrag = (event: DragEvent) => {
    return Array.from(event.dataTransfer?.types || []).includes('Files')
  }

  const hasCanvasFileDrag = (event: DragEvent) => {
    return Array.from(event.dataTransfer?.types || []).includes(CANVAS_FILE_DRAG_MIME)
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

  const handleCanvasDrop = (event: DragEvent, onDropData: (dt: DataTransfer, dir?: string) => void) => {
    if (!hasFileDrag(event)) return
    event.preventDefault()
    resetDragState()
    void onDropData(event.dataTransfer!)
  }

  const handleTreeRowDragStart = (row: any, event: DragEvent) => {
    if ((row.type !== 'file' && row.type !== 'directory') || !event.dataTransfer) return
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(CANVAS_FILE_DRAG_MIME, row.path)
    draggingCanvasFilePath.value = row.path
  }

  const handleTreeRowDragEnd = () => {
    draggingCanvasFilePath.value = ''
    dragTargetDirectoryPath.value = ''
  }

  const handleDirectoryDragEnter = (row: any, event: DragEvent) => {
    if (row.type !== 'directory') return
    if (!hasFileDrag(event) && !hasCanvasFileDrag(event)) return
    event.preventDefault()
    event.stopPropagation()
    dragTargetDirectoryPath.value = row.path
    options.expandDirectory?.(row.path)
  }

  const handleDirectoryDragOver = (row: any, event: DragEvent) => {
    if (row.type !== 'directory') return
    if (!hasFileDrag(event) && !hasCanvasFileDrag(event)) return
    if (draggingCanvasFilePath.value) {
      const normalizedDraggingPath = normalizeSandboxPath(draggingCanvasFilePath.value)
      const normalizedTargetPath = normalizeSandboxPath(row.path)
      if (normalizedTargetPath.startsWith(normalizedDraggingPath + '/')) {
        return
      }
    }
    event.preventDefault()
    event.stopPropagation()
    dragTargetDirectoryPath.value = row.path
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = hasCanvasFileDrag(event) ? 'move' : 'copy'
    }
  }

  const handleDirectoryDragLeave = (row: any, event: DragEvent) => {
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

  const createCanvasFileFromDrop = async (
    file: File,
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

  const getAllFilesFromDataTransfer = async (
    dataTransfer: DataTransfer
  ): Promise<{ file: File; relativePath: string }[]> => {
    const items = dataTransfer.items
    if (!items || items.length === 0) {
      return Array.from(dataTransfer.files).map((file) => ({
        file,
        relativePath: file.name
      }))
    }

    const results: { file: File; relativePath: string }[] = []
    for (let i = 0; i < items.length; i += 1) {
      const entry = items[i].webkitGetAsEntry()
      if (!entry) {
        const file = items[i].getAsFile()
        if (file) {
          results.push({ file, relativePath: file.name })
        }
        continue
      }
      const childResults = await readAllFilesFromEntry(entry)
      results.push(...childResults)
    }
    return results
  }

  const readAllFilesFromEntry = async (
    entry: FileSystemEntry,
    basePath: string = ''
  ): Promise<{ file: File; relativePath: string }[]> => {
    const results: { file: File; relativePath: string }[] = []
    if (entry.isFile) {
      const fileEntry = entry as FileSystemFileEntry
      const file = await new Promise<File>((resolve, reject) => {
        fileEntry.file(resolve, reject)
      })
      results.push({ file, relativePath: basePath ? `${basePath}/${entry.name}` : entry.name })
    } else if (entry.isDirectory) {
      const dirEntry = entry as FileSystemDirectoryEntry
      const reader = dirEntry.createReader()
      const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
        reader.readEntries(resolve, reject)
      })
      for (const childEntry of entries) {
        const childResults = await readAllFilesFromEntry(
          childEntry,
          basePath ? `${basePath}/${entry.name}` : entry.name
        )
        results.push(...childResults)
      }
    }
    return results
  }

  const handleDroppedDataTransfer = async (dataTransfer: DataTransfer, directoryPath?: string) => {
    try {
      const currentWorkPath = useCanvasStore().getWorkPath(options.currentChatId.value)
      if (currentWorkPath) {
        useCanvasStore().useTempWorkspace(options.currentChatId.value)
        options.syncWorkspaceView()
      }

      const fileInfos = await getAllFilesFromDataTransfer(dataTransfer)
      if (fileInfos.length === 0) return

      const droppedFiles = await Promise.all(
        fileInfos.map(({ file, relativePath }) =>
          createCanvasFileFromDrop(file, relativePath, directoryPath)
        )
      )

      const canvasStore = useCanvasStore()
      droppedFiles.forEach((file) => {
        canvasStore.writeFile(file, options.currentChatId.value)
      })
      const successText = directoryPath
        ? `已导入 ${droppedFiles.length} 个文件到 ${normalizeSandboxPath(directoryPath)}`
        : `已导入 ${droppedFiles.length} 个文件`
      const switchedNotice = currentWorkPath ? '（已切换到临时工作区）' : ''
      message.success(`${successText}${switchedNotice}`)
    } catch (error) {
      console.error('Canvas drop import error:', error)
      message.error((error as Error).message || '导入文件失败')
    }
  }

  const moveCanvasFileToDirectory = (sourcePath: string, directoryPath: string) => {
    const normalizedSourcePath = normalizeSandboxPath(sourcePath)
    const normalizedDirectoryPath = normalizeSandboxPath(directoryPath)
    const targetPath = normalizeSandboxPath(
      `${normalizedDirectoryPath}/${sourcePath.split('/').filter(Boolean).pop() || ''}`
    )

    if (normalizedSourcePath === targetPath) return

    const canvasStore = useCanvasStore()
    canvasStore.applyOperation(
      {
        type: 'move',
        filePath: normalizedSourcePath,
        targetPath
      },
      options.currentChatId.value
    )
    options.syncWorkspaceView()
    const isDirectory = options.sandboxTreeRows?.value?.some(
      (row: any) => row.path === normalizedSourcePath && row.type === 'directory'
    )
    const itemText = isDirectory ? '文件夹' : '文件'
    message.success(`已移动${itemText}到 ${normalizedDirectoryPath}`)
  }

  const handleDirectoryDrop = (row: any, event: DragEvent) => {
    if (row.type !== 'directory') return
    if (!hasFileDrag(event) && !hasCanvasFileDrag(event)) return

    event.preventDefault()
    event.stopPropagation()
    dragTargetDirectoryPath.value = ''
    isCanvasDragOver.value = false
    dragDepth.value = 0

    const canvasFilePath =
      event.dataTransfer?.getData(CANVAS_FILE_DRAG_MIME) || draggingCanvasFilePath.value
    if (canvasFilePath) {
      draggingCanvasFilePath.value = ''
      try {
        moveCanvasFileToDirectory(canvasFilePath, row.path)
      } catch (error) {
        message.error((error as Error).message || '移动文件失败')
      }
      return
    }

    void handleDroppedDataTransfer(event.dataTransfer!, row.path)
  }

  return {
    isCanvasDragOver,
    dragDepth,
    draggingCanvasFilePath,
    dragTargetDirectoryPath,
    hasFileDrag,
    hasCanvasFileDrag,
    resetDragState,
    handleCanvasDragEnter,
    handleCanvasDragOver,
    handleCanvasDragLeave,
    handleCanvasDrop,
    handleTreeRowDragStart,
    handleTreeRowDragEnd,
    handleDirectoryDragEnter,
    handleDirectoryDragOver,
    handleDirectoryDragLeave,
    handleDirectoryDrop,
    handleDroppedDataTransfer,
    createCanvasFileFromDrop,
    getAllFilesFromDataTransfer,
    moveCanvasFileToDirectory,
  }
}
