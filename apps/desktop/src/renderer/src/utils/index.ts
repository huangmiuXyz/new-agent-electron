export { cloneDeep, throttle, mapValues, retry, debounce, chunk } from 'es-toolkit'
export { blobToDataURL, dataURLToBlob, arrayBufferToBlob } from 'blob-util'
import { dataURLToBlob as _dataURLToBlob, arrayBufferToBlob as _arrayBufferToBlob } from 'blob-util'
import stripAnsi from 'strip-ansi'
import { toBlob } from 'html-to-image'
// @ts-ignore
import extensions from 'textextensions'

const textExtensions: string[] = Array.isArray(extensions)
  ? extensions
  : (extensions as any).default || []

export { stripAnsi, textExtensions }

/**
 * 判断文件是否为文本文件（基于扩展名）
 * @param filename 文件名
 * @returns 是否为文本文件
 */
export const isTextFile = (filename: string): boolean => {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  return textExtensions.includes(ext)
}
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
  if (path.startsWith('http') || path.startsWith('blob:')) {
    return path
  }
  if (path.startsWith('data:')) {
    return path
  }
  if (path.startsWith('file:')) {
    return anyUrlToBlobUrl(path)
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  if (import.meta.env.DEV) {
    return normalizedPath
  }
  try {
    const relativePath = `..${normalizedPath}`
    return new URL(relativePath, import.meta.url).href
  } catch (e) {
    return normalizedPath
  }
}

export const copyImageToClipboard = async (src: string, fallbackText = src): Promise<boolean> => {
  if (!src) return false

  try {
    if (!navigator.clipboard?.write || !(window as any).ClipboardItem) {
      copyText(fallbackText)
      return false
    }

    const response = await fetch(src)
    const blob = await response.blob()
    const type = blob.type || 'image/png'
    const ClipboardItemConstructor = (window as any).ClipboardItem

    await navigator.clipboard.write([
      new ClipboardItemConstructor({
        [type]: blob
      })
    ])

    return true
  } catch (err) {
    console.error('复制图片失败:', err)
    copyText(fallbackText)
    return false
  }
}

const waitForNextPaint = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  )

const readBlobAsDataURL = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const serializeCssVariables = (style: CSSStyleDeclaration) =>
  Array.from(style)
    .filter((name) => name.startsWith('--'))
    .map(
      (name) =>
        `${name}: ${style.getPropertyValue(name)}${style.getPropertyPriority(name) ? ' !important' : ''};`
    )
    .join(' ')

const collectDocumentStyles = () => {
  const styles: string[] = []

  Array.from(document.styleSheets).forEach((styleSheet) => {
    try {
      const rules = Array.from(styleSheet.cssRules || [])
      styles.push(rules.map((rule) => rule.cssText).join('\n'))
    } catch {
      if (styleSheet.href) {
        styles.push(`@import url("${styleSheet.href.replace(/"/g, '\\"')}");`)
      }
    }
  })

  return styles.join('\n')
}

const applyElementFilter = (root: HTMLElement, filter?: (node: HTMLElement) => boolean) => {
  if (!filter) return

  Array.from(root.querySelectorAll<HTMLElement>('*')).forEach((node) => {
    if (!filter(node)) {
      node.remove()
    }
  })
}

const inlineImageSources = async (root: HTMLElement) => {
  const images = Array.from(root.querySelectorAll<HTMLImageElement>('img'))

  await Promise.all(
    images.map(async (image) => {
      const src = image.currentSrc || image.src || image.getAttribute('src')
      if (!src || src.startsWith('data:')) return

      try {
        const response = await fetch(src)
        const blob = await response.blob()
        image.setAttribute('src', await readBlobAsDataURL(blob))
        image.removeAttribute('srcset')
      } catch {
        // Keep the original src. The offscreen window may still be able to load it.
      }
    })
  )
}

