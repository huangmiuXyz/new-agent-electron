import { ref, watchEffect, type Ref } from 'vue'
import { useDropZone } from '@vueuse/core'
import { FileUIPart } from 'ai'
import { blobToDataURL, dataURLToBlob } from '../utils'

export interface UploadFile extends FileUIPart {
  blobUrl?: string
  name?: string
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

  // 文件列表
  const selectedFiles = ref<UploadFile[]>([...initialFiles])

  // 拖拽状态
  const isDragOver = ref(false)

  // 处理文件上传的通用函数
  const processFiles = async (files: FileList | File[]) => {
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

  // 使用 File System Access API 选择文件
  const handleFileSystemPicker = async () => {
    try {
      const fileHandles = await (window as any).showOpenFilePicker({
        multiple: true
      })

      if (fileHandles && fileHandles.length > 0) {
        await processFileSystemHandles(fileHandles)
      }
    } catch (error: any) {
      // 用户取消了文件选择，不需要处理
      if (error.name !== 'AbortError') {
        console.error('文件选择出错:', error)
      }
    }
  }

  // 使用 useDropZone 处理拖拽上传
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

  // 监听粘贴事件
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

  // 通过传入的input ref监听粘贴事件
  watchEffect(() => {
    const ref = inputRef?.value
    if (ref) {
      ref.addEventListener('paste', handlePaste)
      return () => {
        ref.removeEventListener('paste', handlePaste)
      }
    }
    return () => {}
  })

  // 移除文件
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

  // 打开文件
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

  // 获取 Blob URL
  const getBlobUrl = (url: string): string => {
    const blob = dataURLToBlob(url)
    return URL.createObjectURL(blob)
  }

  // 获取文件图标
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

  // 触发文件选择
  const triggerUpload = () => {
    handleFileSystemPicker()
  }

  // 监听外部文件列表变化
  watchEffect(() => {
    if (initialFiles) {
      selectedFiles.value = [...initialFiles]
    }
  })

  return {
    // 状态
    selectedFiles,
    isDragOver,
    isOverDropZone,

    // 方法
    processFiles,
    removeFile,
    openFile,
    getBlobUrl,
    getFileIcon,
    triggerUpload,
    handlePaste
  }
}
