export type SandboxOperationType = 'modify' | 'add' | 'delete' | 'move'

export type SandboxFile = {
  path: string
  content: string
  encoding?: 'text' | 'data-url'
  mediaType?: string
  updatedAt: number
}

export type SandboxState = {
  version: 1
  files: Record<string, SandboxFile>
  activeFilePath: string
  updatedAt: number
}

type SandboxOperation = {
  type?: SandboxOperationType
  filePath: string
  oldStr?: string
  newStr?: string
  targetPath?: string
  overwrite?: boolean
}

const normalizeLineEndings = (value: string) => value.replace(/\r\n/g, '\n')

const IMAGE_FILE_RULES = [
  { extension: '.png', mediaType: 'image/png' },
  { extension: '.jpg', mediaType: 'image/jpeg' },
  { extension: '.jpeg', mediaType: 'image/jpeg' },
  { extension: '.gif', mediaType: 'image/gif' },
  { extension: '.webp', mediaType: 'image/webp' },
  { extension: '.bmp', mediaType: 'image/bmp' },
  { extension: '.svg', mediaType: 'image/svg+xml' },
  { extension: '.ico', mediaType: 'image/x-icon' },
  { extension: '.avif', mediaType: 'image/avif' }
]

const DATA_URL_RE = /^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,([\s\S]+)$/i

export const getSandboxMediaType = (filePath: string): string => {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html'
  if (lower.endsWith('.css')) return 'text/css'
  if (lower.endsWith('.js') || lower.endsWith('.mjs')) return 'text/javascript'
  if (lower.endsWith('.json')) return 'application/json'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  if (lower.endsWith('.txt')) return 'text/plain'
  const matched = IMAGE_FILE_RULES.find((rule) => lower.endsWith(rule.extension))
  return matched?.mediaType || 'text/plain'
}

export const isSandboxImagePath = (filePath: string): boolean => {
  const lower = filePath.toLowerCase()
  return IMAGE_FILE_RULES.some((rule) => lower.endsWith(rule.extension))
}

export const isSandboxImageFile = (file?: Pick<SandboxFile, 'path' | 'mediaType'> | null): boolean => {
  if (!file) return false
  return String(file.mediaType || '').startsWith('image/') || isSandboxImagePath(file.path)
}

export const parseSandboxDataUrl = (value: string): { mediaType: string; base64: string } | null => {
  const matched = value.match(DATA_URL_RE)
  if (!matched) return null
  return {
    mediaType: matched[1] || 'application/octet-stream',
    base64: matched[2] || ''
  }
}

export const normalizeSandboxPath = (rawPath: string): string => {
  const trimmed = String(rawPath || '').trim()
  if (!trimmed) {
    throw new Error('file_path 不能为空')
  }

  const normalized = trimmed.replaceAll('\\', '/')
  const segments = normalized.split('/').filter(Boolean)

  for (const segment of segments) {
    if (segment === '.' || segment === '..') {
      throw new Error(`非法路径: ${rawPath}`)
    }
  }

  return `/${segments.join('/')}`
}

export const getSandboxFileLanguage = (filePath: string): string => {
  if (isSandboxImagePath(filePath)) return 'binary'
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html'
  if (lower.endsWith('.css')) return 'css'
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return 'javascript'
  if (lower.endsWith('.json')) return 'json'
  if (lower.endsWith('.ts')) return 'typescript'
  if (lower.endsWith('.md')) return 'markdown'
  return 'text'
}

export const createSandboxState = (): SandboxState => {
  const now = Date.now()

  return {
    version: 1,
    files: {},
    activeFilePath: '',
    updatedAt: now
  }
}

