import { useDropZone } from '@vueuse/core'
import { assetsHandler, formatFileSize, getFileCategory, isTextFile, textExtensions, uploadDir } from '@renderer/utils'
import { arrayBufferToBlob, blobToDataURL } from 'blob-util'
import { FileUIPart } from 'ai'
import ignore from 'ignore'

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
  inputRef?: Ref<HTMLElement | undefined>
  onlyText?: boolean
  /** 媒体类型过滤，如 'image' 表示只允许上传图片 */
  media?: 'image' | 'video' | 'audio'
  /** 返回格式类型：'b64_json' 返回 base64 data URL，'url' 返回文件路径 */
  returnType?: 'b64_json' | 'url'
  onFilesSelected?: (files: UploadFile[]) => void
  onRemove?: (index: number) => void
}

export function useUpload(options: UseUploadOptions = {}) {
  const {
    files: initialFiles = [],
    dropZoneRef,
    inputRef,
    onlyText = false,
    media,
    returnType,
    onFilesSelected,
    onRemove
  } = options

  const selectedFiles = ref<UploadFile[]>([...initialFiles])
  const uploadLoading = ref(false)

  const isDragOver = ref(false)
  const modal = useModal()

  const insertFiles = (files: UploadFile[]) => {
    // Avoid passing a very large argument list to Array#push when importing folders.
    selectedFiles.value = selectedFiles.value.concat(files)
    if (onFilesSelected) {
      onFilesSelected(files)
    }
  }

  const processFiles = async (files: FileList | File[]) => {
    uploadLoading.value = true
    try {
      let fileArray = Array.from(files)

      // 如果限制只能上传文本，则进行过滤
      if (onlyText) {
        fileArray = fileArray.filter((f) => {
          // 使用文件名判断是否为文本文件
          return isTextFile(f.name)
        })

        if (fileArray.length === 0 && files.length > 0) {
          messageApi.warning('仅支持上传文本文件')
          return
        }
      }

      // 根据 media 类型过滤文件
      if (media) {
        fileArray = fileArray.filter((f) => {
          if (media === 'image') return f.type.startsWith('image/')
          if (media === 'video') return f.type.startsWith('video/')
          if (media === 'audio') return f.type.startsWith('audio/')
          return true
        })

        if (fileArray.length === 0 && files.length > 0) {
          const mediaNames = { image: '图片', video: '视频', audio: '音频' }
          messageApi.warning(`仅支持上传${mediaNames[media] || media}文件`)
          return
        }
      }

      const processedFiles = await Promise.all(
        fileArray.map(async (f) => {
          let url = await blobToDataURL(f)
          // 如果 returnType 是 'url'，使用 blobUrl 作为路径
          if (returnType === 'url') {
            url = '' // path 会在后面设置
          }
          return {
            url,
            mediaType: f.type,
            blobUrl: URL.createObjectURL(f),
            filename: f.name,
            name: f.name,
            type: 'file' as const,
            size: f.size
          }
        })
      )

      insertFiles(processedFiles)
    } finally {
      uploadLoading.value = false
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
    uploadLoading.value = true
    try {
      // 根据媒体类型设置文件过滤器
      const getFilters = () => {
        if (onlyText) {
          return [{ name: 'Text Files', extensions: textExtensions }]
        }
        if (media === 'image') {
          return [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'] }]
        }
        if (media === 'video') {
          return [{ name: 'Videos', extensions: ['mp4', 'webm', 'mov', 'avi', 'mkv'] }]
        }
        if (media === 'audio') {
          return [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'] }]
        }
        return []
      }

      if (window.api?.showOpenDialog) {
        const result = await window.api.showOpenDialog({
          properties: ['openFile', 'multiSelections'],
          filters: getFilters()
        })
        let filePaths = result.filePaths

        // 根据 media 类型过滤文件
        if (media) {
          filePaths = filePaths.filter((path) => {
            const mimeType = window.api.mime.lookup(path) as string
            if (media === 'image') return mimeType?.startsWith('image/')
            if (media === 'video') return mimeType?.startsWith('video/')
            if (media === 'audio') return mimeType?.startsWith('audio/')
            return true
          })
          if (filePaths.length === 0 && result.filePaths.length > 0) {
            const mediaNames = { image: '图片', video: '视频', audio: '音频' }
            messageApi.warning(`仅支持上传${mediaNames[media] || media}文件`)
            uploadLoading.value = false
            return
          }
        }

        if (shouldSaveFileToUserData) {
          filePaths = (await copyFilesToUserData(filePaths)).map((e) => e.destPath)
        }

        const processedFiles: UploadFile[] = []
        for (const path of filePaths) {
          const file = window.api.fs.readFileSync(path)
          const mimeType = window.api.mime.lookup(path) as string || 'application/octet-stream'
          const blob = arrayBufferToBlob(file.buffer, mimeType)

          // 根据 returnType 决定 URL 格式
          let url = ''
          if (returnType === 'b64_json') {
            // 使用 blob-util 转换为 base64 data URL
            url = await blobToDataURL(blob)
          }

          processedFiles.push({
            url,
            mediaType: mimeType,
            blobUrl: URL.createObjectURL(blob),
            filename: window.api.path.basename(path),
            path: 'file://' + path,
            name: window.api.path.basename(path),
            type: 'file' as const,
            size: blob.size
          })
        }

        insertFiles(processedFiles)
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
      } else if (media) {
        const acceptTypes: Record<string, string[]> = {
          image: ['image/*'],
          video: ['video/*'],
          audio: ['audio/*']
        }
        pickerOptions.types = [
          {
            description: `${media.charAt(0).toUpperCase() + media.slice(1)} Files`,
            accept: {
              [`${media}/*`]: acceptTypes[media] || []
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
    } finally {
      uploadLoading.value = false
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
    const inputElement = inputRef?.value
    if (inputElement) {
      const wrappedHandlePaste = (event: ClipboardEvent) => handlePaste(event)
      inputElement.addEventListener('paste', wrappedHandlePaste)
      return () => {
        inputElement.removeEventListener('paste', wrappedHandlePaste)
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
    uploadLoading.value = true
    try {
      if (window.api?.showOpenDialog) {
        const result = await window.api.showOpenDialog({
          properties: ['openDirectory']
        })
        if (result.canceled || result.filePaths.length === 0) return

        const folderPath = result.filePaths[0]
        const rootFolderName = window.api.path.basename(folderPath)
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
            const normalizedRelativePath = relativePath.replace(/\\/g, '/')
            const displayRelativePath = [rootFolderName, normalizedRelativePath].filter(Boolean).join('/')

            // 使用 ignore 库进行过滤
            if (ig.ignores(normalizedRelativePath)) continue

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
                if (!isTextFile(entry.name)) continue
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
                relativePath: displayRelativePath
              })
            }
          }
        }

        readDirRecursive(folderPath)

        if (files.length > 0) {
          insertFiles(files)
        }
      }
    } catch (error) {
      console.error('文件夹选择出错:', error)
    } finally {
      uploadLoading.value = false
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
      files = files.filter((file) => isTextFile(file.name))
    }

    // 根据 media 类型过滤文件
    if (media) {
      files = files.filter((file) => {
        if (media === 'image') return file.type?.startsWith('image/')
        if (media === 'video') return file.type?.startsWith('video/')
        if (media === 'audio') return file.type?.startsWith('audio/')
        return true
      })
    }

    if (files.length === 0) {
      const emptyMessage = media
        ? `用户数据目录中没有${media === 'image' ? '图片' : media === 'video' ? '视频' : media === 'audio' ? '音频' : media}文件，请先上传文件。`
        : '用户数据目录中没有文件，请先上传文件。'
      await modal.confirm({
        title: '文件选择',
        content: emptyMessage
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
        uploadLoading.value = true
        try {
          if (data.selectedFiles && data.selectedFiles.length > 0) {
            const selectedFilePaths = data.selectedFiles as string[]
            const selectedFileItems = files.filter((file) => selectedFilePaths.includes(file.path))
            const processedFiles = await Promise.all(selectedFileItems.map(async (file) => {
              const fileBuffer = window.api.fs.readFileSync(file.path)
              const mimeType = file.type || 'application/octet-stream'
              const blob = arrayBufferToBlob(fileBuffer.buffer, mimeType)

              // 根据 returnType 决定 URL 格式
              let url = ''
              if (returnType === 'b64_json') {
                // 使用 blob-util 转换为 base64 data URL
                url = await blobToDataURL(blob)
              }

              return {
                url,
                mediaType: mimeType,
                blobUrl: URL.createObjectURL(blob),
                filename: file.name,
                path: 'file://' + file.path,
                name: file.name,
                type: 'file' as const,
                size: file.size
              }
            }))

            insertFiles(processedFiles)
          }
        } finally {
          uploadLoading.value = false
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