const buildElementImageHtml = async (
  element: HTMLElement,
  options: {
    backgroundColor?: string
    filter?: (node: HTMLElement) => boolean
    width?: number
  }
) => {
  const computedStyle = window.getComputedStyle(document.body)
  const backgroundColor =
    options.backgroundColor ||
    computedStyle.getPropertyValue('--bg-primary').trim() ||
    computedStyle.backgroundColor ||
    '#ffffff'
  const width = Math.ceil(
    options.width ?? element.scrollWidth ?? element.getBoundingClientRect().width
  )
  const height = Math.ceil(element.scrollHeight || element.getBoundingClientRect().height)
  const clone = element.cloneNode(true) as HTMLElement

  applyElementFilter(clone, options.filter)
  clone.style.setProperty('position', 'static', 'important')
  clone.style.setProperty('left', 'auto', 'important')
  clone.style.setProperty('top', 'auto', 'important')
  clone.style.setProperty('right', 'auto', 'important')
  clone.style.setProperty('bottom', 'auto', 'important')
  clone.style.setProperty('margin', '0', 'important')
  clone.style.setProperty('transform', 'none', 'important')
  if (width > 0) {
    clone.style.setProperty('width', `${width}px`, 'important')
    clone.style.setProperty('max-width', 'none', 'important')
  }

  await inlineImageSources(clone)

  const html = `<!doctype html>
<html class="${escapeHtml(document.documentElement.className)}" style="${escapeHtml(serializeCssVariables(window.getComputedStyle(document.documentElement)))}">
  <head>
    <meta charset="utf-8">
    <style>
      ${collectDocumentStyles()}
      html,
      body {
        margin: 0;
        padding: 0;
        width: fit-content;
        min-width: ${width}px;
        background: ${backgroundColor};
        overflow: hidden;
      }
      * {
        -webkit-font-smoothing: antialiased;
        text-rendering: optimizeLegibility;
      }
      #capture-root {
        display: block;
        width: ${width}px;
        min-height: ${height}px;
        background: ${backgroundColor};
      }
      #capture-root > * {
        box-sizing: border-box;
      }
    </style>
    <title>${escapeHtml(document.title || 'capture')}</title>
  </head>
  <body class="${escapeHtml(document.body.className)}" style="${escapeHtml(serializeCssVariables(window.getComputedStyle(document.body)))}">
    <div id="capture-root">${clone.outerHTML}</div>
  </body>
</html>`

  return {
    html,
    width,
    height,
    backgroundColor
  }
}

export const copyElementImageToClipboard = async (
  element: HTMLElement,
  options: {
    backgroundColor?: string
    filter?: (node: HTMLElement) => boolean
    pixelRatio?: number
    width?: number
  } = {}
): Promise<boolean> => {
  try {
    if (window.api?.clipboard?.copyHtmlImage) {
      await waitForNextPaint()
      const payload = await buildElementImageHtml(element, options)
      const result = await window.api.clipboard.copyHtmlImage(payload)
      if (!result?.ok) {
        console.error('复制长图失败:', result?.error)
      }
      return Boolean(result?.ok)
    }

    if (!navigator.clipboard?.write || !(window as any).ClipboardItem) return false

    const computedStyle = window.getComputedStyle(document.body)
    const backgroundColor =
      options.backgroundColor ||
      computedStyle.getPropertyValue('--bg-primary').trim() ||
      computedStyle.backgroundColor ||
      '#ffffff'
    const blob = await toBlob(element, {
      backgroundColor,
      cacheBust: true,
      pixelRatio: options.pixelRatio ?? Math.min(window.devicePixelRatio || 1, 2),
      width: options.width ?? element.scrollWidth,
      height: element.scrollHeight,
      filter: options.filter
        ? (node) => {
            if (!(node instanceof HTMLElement)) return true
            return options.filter!(node)
          }
        : undefined,
      style: {
        margin: '0',
        transform: 'none'
      }
    })

    if (!blob) return false

    const ClipboardItemConstructor = (window as any).ClipboardItem
    await navigator.clipboard.write([
      new ClipboardItemConstructor({
        'image/png': blob
      })
    ])

    return true
  } catch (err) {
    console.error('复制长图失败:', err)
    return false
  }
}

export const saveElementImageToFile = async (
  element: HTMLElement,
  filePath: string,
  options: {
    backgroundColor?: string
    filter?: (node: HTMLElement) => boolean
    pixelRatio?: number
    width?: number
  } = {}
): Promise<boolean> => {
  try {
    if (window.api?.exporter?.saveHtmlImage) {
      await waitForNextPaint()
      const payload = await buildElementImageHtml(element, options)
      const result = await window.api.exporter.saveHtmlImage({
        ...payload,
        filePath
      })
      if (!result?.ok) {
        console.error('导出图片失败:', result?.error)
      }
      return Boolean(result?.ok)
    }

    const computedStyle = window.getComputedStyle(document.body)
    const backgroundColor =
      options.backgroundColor ||
      computedStyle.getPropertyValue('--bg-primary').trim() ||
      computedStyle.backgroundColor ||
      '#ffffff'
    const blob = await toBlob(element, {
      backgroundColor,
      cacheBust: true,
      pixelRatio: options.pixelRatio ?? Math.min(window.devicePixelRatio || 1, 2),
      width: options.width ?? element.scrollWidth,
      height: element.scrollHeight,
      filter: options.filter
        ? (node) => {
            if (!(node instanceof HTMLElement)) return true
            return options.filter!(node)
          }
        : undefined,
      style: {
        margin: '0',
        transform: 'none'
      }
    })

    if (!blob) return false

    const buffer =
      typeof Buffer !== 'undefined'
        ? Buffer.from(await blob.arrayBuffer())
        : new Uint8Array(await blob.arrayBuffer())
    window.api.fs.writeFileSync(filePath, buffer)
    return true
  } catch (err) {
    console.error('导出图片失败:', err)
    return false
  }
}

