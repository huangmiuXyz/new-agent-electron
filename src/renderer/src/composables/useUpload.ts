import { useDropZone } from '@vueuse/core'
import { FileUIPart } from 'ai'
export interface UploadFile extends FileUIPart {
  blobUrl?: string
  name?: string
  path?: string
  size?: number
}

export interface UseUploadOptions {
  files?: UploadFile[]
  dropZoneRef?: Ref<HTMLElement | undefined>
  inputRef?: Ref<HTMLTextAreaElement | undefined>
  onFilesSelected?: (files: UploadFile[]) => void
  onRemove?: (index: number) => void
}

export function useUpload(options: UseUploadOptions = {}) {
  const { files: initialFiles = [], dropZoneRef, inputRef, onFilesSelected, onRemove } = options

  const selectedFiles = ref<UploadFile[]>([...initialFiles])

  const isDragOver = ref(false)

  const processFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files)
    const processedFiles = await Promise.all(
      fileArray.map(async (f) => ({
        url: await blobToDataURL(f),
        mediaType: f.type,
        blobUrl: URL.createObjectURL(f),
        filename: f.name,
        name: f.name,
        type: 'file' as const,
        size: f.size
      }))
    )

    selectedFiles.value.push(...processedFiles)

    if (onFilesSelected) {
      onFilesSelected(processedFiles)
    }
  }

  const processFileSystemHandles = async (handles: FileSystemFileHandle[]) => {
    const files = await Promise.all(
      handles.map(async (handle) => {
        const file = await handle.getFile()
        return file
      })
    )
    await processFiles(files)
  }
  const handleFileSystemPicker = async (shouldSaveFileToUserData: boolean) => {
    try {
      if (window.api?.showOpenDialog) {
        const result = await window.api.showOpenDialog({
          properties: ['openFile', 'multiSelections']
        })
        let filePaths = result.filePaths
        if (shouldSaveFileToUserData) {
          filePaths = (await copyFilesToUserData(filePaths)).map((e) => e.sourcePath)
        }
        filePaths.forEach((path) => {
          const file = window.api.fs.readFileSync(path)
          const blob = arrayBufferToBlob(file.buffer)
          selectedFiles.value.push({
            url: '',
            mediaType: window.api.mime.lookup(path) as string,
            blobUrl: URL.createObjectURL(blob),
            filename: window.api.path.basename(path),
            path: 'file://' + path,
            name: window.api.path.basename(path),
            type: 'file' as const,
            size: blob.size
          })
        })
        if (onFilesSelected) {
          onFilesSelected(selectedFiles.value)
        }
        return
      }
      const fileHandles = await (window as any).showOpenFilePicker({
        multiple: true
      })

      if (fileHandles && fileHandles.length > 0) {
        await processFileSystemHandles(fileHandles)
        if (shouldSaveFileToUserData) {
          const files = await Promise.all(
            selectedFiles.value.map(async (f) => ({
              name: f.filename!,
              buffer: await dataURLToBlob(f.url).arrayBuffer()
            }))
          )
          saveFilesToUserData(files)
        }
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('文件选择出错:', error)
      }
    }
  }
  const { isOverDropZone } = useDropZone(dropZoneRef, {
    onDrop: (files) => {
      if (files && files.length > 0) {
        processFiles(files)
      }
      isDragOver.value = false
    },
    onEnter: () => {
      isDragOver.value = true
    },
    onLeave: () => {
      isDragOver.value = false
    }
  })

  const handlePaste = async (event: ClipboardEvent) => {
    const items = event.clipboardData?.items
    if (!items) return

    const files: File[] = []

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) {
          files.push(file)
        }
      }
    }

    if (files.length > 0) {
      event.preventDefault()
      await processFiles(files)
    }
  }

  watchEffect(() => {
    const ref = inputRef?.value
    if (ref) {
      const wrappedHandlePaste = (event: ClipboardEvent) => handlePaste(event)
      ref.addEventListener('paste', wrappedHandlePaste)
      return () => {
        ref.removeEventListener('paste', wrappedHandlePaste)
      }
    }
    return () => {}
  })

  const removeFile = (index: number) => {
    const file = selectedFiles.value[index]
    if (file.blobUrl) {
      URL.revokeObjectURL(file.blobUrl)
    }
    selectedFiles.value.splice(index, 1)

    if (onRemove) {
      onRemove(index)
    }
  }

  const triggerUpload = (shouldSaveFileToUserData: boolean = false) => {
    handleFileSystemPicker(shouldSaveFileToUserData)
  }

  const clearSeletedFiles = () => {
    selectedFiles.value = []
  }
  watchEffect(() => {
    if (initialFiles) {
      selectedFiles.value = [...initialFiles]
    }
  })
  return {
    selectedFiles,
    isDragOver,
    isOverDropZone,
    processFiles,
    removeFile,
    triggerUpload,
    clearSeletedFiles,
    handlePaste
  }
}
