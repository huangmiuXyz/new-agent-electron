import localforage from 'localforage'

export { cloneDeep, throttle, mapValues, retry, debounce } from 'es-toolkit'
export { blobToDataURL, dataURLToBlob, arrayBufferToBlob } from 'blob-util'
import { dataURLToBlob as _dataURLToBlob, arrayBufferToBlob as _arrayBufferToBlob } from 'blob-util'
import stripAnsi from 'strip-ansi'
export { stripAnsi }
export const anyUrlToBlobUrl = (url: string): string => {
  if (!url) return ''
  try {
    if (url.startsWith('file:///')) {
      const filePath = window.api.url.fileURLToPath(url)
      return URL.createObjectURL(_arrayBufferToBlob(window.api.fs.readFileSync(filePath).buffer))
    }
    if (url.startsWith('data:')) {
      const blob = _dataURLToBlob(url)
      return URL.createObjectURL(blob)
    }
    return url
  } catch {
    return ''
  }
}

export const assetsHandler = (path: string): string => {
  if (!path) return ''
  if (path.startsWith('http') || path.startsWith('data:') || path.startsWith('file:')) {
    return path
  }
  // 处理以 / 开头的路径，使其相对于根目录
  try {
    return new URL(path, import.meta.url).href
  } catch (e) {
    console.error('assetsHandler error:', e)
    return path
  }
}

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
const userDataPath = window.api?.getPath('userData')
export const uploadDir = window.api?.path.join(userDataPath, 'Data', 'Files')

export const saveFilesToUserData = async (
  files: {
    name: string
    buffer: ArrayBuffer
  }[]
) => {
  if (!window.api?.fs || !window.api?.path) {
    throw new Error('Required APIs not available')
  }
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

export const getFileIcon = (file: { name?: string; mediaType: string }) => {
  const mediaType = file.mediaType || ''
  const fileName = file.name || ''
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
export const base64ToText = (base64: string) => {
  const binary = atob(base64.split(',').pop()!)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  return new TextDecoder('utf-8').decode(bytes)
}
export const getSplitTypeByMediaType = (mediaType: string) => {
  switch (mediaType) {
    case 'text/markdown':
      return 'text/markdown'
    case 'text':
      return 'text'
    case 'code':
      return 'code'
    case 'log':
      return 'log'
    default:
      return 'text'
  }
}
export const getCategoryLabel = (category: string) => {
  switch (category) {
    case 'text':
      return '文本'
    case 'embedding':
      return '嵌入式'
    case 'image':
      return '图像'
    case 'rerank':
      return '重排'
    case 'speech':
      return '语音'
    default:
      return '文本'
  }
}
export const getHost = (input: string) => {
  if (typeof input !== 'string' || !input.trim()) {
    throw new TypeError('getHost: input must be a non-empty string')
  }

  let url

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(input)) {
    url = new URL(input)
  } else {
    url = new URL(`http://${input}`)
  }

  return url.host
}
export const execPromise = (command, options = {}): Promise<{ stdout: string; stderr: string }> => {
  return new Promise((resolve, reject) => {
    window.api.exec(command, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout
        error.stderr = stderr
        reject(error)
      } else {
        resolve({ stdout, stderr })
      }
    })
  })
}
