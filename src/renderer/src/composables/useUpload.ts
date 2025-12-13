import { ref, watchEffect, type Ref } from 'vue'
import { useDropZone } from '@vueuse/core'
import { FileUIPart } from 'ai'
import { blobToDataURL, dataURLToBlob } from '../utils'
import { arrayBufferToBlob } from 'blob-util'

export interface UploadFile extends FileUIPart {
  blobUrl?: string
  name?: string
  path?: string
}

export interface UseUploadOptions {
  files?: UploadFile[]
  dropZoneRef?: Ref<HTMLElement | undefined>
  inputRef?: Ref<HTMLTextAreaElement | undefined>
  onFilesSelected?: (files: UploadFile[]) => void
  onRemove?: (index: number) => void
  saveToUserData?: boolean // 是否保存到 userData 目录
}

export function useUpload(options: UseUploadOptions = {}) {
  const {
    files: initialFiles = [],
    dropZoneRef,
    inputRef,
    onFilesSelected,
    onRemove,
    saveToUserData: globalSaveToUserData = true // 默认保存到 userData
  } = options

  const selectedFiles = ref<UploadFile[]>([...initialFiles])

  const isDragOver = ref(false)

  const saveToUserData = async (files: UploadFile[]) => {
    if (!window.api?.saveFilesToUserData) return

    const payload = await Promise.all(
      files.map(async (file) => {
        const blob = dataURLToBlob(file.url)
        const buffer = await blob.arrayBuffer()

        return {
          name: file.name || file.filename!,
          buffer
        }
      })
    )

    return window.api.saveFilesToUserData(payload)
  }

  const processFiles = async (files: FileList | File[], shouldSaveToUserData?: boolean) => {
    const fileArray = Array.from(files)
    const processedFiles = await Promise.all(
      fileArray.map(async (f) => ({
        url: await blobToDataURL(f),
        mediaType: f.type,
        blobUrl: URL.createObjectURL(f),
        filename: f.name,
        name: f.name,
        type: 'file' as const
      }))
    )

    selectedFiles.value.push(...processedFiles)

    // 根据参数决定是否保存到 userData
    if (shouldSaveToUserData !== false && globalSaveToUserData) {
      await saveToUserData(processedFiles)
    }

    if (onFilesSelected) {
      onFilesSelected(processedFiles)
    }
  }

  const processFileSystemHandles = async (
    handles: FileSystemFileHandle[],
    shouldSaveToUserData?: boolean
  ) => {
    const files = await Promise.all(
      handles.map(async (handle) => {
        const file = await handle.getFile()
        return file
      })
    )
    await processFiles(files, shouldSaveToUserData)
  }
  const handleFileSystemPicker = async (shouldSaveToUserData?: boolean) => {
    try {
      if (window.api) {
        const result = await window.api.showOpenDialog({
          properties: ['openFile', 'multiSelections']
        })
        if (result && result.filePaths && result.filePaths.length > 0) {
          await processElectronFiles(result.filePaths, shouldSaveToUserData)
        }
      } else {
        const fileHandles = await (window as any).showOpenFilePicker({
          multiple: true
        })

        if (fileHandles && fileHandles.length > 0) {
          await processFileSystemHandles(fileHandles, shouldSaveToUserData)
        }
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('文件选择出错:', error)
      }
    }
  }

  const processElectronFiles = async (paths: string[], shouldSaveToUserData?: boolean) => {
    const files: UploadFile[] = []
    for (const filePath of paths) {
      const content = window.api.fs.readFileSync(filePath)
      const blob = arrayBufferToBlob(content.buffer)
      const name = window.api.path.basename(filePath)
      files.push({
        url: await blobToDataURL(blob),
        mediaType: window.api.mime.lookup(filePath) as string,
        blobUrl: URL.createObjectURL(blob),
        filename: name,
        name,
        type: 'file' as const,
        path: filePath
      })
    }
    selectedFiles.value.push(...files)

    // 根据参数决定是否复制到 userData
    if (shouldSaveToUserData !== false && globalSaveToUserData) {
      await window.api.copyFilesToUserData?.(paths)
    }
  }
  const { isOverDropZone } = useDropZone(dropZoneRef, {
    onDrop: (files) => {
      if (files && files.length > 0) {
        processFiles(files, globalSaveToUserData)
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

  const handlePaste = async (event: ClipboardEvent, shouldSaveToUserData?: boolean) => {
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
      await processFiles(files, shouldSaveToUserData)
    }
  }

  watchEffect(() => {
    const ref = inputRef?.value
    if (ref) {
      const wrappedHandlePaste = (event: ClipboardEvent) => handlePaste(event, globalSaveToUserData)
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

  const openFile = (file: UploadFile) => {
    const fileUrl = file.blobUrl || file.url

    if (fileUrl) {
      if (window.api && window.api.openFile) {
        window.api.openFile(fileUrl)
      } else {
        window.open(fileUrl, '_blank')
      }
    }
  }

  const getBlobUrl = (url: string): string => {
    const blob = dataURLToBlob(url)
    return URL.createObjectURL(blob)
  }

  const getFileIcon = (file: UploadFile) => {
    const mediaType = file.mediaType || ''
    const fileName = file.name || file.filename || ''
    if (mediaType.includes('pdf')) {
      return 'FileCertificate'
    } else if (
      mediaType.includes('word') ||
      mediaType.includes('document') ||
      fileName.endsWith('.doc') ||
      fileName.endsWith('.docx')
    ) {
      return 'File'
    } else if (
      mediaType.includes('excel') ||
      mediaType.includes('spreadsheet') ||
      fileName.endsWith('.xls') ||
      fileName.endsWith('.xlsx')
    ) {
      return 'FileAnalytics'
    } else if (
      mediaType.includes('powerpoint') ||
      mediaType.includes('presentation') ||
      fileName.endsWith('.ppt') ||
      fileName.endsWith('.pptx')
    ) {
      return 'FileInvoice'
    } else if (fileName.endsWith('.md') || mediaType.includes('markdown')) {
      return 'Markdown'
    } else if (
      mediaType.includes('text/') ||
      mediaType.includes('plain') ||
      fileName.endsWith('.txt')
    ) {
      return 'FileText'
    } else if (
      mediaType.includes('javascript') ||
      mediaType.includes('json') ||
      mediaType.includes('xml') ||
      mediaType.includes('html') ||
      mediaType.includes('css') ||
      fileName.endsWith('.js') ||
      fileName.endsWith('.ts') ||
      fileName.endsWith('.jsx') ||
      fileName.endsWith('.tsx') ||
      fileName.endsWith('.json') ||
      fileName.endsWith('.xml') ||
      fileName.endsWith('.html') ||
      fileName.endsWith('.css') ||
      fileName.endsWith('.py') ||
      fileName.endsWith('.java') ||
      fileName.endsWith('.cpp') ||
      fileName.endsWith('.c') ||
      fileName.endsWith('.go') ||
      fileName.endsWith('.rs') ||
      fileName.endsWith('.php') ||
      fileName.endsWith('.rb')
    ) {
      return 'FileCode'
    } else if (
      mediaType.includes('zip') ||
      mediaType.includes('rar') ||
      mediaType.includes('tar') ||
      mediaType.includes('gzip') ||
      fileName.endsWith('.zip') ||
      fileName.endsWith('.rar') ||
      fileName.endsWith('.tar') ||
      fileName.endsWith('.gz') ||
      fileName.endsWith('.7z')
    ) {
      return 'FileZip'
    } else if (
      mediaType.includes('audio/') ||
      fileName.endsWith('.mp3') ||
      fileName.endsWith('.wav') ||
      fileName.endsWith('.flac') ||
      fileName.endsWith('.aac')
    ) {
      return 'FileMusic'
    } else if (
      mediaType.includes('video/') ||
      fileName.endsWith('.mp4') ||
      fileName.endsWith('.avi') ||
      fileName.endsWith('.mov') ||
      fileName.endsWith('.mkv')
    ) {
      return 'Video'
    }

    return 'File'
  }

  const triggerUpload = (shouldSaveToUserData?: boolean) => {
    handleFileSystemPicker(shouldSaveToUserData)
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
    openFile,
    getBlobUrl,
    getFileIcon,
    triggerUpload,
    handlePaste
  }
}