export const ensureSandboxState = (value?: Partial<SandboxState> | null): SandboxState => {
  if (!value || typeof value !== 'object' || !value.files || typeof value.files !== 'object') {
    return createSandboxState()
  }

  const files = Object.fromEntries(
    Object.entries(value.files)
      .map(([key, file]) => {
        if (!file || typeof file !== 'object') return null
        const path = normalizeSandboxPath((file as SandboxFile).path || key)
        const content = typeof (file as SandboxFile).content === 'string' ? (file as SandboxFile).content : ''
        const encoding = (file as SandboxFile).encoding === 'data-url' ? 'data-url' : 'text'
        const mediaType = typeof (file as SandboxFile).mediaType === 'string' && (file as SandboxFile).mediaType
          ? (file as SandboxFile).mediaType
          : undefined
        const updatedAt = typeof (file as SandboxFile).updatedAt === 'number' ? (file as SandboxFile).updatedAt : Date.now()
        return [path, { path, content, encoding, mediaType, updatedAt }]
      })
      .filter(Boolean) as Array<[string, SandboxFile]>
  )

  const filePaths = Object.keys(files)
  if (filePaths.length === 0) {
    return createSandboxState()
  }

  let normalizedActiveFilePath = ''
  if (typeof value.activeFilePath === 'string') {
    try {
      const candidatePath = normalizeSandboxPath(value.activeFilePath)
      if (files[candidatePath]) {
        normalizedActiveFilePath = candidatePath
      }
    } catch {
      normalizedActiveFilePath = ''
    }
  }

  const activeFilePath =
    normalizedActiveFilePath ||
    sortSandboxFiles({ version: 1, files, activeFilePath: '', updatedAt: Date.now() })[0]?.path ||
    filePaths[0]

  return {
    version: 1,
    files,
    activeFilePath,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now()
  }
}

export const sortSandboxFiles = (state: SandboxState): SandboxFile[] => {
  return Object.values(state.files).sort((a, b) => {
    const aPriority = a.path === '/index.html' ? 0 : a.path === '/style.css' ? 1 : a.path === '/main.js' ? 2 : 3
    const bPriority = b.path === '/index.html' ? 0 : b.path === '/style.css' ? 1 : b.path === '/main.js' ? 2 : 3
    if (aPriority !== bPriority) return aPriority - bPriority
    return a.path.localeCompare(b.path)
  })
}

export const getSandboxFile = (state: SandboxState, filePath?: string | null): SandboxFile | null => {
  if (!filePath) return null
  try {
    const normalizedPath = normalizeSandboxPath(filePath)
    return state.files[normalizedPath] || null
  } catch {
    return null
  }
}

export const setSandboxActiveFile = (state: SandboxState, filePath: string): SandboxState => {
  const normalizedPath = normalizeSandboxPath(filePath)
  if (!state.files[normalizedPath]) {
    throw new Error(`文件不存在: ${normalizedPath}`)
  }

  return {
    ...state,
    activeFilePath: normalizedPath
  }
}

export const updateSandboxFileContent = (
  state: SandboxState,
  filePath: string,
  content: string
): SandboxState => {
  const normalizedPath = normalizeSandboxPath(filePath)
  const file = state.files[normalizedPath]
  if (!file) {
    throw new Error(`文件不存在: ${normalizedPath}`)
  }

  const now = Date.now()

  return {
    ...state,
    updatedAt: now,
    files: {
      ...state.files,
      [normalizedPath]: {
        ...file,
        content,
        encoding: 'text',
        updatedAt: now
      }
    }
  }
}

