import { useDropZone } from '@vueuse/core'
import { assetsHandler, formatFileSize, getFileCategory, uploadDir } from '@renderer/utils'
import { arrayBufferToBlob, blobToDataURL } from 'blob-util'
import { FileUIPart } from 'ai'
import ignore from 'ignore'
// @ts-ignore
import textExtensions from 'textextensions'

export interface UploadFile extends FileUIPart {
  blobUrl?: string
  name?: string
  path?: string
  size?: number
  relativePath?: string
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
  onlyText?: boolean
  onFilesSelected?: (files: UploadFile[]) => void
  onRemove?: (index: number) => void
}

export function useUpload(options: UseUploadOptions = {}) {
  const {
    files: initialFiles = [],
    dropZoneRef,
    inputRef,
    onlyText = false,
    onFilesSelected,
    onRemove
  } = options

  const selectedFiles = ref<UploadFile[]>([...initialFiles])
  const uploadLoading = ref(false)

  const isDragOver = ref(false)
  const modal = useModal()

  /**
   * 分片处理并插入文件，避免 UI 卡顿
   */
  const batchInsertFiles = async (
    files: UploadFile[],
    onProgress?: (processed: number, total: number) => void
  ) => {
    const CHUNK_SIZE = 50 // 每批处理 50 个文件
    const total = files.length
    let processed = 0

    uploadLoading.value = true

    try {
      for (let i = 0; i < files.length; i += CHUNK_SIZE) {
        const chunk = files.slice(i, i + CHUNK_SIZE)
        selectedFiles.value.push(...chunk)
        processed += chunk.length

        if (onProgress) {
          onProgress(processed, total)
        }

        // 给 UI 渲染留出时间
        await nextTick()
        // 如果数据量特别大，可以额外增加一个小延迟
        if (total > 500) {
          await new Promise((resolve) => setTimeout(resolve, 0))
        }
      }

      if (onFilesSelected) {
        onFilesSelected(files)
      }
    } finally {
      uploadLoading.value = false
    }
  }

  const processFiles = async (files: FileList | File[]) => {
    let fileArray = Array.from(files)

    // 如果限制只能上传文本，则进行过滤
    if (onlyText) {
      fileArray = fileArray.filter((f) => {
        // 使用文件名判断。在渲染进程中，我们通过 textExtensions 列表匹配后缀
        const ext = f.name.split('.').pop()?.toLowerCase() || ''
        return textExtensions.includes(ext)
      })

      if (fileArray.length === 0 && files.length > 0) {
        messageApi.warning('仅支持上传文本文件')
        return
      }
    }

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

    await batchInsertFiles(processedFiles)
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
          properties: ['openFile', 'multiSelections'],
          filters: onlyText
            ? [
              {
                name: 'Text Files',
                extensions: textExtensions
              }
            ]
            : []
        })
        let filePaths = result.filePaths
        if (shouldSaveFileToUserData) {
          filePaths = (await copyFilesToUserData(filePaths)).map((e) => e.destPath)
        }

        const processedFiles: UploadFile[] = []
        for (const path of filePaths) {
          const file = window.api.fs.readFileSync(path)
          const blob = arrayBufferToBlob(file.buffer)
          processedFiles.push({
            url: '',
            mediaType: window.api.mime.lookup(path) as string,
            blobUrl: URL.createObjectURL(blob),
            filename: window.api.path.basename(path),
            path: 'file://' + path,
            name: window.api.path.basename(path),
            type: 'file' as const,
            size: blob.size
          })
        }

        await batchInsertFiles(processedFiles)
        return
      }
      const pickerOptions: any = {
        multiple: true
      }

      if (onlyText) {
        pickerOptions.types = [
          {
            description: 'Text Files',
            accept: {
              'text/*': textExtensions.map((ext) => `.${ext}`)
            }
          }
        ]
      }

      const fileHandles = await (window as any).showOpenFilePicker(pickerOptions)

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
    return () => { }
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

  const triggerFolderUpload = async () => {
    try {
      if (window.api?.showOpenDialog) {
        const result = await window.api.showOpenDialog({
          properties: ['openDirectory']
        })
        if (result.canceled || result.filePaths.length === 0) return

        const folderPath = result.filePaths[0]
        const files: UploadFile[] = []

        // 使用 ignore 库处理 .gitignore
        const ig = ignore()
        const gitignorePath = window.api.path.join(folderPath, '.gitignore')
        if (window.api.fs.existsSync(gitignorePath)) {
          const content = window.api.fs.readFileSync(gitignorePath, 'utf-8')
          ig.add(content)
        }

        const readDirRecursive = (dir: string) => {
          const entries = window.api.fs.readdirSync(dir, { withFileTypes: true })
          for (const entry of entries) {
            const fullPath = window.api.path.join(dir, entry.name)
            const relativePath = window.api.path.relative(folderPath, fullPath)

            // 使用 ignore 库进行过滤
            if (ig.ignores(relativePath)) continue

            // 检查是否为目录。在 Electron contextBridge 中，Dirent/Stats 的方法可能丢失，改用 mode 判断
            const stat = window.api.fs.statSync(fullPath)
            const isDirectory = (stat.mode & 0o170000) === 0o040000
            const isFile = (stat.mode & 0o170000) === 0o100000

            if (isDirectory) {
              readDirRecursive(fullPath)
            } else if (isFile) {
              // 排除 .gitignore 自身
              if (entry.name === '.gitignore') continue

              if (onlyText) {
                const ext = window.api.path.extname(fullPath).toLowerCase().replace('.', '')
                if (!textExtensions.includes(ext)) continue
              }

              const mediaType = (window.api.mime.lookup(fullPath) as string) || 'application/octet-stream'
              files.push({
                url: '',
                mediaType,
                filename: entry.name,
                path: 'file://' + fullPath,
                name: entry.name,
                type: 'file' as const,
                size: stat.size,
                relativePath
              })
            }
          }
        }

        readDirRecursive(folderPath)

        if (files.length > 0) {
          await batchInsertFiles(files)
        }
      }
    } catch (error) {
      console.error('文件夹选择出错:', error)
    }
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
    let files = await loadUserDataFiles()

    if (onlyText) {
      files = files.filter((file) => {
        const ext = file.name.split('.').pop()?.toLowerCase() || ''
        return textExtensions.includes(ext)
      })
    }

    if (files.length === 0) {
      await modal.confirm({
        title: '文件选择',
        content: '用户数据目录中没有文件，请先上传文件。'
      })
      return
    }

    const fileOptions = files.map((file) => ({
      label: `${file.name} (${formatFileSize(file.size)})`,
      value: file.path,
      image: getFileCategory(file) === 'image' ? `file://${assetsHandler(file.path)}` : undefined
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

          await batchInsertFiles(processedFiles)
        }
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
    uploadLoading,
    triggerUpload,
    triggerFolderUpload,
    clearSeletedFiles,
    removeFile,
    isDragOver,
    isOverDropZone,
    loadUserDataFiles,
    processFiles,
    handlePaste,
    showFileSelector
  }
}