export {
  indexedDBStorage,
  setIndexedDBStorageRestoreGuard,
  isIndexedDBStorageRestoring,
  allowNextIndexedDBEmptyWrite,
  flushIndexedDBStorage,
} from './storage'

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export type FileCategory = 'image' | 'video' | 'document' | 'data' | 'other'

export interface FileItem {
  name: string
  path: string
  size: number
  created: number
  type: string
}

export const FILE_CATEGORY_RULES: Record<
  FileCategory,
  {
    mimeStartsWith?: string[]
    mimeIncludes?: string[]
    extensions?: string[]
  }
> = {
  image: {
    mimeStartsWith: ['image/'],
    extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp']
  },
  video: {
    mimeStartsWith: ['video/'],
    extensions: ['mp4', 'webm', 'ogg', 'mov', 'avi', 'wmv', 'mkv', 'flv', 'm4v', '3gp']
  },
  document: {
    mimeIncludes: ['pdf', 'word', 'text'],
    extensions: textExtensions
  },
  data: {
    mimeIncludes: ['json', 'xml', 'csv'],
    extensions: ['json', 'xml', 'csv', 'db', 'sqlite']
  },
  other: {}
}

export function getFileCategory(file: FileItem | { name: string; type: string }): FileCategory {
  const name = file.name.toLowerCase()
  const mime = file.type || ''
  const ext = name.split('.').pop() || ''

  for (const [category, rule] of Object.entries(FILE_CATEGORY_RULES)) {
    const r = rule as any
    if (r.mimeStartsWith?.some((m: string) => mime.startsWith(m))) {
      return category as FileCategory
    }
    if (r.mimeIncludes?.some((m: string) => mime.includes(m))) {
      return category as FileCategory
    }
    if (r.extensions?.includes(ext)) {
      return category as FileCategory
    }
  }
  return 'other'
}

export function isVideoUrl(url: string): boolean {
  if (!url) return false
  const name = url.toLowerCase().split('?')[0]
  const ext = name.split('.').pop() || ''
  return FILE_CATEGORY_RULES.video.extensions?.includes(ext) || false
}

export function isImageUrl(url: string): boolean {
  if (!url) return false
  const name = url.toLowerCase().split('?')[0]
  const ext = name.split('.').pop() || ''
  return FILE_CATEGORY_RULES.image.extensions?.includes(ext) || false
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
    const buffer =
      typeof Buffer !== 'undefined' ? Buffer.from(file.buffer) : new Uint8Array(file.buffer)

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
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  if (mediaType.includes('pdf')) {
    return 'FileCertificate'
  } else if (
    mediaType.includes('word') ||
    mediaType.includes('document') ||
    ext === 'doc' ||
    ext === 'docx'
  ) {
    return 'File'
  } else if (
    mediaType.includes('excel') ||
    mediaType.includes('spreadsheet') ||
    ext === 'xls' ||
    ext === 'xlsx'
  ) {
    return 'FileAnalytics'
  } else if (
    mediaType.includes('powerpoint') ||
    mediaType.includes('presentation') ||
    ext === 'ppt' ||
    ext === 'pptx'
  ) {
    return 'FileInvoice'
  } else if (ext === 'md' || mediaType.includes('markdown')) {
    return 'Markdown'
  } else if (
    mediaType.includes('text/') ||
    mediaType.includes('plain') ||
    textExtensions.includes(ext)
  ) {
    return 'FileText'
  } else if (
    mediaType.includes('javascript') ||
    mediaType.includes('json') ||
    mediaType.includes('xml') ||
    mediaType.includes('html') ||
    mediaType.includes('css') ||
    [
      'js',
      'ts',
      'jsx',
      'tsx',
      'json',
      'xml',
      'html',
      'css',
      'py',
      'java',
      'cpp',
      'c',
      'go',
      'rs',
      'php',
      'rb'
    ].includes(ext)
  ) {
    return 'FileCode'
  } else if (
    mediaType.includes('zip') ||
    mediaType.includes('rar') ||
    mediaType.includes('tar') ||
    mediaType.includes('gzip') ||
    ['zip', 'rar', 'tar', 'gz', '7z'].includes(ext)
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
export const parseBase64DataUrl = (
  value: string
): { mediaType?: string; base64: string } | null => {
  const match = value.match(/^data:([^;,]+)?;base64,(.*)$/)
  if (!match) return null
  return {
    mediaType: match[1],
    base64: match[2]
  }
}

export const uint8ArrayToBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  const chunkSize = 0x8000

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }

  return btoa(binary)
}

export const base64ToUint8Array = (base64: string): Uint8Array => {
  const binary = atob(parseBase64DataUrl(base64)?.base64 || base64)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  return bytes
}

export const concatUint8Arrays = (chunks: Uint8Array[]): Uint8Array => {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0

  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }

  return result
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
    case 'tts':
      return '语音'
    case 'video':
      return '视频'
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
