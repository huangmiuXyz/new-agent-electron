import localforage from 'localforage'
export { cloneDeep, throttle, mapValues, retry } from 'es-toolkit'
export { blobToDataURL, dataURLToBlob, arrayBufferToBlob } from 'blob-util'
export const copyText = (text: string) => {
  if (text) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        console.log('消息已复制到剪贴板')
      })
      .catch((err) => {
        console.error('复制失败:', err)
      })
  }
}

export const indexedDBStorage = {
  async getItem(key: string): Promise<string | null> {
    const value = await localforage.getItem<string>(key)
    return value ?? null
  },

  async setItem(key: string, value: string): Promise<void> {
    await localforage.setItem(key, value)
  },

  async removeItem(key: string): Promise<void> {
    await localforage.removeItem(key)
  }
}

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export const saveFilesToUserData = async (
  files: {
    name: string
    buffer: ArrayBuffer
  }[]
) => {
  if (!window.api?.fs || !window.api?.path) {
    throw new Error('Required APIs not available')
  }

  const userDataPath = window.api.getPath('userData')
  const uploadDir = window.api.path.join(userDataPath, 'Data', 'Files')

  if (!window.api.fs.existsSync(uploadDir)) {
    window.api.fs.mkdirSync(uploadDir, { recursive: true })
  }

  const results: { name: string; path: string }[] = []

  for (const file of files) {
    const filePath = window.api.path.join(uploadDir, file.name)
    const buffer = Buffer.from(file.buffer)

    window.api.fs.writeFileSync(filePath, buffer)

    results.push({
      name: file.name,
      path: filePath
    })
  }

  return results
}

export const copyFilesToUserData = async (filePaths: string[]) => {
  if (!window.api?.fs || !window.api?.path) {
    throw new Error('Required APIs not available')
  }

  const userDataPath = window.api.getPath('userData')
  const uploadDir = window.api.path.join(userDataPath, 'Data', 'Files')

  if (!window.api.fs.existsSync(uploadDir)) {
    window.api.fs.mkdirSync(uploadDir, { recursive: true })
  }

  const results: {
    name: string
    sourcePath: string
    destPath: string
  }[] = []

  for (const filePath of filePaths) {
    const fileName = window.api.path.basename(filePath)
    const destPath = window.api.path.join(uploadDir, fileName)

    window.api.fs.copyFileSync(filePath, destPath)

    results.push({
      name: fileName,
      sourcePath: filePath,
      destPath
    })
  }

  return results
}

export const getBlobUrl = (url: string): string => {
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