export const applySandboxOperation = (
  state: SandboxState,
  operation: SandboxOperation
): { state: SandboxState; summary: string } => {
  const type = operation.type || 'modify'
  const sourcePath = normalizeSandboxPath(operation.filePath)
  const now = Date.now()
  const nextFiles = { ...state.files }

  if (type === 'modify') {
    const file = nextFiles[sourcePath]
    if (!file) {
      throw new Error(`文件不存在: ${sourcePath}`)
    }
    if (typeof operation.oldStr !== 'string' || operation.oldStr.length === 0 || typeof operation.newStr !== 'string') {
      throw new Error('type=modify 需要 old_str 和 new_str')
    }

    const content = file.content
    if (content.includes(operation.oldStr)) {
      nextFiles[sourcePath] = {
        ...file,
        content: content.replace(operation.oldStr, operation.newStr),
        encoding: 'text',
        updatedAt: now
      }
      return {
        state: { ...state, files: nextFiles, updatedAt: now },
        summary: `Successfully replaced content in ${sourcePath}`
      }
    }

    const normalizedContent = normalizeLineEndings(content)
    const normalizedOldStr = normalizeLineEndings(operation.oldStr)
    if (!normalizedContent.includes(normalizedOldStr)) {
      throw new Error('old_str was not found in the file. Ensure the snippet matches exactly.')
    }

    nextFiles[sourcePath] = {
      ...file,
      content: normalizedContent.replace(normalizedOldStr, normalizeLineEndings(operation.newStr)),
      encoding: 'text',
      updatedAt: now
    }
    return {
      state: { ...state, files: nextFiles, updatedAt: now },
      summary: `Successfully replaced content in ${sourcePath} (normalized line endings)`
    }
  }

  if (type === 'add') {
    const existed = Boolean(nextFiles[sourcePath])
    if (typeof operation.newStr !== 'string') {
      throw new Error('type=add 需要 new_str')
    }
    if (existed && !operation.overwrite) {
      throw new Error(`Add file failed: file already exists ${sourcePath}. Pass overwrite=true to replace it.`)
    }

    nextFiles[sourcePath] = {
      path: sourcePath,
      content: operation.newStr,
      encoding: 'text',
      mediaType: getSandboxMediaType(sourcePath),
      updatedAt: now
    }

    return {
      state: {
        ...state,
        files: nextFiles,
        activeFilePath: sourcePath,
        updatedAt: now
      },
      summary: existed ? `Successfully wrote file ${sourcePath}` : `Successfully created file ${sourcePath}`
    }
  }

  if (type === 'delete') {
    if (!nextFiles[sourcePath]) {
      throw new Error(`文件不存在: ${sourcePath}`)
    }

    delete nextFiles[sourcePath]
    const remaining = Object.values(nextFiles)
    if (remaining.length === 0) {
      return {
        state: createSandboxState(),
        summary: `Successfully deleted file ${sourcePath}`
      }
    }

    const nextState = {
      ...state,
      files: nextFiles,
      activeFilePath: state.activeFilePath === sourcePath ? sortSandboxFiles({ ...state, files: nextFiles })[0].path : state.activeFilePath,
      updatedAt: now
    }

    return {
      state: nextState,
      summary: `Successfully deleted file ${sourcePath}`
    }
  }

  const targetPath = normalizeSandboxPath(operation.targetPath || '')
  if (!nextFiles[sourcePath]) {
    throw new Error(`文件不存在: ${sourcePath}`)
  }
  if (sourcePath === targetPath) {
    throw new Error('Move file failed: source and destination are the same.')
  }
  if (nextFiles[targetPath] && !operation.overwrite) {
    throw new Error(`Move file failed: destination already exists ${targetPath}. Pass overwrite=true to replace it.`)
  }

  const sourceFile = nextFiles[sourcePath]
  delete nextFiles[sourcePath]
  nextFiles[targetPath] = {
    path: targetPath,
    content: sourceFile.content,
    encoding: sourceFile.encoding,
    mediaType: sourceFile.mediaType,
    updatedAt: now
  }

  return {
    state: {
      ...state,
      files: nextFiles,
      activeFilePath: state.activeFilePath === sourcePath ? targetPath : state.activeFilePath,
      updatedAt: now
    },
    summary: `Successfully moved file from ${sourcePath} to ${targetPath}`
  }
}

export const formatSandboxResult = (state: SandboxState): string => {
  const files = sortSandboxFiles(state)
  if (files.length === 0) {
    return '当前 sandbox 为空。'
  }

  return files
    .map((file) => {
      if (file.encoding === 'data-url') {
        return `文件: ${file.path}\n[binary ${file.mediaType || 'application/octet-stream'}]`
      }
      const language = getSandboxFileLanguage(file.path)
      return `文件: ${file.path}\n\`\`\`${language}\n${file.content}\n\`\`\``
    })
    .join('\n\n')
}

