import { useDropZone } from '@vueuse/core'
import { FileUIPart } from 'ai'
export interface UploadFile extends FileUIPart {
  blobUrl?: string
  name?: string
  path?: string
  size?: number
}

interface FileItem {
  name: string
  path: string
  size: number
  created: number
  type: string
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
  const modal = useModal()

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
          filePaths = (await copyFilesToUserData(filePaths)).map((e) => e.destPath)
        }
        filePaths.forEach((path) => {
          const file = window.api.fs.readFileSync(path)
          const blob = arrayBufferToBlob(file.buffer)
          selectedFiles.value.push({
            url: '',
            mediaType: window.api.mime.lookup(path) as string,
            blobUrl: URL.createObjectURL(blob),
            filename: window.api.path.basename(path),
            path: 'file://' + filePaths,
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

  const triggerUpload = async (shouldSaveFileToUserData: boolean = false) => {
    await modal.confirm({
      title: '选择文件来源',
      content: '选择文件来源',
      confirmText: '从用户文件目录选择',
      cancelText: '从文件系统选择',
      onCancel: () => {
        handleFileSystemPicker(shouldSaveFileToUserData)
        modal.remove()
      },
      onOk: async () => {
        showFileSelector()
        modal.remove()
      }
    })
  }

  const clearSeletedFiles = () => {
    selectedFiles.value = []
  }

  const loadUserDataFiles = async (): Promise<FileItem[]> => {
    try {
      if (!window.api?.fs || !window.api?.path) {
        return []
      }

      if (!window.api.fs.existsSync(uploadDir)) {
        return []
      }

      const names = window.api.fs.readdirSync(uploadDir)

      return names.map((name) => {
        const filePath = window.api.path.join(uploadDir, name)
        const stat = window.api.fs.statSync(filePath)

        const type = window.api.mime
          ? window.api.mime.lookup(name) || 'application/octet-stream'
          : 'application/octet-stream'

        return {
          name,
          path: filePath,
          size: stat.size,
          created: stat.birthtimeMs || stat.ctimeMs,
          type
        }
      })
    } catch (error) {
      console.error('加载用户文件失败:', error)
      return []
    }
  }

  const showFileSelector = async () => {
    const files = await loadUserDataFiles()

    if (files.length === 0) {
      await modal.confirm({
        title: '文件选择',
        content: '用户数据目录中没有文件，请先上传文件。'
      })
      return
    }

    const fileOptions = files.map((file) => ({
      label: `${file.name} (${formatFileSize(file.size)})`,
      value: file.path
    }))

    const [FileSelectorForm, { submit }] = useForm({
      showHeader: true,
      fields: [
        {
          name: 'selectedFiles',
          type: 'checkboxGroup' as const,
          label: '选择文件',
          options: fileOptions,
          required: false
        }
      ],
      onSubmit: async (data) => {
        if (data.selectedFiles && data.selectedFiles.length > 0) {
          const selectedFilePaths = data.selectedFiles as string[]
          const selectedFileItems = files.filter((file) => selectedFilePaths.includes(file.path))
          const processedFiles = selectedFileItems.map((file) => {
            const fileBuffer = window.api.fs.readFileSync(file.path)
            const blob = arrayBufferToBlob(fileBuffer.buffer)
            return {
              url: '',
              mediaType: file.type,
              blobUrl: URL.createObjectURL(blob),
              filename: file.name,
              path: 'file://' + file.path,
              name: file.name,
              type: 'file' as const,
              size: file.size
            }
          })

          selectedFiles.value.push(...processedFiles)

          if (onFilesSelected) {
            onFilesSelected(processedFiles)
          }
        }
        return true
      }
    })

    const modalContent = h(FileSelectorForm)

    await modal.confirm({
      title: '从文件列表中选择',
      content: modalContent,
      width: '600px',
      height: '500px',
      onOk: () => {
        modal.remove()
        submit()
      }
    })
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
    handlePaste,
    showFileSelector
  }
}