export type SandboxTreeNode = {
  id: string
  name: string
  path: string
  type: 'directory' | 'file'
  children?: SandboxTreeNode[]
}

export const buildSandboxTree = (state: SandboxState): SandboxTreeNode[] => {
  const root: SandboxTreeNode[] = []

  for (const file of sortSandboxFiles(state)) {
    const parts = file.path.split('/').filter(Boolean)
    let level = root
    let currentPath = ''

    parts.forEach((part, index) => {
      currentPath += `/${part}`
      const isFile = index === parts.length - 1
      let node = level.find((item) => item.path === currentPath)

      if (!node) {
        node = {
          id: currentPath,
          name: part,
          path: currentPath,
          type: isFile ? 'file' : 'directory',
          children: isFile ? undefined : []
        }
        level.push(node)
      }

      if (!isFile) {
        if (!node.children) {
          node.children = []
        }
        level = node.children
      }
    })
  }

  const sortNodes = (nodes: SandboxTreeNode[]): SandboxTreeNode[] => {
    return nodes
      .map((node) => ({
        ...node,
        children: node.children ? sortNodes(node.children) : undefined
      }))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
  }

  return sortNodes(root)
}

const escapeForInlineScript = (value: string) => {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/<\/script/gi, '<\\/script')
}

export const buildSandboxPreviewDocument = (state: SandboxState, channelId: string): string => {
  const files = Object.fromEntries(sortSandboxFiles(state).map((file) => [
    file.path,
    {
      content: file.content,
      encoding: file.encoding || 'text',
      mediaType: file.mediaType || getSandboxMediaType(file.path)
    }
  ]))
  const entryPath = files['/index.html'] ? '/index.html' : Object.keys(files).find((path) => path.endsWith('.html')) || ''

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sandbox Preview</title>
  </head>
  <body>
    <script>
      (() => {
        const channelId = ${escapeForInlineScript(channelId)}
        const files = ${escapeForInlineScript(JSON.stringify(files))}
        const entryPath = ${escapeForInlineScript(entryPath)}
        const fileMap = JSON.parse(files)
        const blobCache = new Map()

        const post = (kind, payload = {}) => {
          window.parent.postMessage({ source: 'agent-qi-sandbox', channelId, kind, ...payload }, '*')
        }

        const normalizePath = (rawPath) => {
          const value = String(rawPath || '').replace(/\\\\/g, '/')
          const parts = value.split('/').filter(Boolean)
          const normalized = []
          for (const part of parts) {
            if (part === '.' || part === '') continue
            if (part === '..') {
              normalized.pop()
              continue
            }
            normalized.push(part)
          }
          return '/' + normalized.join('/')
        }

        const resolveFilePath = (fromPath, targetPath) => {
          if (!targetPath) return ''
          if (/^(https?:|data:|blob:|mailto:|tel:|#)/i.test(targetPath)) return targetPath
          if (targetPath.startsWith('/')) return normalizePath(targetPath)
          const fromParts = normalizePath(fromPath).split('/').filter(Boolean)
          fromParts.pop()
          const targetParts = String(targetPath).replace(/\\\\/g, '/').split('/')
          for (const part of targetParts) {
            if (!part || part === '.') continue
            if (part === '..') {
              fromParts.pop()
              continue
            }
            fromParts.push(part)
          }
          return '/' + fromParts.join('/')
        }

        const getFileRecord = (filePath) => fileMap[filePath]

        const mimeTypeForPath = (filePath) => {
          const record = getFileRecord(filePath)
          return record?.mediaType || 'text/plain'
        }

        const rewriteJsImports = (content, currentPath) => {
          const specifierRegex = /(from\\s*['"])([^'"]+)(['"])|(import\\s*\\(\\s*['"])([^'"]+)(['"]\\s*\\))/g
          return content.replace(specifierRegex, (match, fromPrefix, fromSpecifier, fromSuffix, importPrefix, importSpecifier, importSuffix) => {
            const rawSpecifier = fromSpecifier || importSpecifier
            if (!rawSpecifier || /^(https?:|data:|blob:|node:|npm:)/i.test(rawSpecifier)) {
              return match
            }
            const resolvedPath = resolveFilePath(currentPath, rawSpecifier)
            if (!fileMap[resolvedPath]) {
              return match
            }
            const url = createBlobUrl(resolvedPath)
            if (fromSpecifier) return fromPrefix + url + fromSuffix
            return importPrefix + url + importSuffix
          })
        }

        const createBlobUrl = (filePath) => {
          const record = getFileRecord(filePath)
          if (!record) return filePath
          if (blobCache.has(filePath)) return blobCache.get(filePath)
          if (record.encoding === 'data-url' && typeof record.content === 'string' && record.content.startsWith('data:')) {
            blobCache.set(filePath, record.content)
            return record.content
          }
          const mimeType = mimeTypeForPath(filePath)
          const rawContent = record.content || ''
          const content = mimeType.includes('javascript') ? rewriteJsImports(rawContent, filePath) : rawContent
          const url = URL.createObjectURL(new Blob([content], { type: mimeType }))
          blobCache.set(filePath, url)
          return url
        }

        const consoleMethods = ['log', 'info', 'warn', 'error']
        for (const level of consoleMethods) {
          const original = console[level]
          console[level] = (...args) => {
            try {
              post('console', {
                level,
                text: args.map((item) => {
                  if (typeof item === 'string') return item
                  try {
                    return JSON.stringify(item)
                  } catch {
                    return String(item)
                  }
                }).join(' ')
              })
            } catch {}
            original.apply(console, args)
          }
        }

        window.addEventListener('error', (event) => {
          post('error', {
            text: event.message || 'Unknown error',
            filename: event.filename || '',
            lineno: event.lineno || 0,
            colno: event.colno || 0
          })
        })

        window.addEventListener('unhandledrejection', (event) => {
          const reason = event.reason
          post('error', {
            text: reason instanceof Error ? reason.message : String(reason || 'Unhandled promise rejection')
          })
        })

        const render = () => {
          if (!entryPath || !fileMap[entryPath]) {
            document.body.innerHTML = '<div style="display:grid;place-items:center;min-height:100vh;padding:24px;text-align:center;font-family:system-ui,sans-serif;color:#64748b;">未找到 /index.html，无法预览。</div>'
            post('ready', { entryPath: '' })
            return
          }

          const parser = new DOMParser()
          const doc = parser.parseFromString(fileMap[entryPath].content || '', 'text/html')

          for (const link of doc.querySelectorAll('link[href]')) {
            const href = link.getAttribute('href') || ''
            const resolvedPath = resolveFilePath(entryPath, href)
            if (fileMap[resolvedPath]) {
              link.setAttribute('href', createBlobUrl(resolvedPath))
            }
          }

          for (const script of doc.querySelectorAll('script[src]')) {
            const src = script.getAttribute('src') || ''
            const resolvedPath = resolveFilePath(entryPath, src)
            if (fileMap[resolvedPath]) {
              script.setAttribute('src', createBlobUrl(resolvedPath))
            }
          }

          for (const element of doc.querySelectorAll('[src]')) {
            if (element.tagName.toLowerCase() === 'script') continue
            const src = element.getAttribute('src') || ''
            const resolvedPath = resolveFilePath(entryPath, src)
            if (fileMap[resolvedPath]) {
              element.setAttribute('src', createBlobUrl(resolvedPath))
            }
          }

          const head = doc.head || doc.getElementsByTagName('head')[0]
          if (head) {
            const style = doc.createElement('style')
            style.setAttribute('data-agent-qi-preview', 'true')
            style.textContent = 'html,body{overflow:hidden!important;scrollbar-width:none;-ms-overflow-style:none;}html::-webkit-scrollbar,body::-webkit-scrollbar{display:none;}'
            head.appendChild(style)
          }

          document.open()
          document.write('<!doctype html>\\n' + doc.documentElement.outerHTML)
          document.close()
          post('ready', { entryPath })
        }

        render()
      })()
    </script>
  </body>
</html>`
}
