import { isTextFile } from '@renderer/utils'

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
  return matched?.mediaType || (window.api.mime.lookup(filePath) as string) || 'application/octet-stream'
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
  if (!isTextFile(filePath)) return 'binary'
  const lower = filePath.toLowerCase()
  const fileName = lower.split('/').pop() || lower
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html'
  if (lower.endsWith('.vue')) return 'html'
  if (lower.endsWith('.css')) return 'css'
  if (lower.endsWith('.scss') || lower.endsWith('.sass')) return 'scss'
  if (lower.endsWith('.less')) return 'less'
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return 'javascript'
  if (lower.endsWith('.jsx')) return 'javascript'
  if (lower.endsWith('.json')) return 'json'
  if (lower.endsWith('.json5')) return 'json'
  if (lower.endsWith('.ts') || lower.endsWith('.mts') || lower.endsWith('.cts')) return 'typescript'
  if (lower.endsWith('.tsx')) return 'typescript'
  if (lower.endsWith('.md')) return 'markdown'
  if (lower.endsWith('.py')) return 'python'
  if (lower.endsWith('.java')) return 'java'
  if (lower.endsWith('.kt') || lower.endsWith('.kts')) return 'kotlin'
  if (lower.endsWith('.go')) return 'go'
  if (lower.endsWith('.rs')) return 'rust'
  if (lower.endsWith('.php')) return 'php'
  if (lower.endsWith('.rb')) return 'ruby'
  if (lower.endsWith('.swift')) return 'swift'
  if (lower.endsWith('.dart')) return 'dart'
  if (lower.endsWith('.lua')) return 'lua'
  if (lower.endsWith('.sh') || lower.endsWith('.bash') || lower.endsWith('.zsh')) return 'shell'
  if (lower.endsWith('.ps1') || lower.endsWith('.psm1') || lower.endsWith('.psd1')) return 'powershell'
  if (lower.endsWith('.bat') || lower.endsWith('.cmd')) return 'bat'
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'yaml'
  if (lower.endsWith('.xml') || lower.endsWith('.xaml') || lower.endsWith('.plist')) return 'xml'
  if (lower.endsWith('.toml')) return 'ini'
  if (lower.endsWith('.ini') || lower.endsWith('.cfg') || lower.endsWith('.conf')) return 'ini'
  if (lower.endsWith('.sql')) return 'sql'
  if (lower.endsWith('.graphql') || lower.endsWith('.gql')) return 'graphql'
  if (lower.endsWith('.dockerfile') || fileName === 'dockerfile') return 'dockerfile'
  if (lower.endsWith('.c')) return 'c'
  if (lower.endsWith('.h')) return 'cpp'
  if (lower.endsWith('.cpp') || lower.endsWith('.cc') || lower.endsWith('.cxx') || lower.endsWith('.hpp')) return 'cpp'
  if (lower.endsWith('.cs')) return 'csharp'
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

export const sortSandboxFiles = (state: SandboxState): SandboxFile[] => {
  return Object.values(state.files).sort((a, b) => {
    const aPriority = a.path === '/index.html' ? 0 : a.path === '/style.css' ? 1 : a.path === '/main.js' ? 2 : 3
    const bPriority = b.path === '/index.html' ? 0 : b.path === '/style.css' ? 1 : b.path === '/main.js' ? 2 : 3
    if (aPriority !== bPriority) return aPriority - bPriority
    return a.path.localeCompare(b.path)
  })
}

const decodeSandboxBase64 = (value: string) => {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'base64')
  }

  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

const encodeSandboxBase64 = (value: Uint8Array) => {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value).toString('base64')
  }

  let binary = ''
  for (let i = 0; i < value.length; i += 1) {
    binary += String.fromCharCode(value[i]!)
  }
  return btoa(binary)
}

export const writeSandboxStateToWorkspace = (state: SandboxState, workspaceDir: string) => {
  window.api.fs.mkdirSync(workspaceDir, { recursive: true })

  const existingEntries = window.api.fs.readdirSync(workspaceDir, { withFileTypes: true })
  for (const entry of existingEntries) {
    window.api.fs.rmSync(window.api.path.join(workspaceDir, entry.name), { recursive: true, force: true })
  }

  sortSandboxFiles(state).forEach((file) => {
    const relativePath = file.path.replace(/^\/+/, '')
    if (!relativePath) return

    const outputPath = window.api.path.join(workspaceDir, ...relativePath.split('/'))
    const parentDir = window.api.path.dirname(outputPath)
    window.api.fs.mkdirSync(parentDir, { recursive: true })

    if (file.encoding === 'data-url') {
      const parsed = parseSandboxDataUrl(file.content)
      if (parsed) {
        window.api.fs.writeFileSync(outputPath, decodeSandboxBase64(parsed.base64))
        return
      }
    }

    window.api.fs.writeFileSync(outputPath, file.content, 'utf-8')
  })
}

export const writeSandboxStateToWorkspaceAsync = async (state: SandboxState, workspaceDir: string) => {
  await window.api.fs.promises.mkdir(workspaceDir, { recursive: true })

  const existingEntries = await window.api.fs.promises.readdir(workspaceDir, { withFileTypes: true })
  await Promise.all(
    existingEntries.map((entry) =>
      window.api.fs.promises.rm(window.api.path.join(workspaceDir, entry.name), { recursive: true, force: true })
    )
  )

  for (const file of sortSandboxFiles(state)) {
    const relativePath = file.path.replace(/^\/+/, '')
    if (!relativePath) continue

    const outputPath = window.api.path.join(workspaceDir, ...relativePath.split('/'))
    const parentDir = window.api.path.dirname(outputPath)
    await window.api.fs.promises.mkdir(parentDir, { recursive: true })

    if (file.encoding === 'data-url') {
      const parsed = parseSandboxDataUrl(file.content)
      if (parsed) {
        await window.api.fs.promises.writeFile(outputPath, decodeSandboxBase64(parsed.base64))
        continue
      }
    }

    await window.api.fs.promises.writeFile(outputPath, file.content, 'utf-8')
  }
}

export const getSandboxTempWorkspaceRoot = () => {
  return window.api.path.join(window.api.getPath('temp'), 'agent-qi-canvas-exec')
}

export const getSandboxTempWorkspacePath = (workspaceId = 'default') => {
  return window.api.path.join(getSandboxTempWorkspaceRoot(), workspaceId)
}

export const ensureSandboxWorkspaceDir = (workspaceId = 'default') => {
  const workspaceDir = getSandboxTempWorkspacePath(workspaceId)
  window.api.fs.mkdirSync(workspaceDir, { recursive: true })
  return workspaceDir
}

export const ensureSandboxWorkspaceDirAsync = async (workspaceId = 'default') => {
  const workspaceDir = getSandboxTempWorkspacePath(workspaceId)
  await window.api.fs.promises.mkdir(workspaceDir, { recursive: true })
  return workspaceDir
}

export const getSandboxWorkspaceFilePath = (workspaceDir: string, sandboxPath: string) => {
  const normalizedPath = normalizeSandboxPath(sandboxPath)
  const relativePath = normalizedPath.replace(/^\/+/, '')
  if (!relativePath) {
    throw new Error('file_path 不能为空')
  }
  return window.api.path.join(workspaceDir, ...relativePath.split('/'))
}

export const writeSandboxFileToWorkspace = (workspaceDir: string, file: SandboxFile) => {
  const outputPath = getSandboxWorkspaceFilePath(workspaceDir, file.path)
  const parentDir = window.api.path.dirname(outputPath)
  window.api.fs.mkdirSync(parentDir, { recursive: true })

  if (file.encoding === 'data-url') {
    const parsed = parseSandboxDataUrl(file.content)
    if (parsed) {
      window.api.fs.writeFileSync(outputPath, decodeSandboxBase64(parsed.base64))
      return outputPath
    }
  }

  window.api.fs.writeFileSync(outputPath, file.content, 'utf-8')
  return outputPath
}

const removeEmptyParentDirectories = (workspaceDir: string, startPath: string) => {
  const normalizedWorkspaceDir = window.api.path.resolve(workspaceDir)
  let currentDir = window.api.path.dirname(startPath)

  while (currentDir.startsWith(normalizedWorkspaceDir) && currentDir !== normalizedWorkspaceDir) {
    if (!window.api.fs.existsSync(currentDir)) {
      currentDir = window.api.path.dirname(currentDir)
      continue
    }

    if (window.api.fs.readdirSync(currentDir).length > 0) {
      break
    }

    window.api.fs.rmdirSync(currentDir)
    currentDir = window.api.path.dirname(currentDir)
  }
}

export const deleteSandboxFileFromWorkspace = (workspaceDir: string, sandboxPath: string) => {
  const outputPath = getSandboxWorkspaceFilePath(workspaceDir, sandboxPath)
  if (!window.api.fs.existsSync(outputPath)) {
    throw new Error(`文件不存在: ${normalizeSandboxPath(sandboxPath)}`)
  }
  window.api.fs.rmSync(outputPath, { force: true })
  removeEmptyParentDirectories(workspaceDir, outputPath)
}

export const moveSandboxFileInWorkspace = (
  workspaceDir: string,
  sourcePath: string,
  targetPath: string,
  overwrite = false
) => {
  const sourceFsPath = getSandboxWorkspaceFilePath(workspaceDir, sourcePath)
  const targetFsPath = getSandboxWorkspaceFilePath(workspaceDir, targetPath)

  if (!window.api.fs.existsSync(sourceFsPath)) {
    throw new Error(`文件不存在: ${normalizeSandboxPath(sourcePath)}`)
  }
  if (window.api.fs.existsSync(targetFsPath) && !overwrite) {
    throw new Error(`Move file failed: destination already exists ${normalizeSandboxPath(targetPath)}. Pass overwrite=true to replace it.`)
  }

  window.api.fs.mkdirSync(window.api.path.dirname(targetFsPath), { recursive: true })
  if (window.api.fs.existsSync(targetFsPath)) {
    window.api.fs.rmSync(targetFsPath, { recursive: true, force: true })
  }
  window.api.fs.renameSync(sourceFsPath, targetFsPath)
  removeEmptyParentDirectories(workspaceDir, sourceFsPath)
}

export const clearSandboxWorkspace = (workspaceDir: string) => {
  window.api.fs.mkdirSync(workspaceDir, { recursive: true })
  const existingEntries = window.api.fs.readdirSync(workspaceDir, { withFileTypes: true })
  for (const entry of existingEntries) {
    window.api.fs.rmSync(window.api.path.join(workspaceDir, entry.name), { recursive: true, force: true })
  }
}

export const ensureSandboxTempWorkspace = (state: SandboxState, workspaceId = 'default') => {
  const workspaceDir = getSandboxTempWorkspacePath(workspaceId)
  writeSandboxStateToWorkspace(state, workspaceDir)
  return workspaceDir
}

export const ensureSandboxTempWorkspaceAsync = async (state: SandboxState, workspaceId = 'default') => {
  const workspaceDir = getSandboxTempWorkspacePath(workspaceId)
  await writeSandboxStateToWorkspaceAsync(state, workspaceDir)
  return workspaceDir
}

export const readSandboxWorkspace = (workspaceDir: string): SandboxState => {
  const nextState = createSandboxState()
  const fileEntries: typeof nextState.files = {}

  const walk = (currentDir: string) => {
    const entries = window.api.fs.readdirSync(currentDir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = window.api.path.join(currentDir, entry.name)
      const stat = window.api.fs.statSync(fullPath)
      const entryType = stat.mode & 0o170000
      const isDirectory = entryType === 0o040000
      const isFile = entryType === 0o100000

      if (isDirectory) {
        walk(fullPath)
        continue
      }

      if (!isFile) continue

      const relativePath = window.api.path.relative(workspaceDir, fullPath).replaceAll('\\', '/')
      const sandboxPath = normalizeSandboxPath(relativePath)
      const shouldReadAsBinary = !isTextFile(sandboxPath)
      const content = shouldReadAsBinary
        ? (() => {
          const bytes = window.api.fs.readFileSync(fullPath)
          const mediaType = getSandboxMediaType(sandboxPath)
          return `data:${mediaType};base64,${encodeSandboxBase64(bytes)}`
        })()
        : window.api.fs.readFileSync(fullPath, 'utf-8')

      fileEntries[sandboxPath] = {
        path: sandboxPath,
        content,
        encoding: shouldReadAsBinary ? 'data-url' : 'text',
        mediaType: shouldReadAsBinary ? getSandboxMediaType(sandboxPath) : undefined,
        updatedAt: stat.mtimeMs || Date.now()
      }
    }
  }

  walk(workspaceDir)

  nextState.files = fileEntries
  nextState.updatedAt = Date.now()
  nextState.activeFilePath = sortSandboxFiles(nextState)[0]?.path || ''

  return nextState
}

export const readSandboxWorkspaceAsync = async (workspaceDir: string): Promise<SandboxState> => {
  const nextState = createSandboxState()
  const fileEntries: typeof nextState.files = {}

  const walk = async (currentDir: string) => {
    const entries = await window.api.fs.promises.readdir(currentDir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = window.api.path.join(currentDir, entry.name)
      const stat = await window.api.fs.promises.stat(fullPath)
      const entryType = stat.mode & 0o170000
      const isDirectory = entryType === 0o040000
      const isFile = entryType === 0o100000

      if (isDirectory) {
        await walk(fullPath)
        continue
      }

      if (!isFile) continue

      const relativePath = window.api.path.relative(workspaceDir, fullPath).replaceAll('\\', '/')
      const sandboxPath = normalizeSandboxPath(relativePath)
      const shouldReadAsBinary = !isTextFile(sandboxPath)
      const content = shouldReadAsBinary
        ? (() => {
          const bytes = window.api.fs.readFileSync(fullPath)
          const mediaType = getSandboxMediaType(sandboxPath)
          return `data:${mediaType};base64,${encodeSandboxBase64(bytes)}`
        })()
        : await window.api.fs.promises.readFile(fullPath, 'utf-8')

      fileEntries[sandboxPath] = {
        path: sandboxPath,
        content,
        encoding: shouldReadAsBinary ? 'data-url' : 'text',
        mediaType: shouldReadAsBinary ? getSandboxMediaType(sandboxPath) : undefined,
        updatedAt: stat.mtimeMs || Date.now()
      }
    }
  }

  await walk(workspaceDir)

  nextState.files = fileEntries
  nextState.updatedAt = Date.now()
  nextState.activeFilePath = sortSandboxFiles(nextState)[0]?.path || ''

  return nextState
}

export type SandboxWorkspaceEntry = {
  name: string
  path: string
  type: 'directory' | 'file'
  hasChildren: boolean
}

const FS_MODE_DIRECTORY = 0o040000
const getIsDirectoryFromStat = (stat: { mode?: number | null }) => {
  return (Number(stat.mode) & 0o170000) === FS_MODE_DIRECTORY
}

export const listSandboxWorkspaceDirectory = (
  workspaceDir: string,
  directoryPath = '/'
): SandboxWorkspaceEntry[] => {
  const normalizedDirectoryPath = directoryPath === '/' ? '/' : normalizeSandboxPath(directoryPath)
  const targetDir = normalizedDirectoryPath === '/'
    ? workspaceDir
    : getSandboxWorkspaceFilePath(workspaceDir, normalizedDirectoryPath)

  if (!window.api.fs.existsSync(targetDir)) {
    if (normalizedDirectoryPath === '/') return []
    throw new Error(`目录不存在: ${normalizedDirectoryPath}`)
  }

  return window.api.fs.readdirSync(targetDir, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = window.api.path.join(targetDir, entry.name)
      const sandboxPath = normalizeSandboxPath(
        normalizedDirectoryPath === '/' ? `/${entry.name}` : `${normalizedDirectoryPath}/${entry.name}`
      )

      try {
        const stat = window.api.fs.statSync(fullPath)
        const isDirectory = getIsDirectoryFromStat(stat)
        return [{
          name: entry.name,
          path: sandboxPath,
          type: isDirectory ? 'directory' : 'file',
          hasChildren: isDirectory ? window.api.fs.readdirSync(fullPath).length > 0 : false
        } satisfies SandboxWorkspaceEntry]
      } catch {
        // pnpm node_modules may contain dangling platform-specific symlinks.
        // Keep the rest of the directory browsable instead of failing the whole listing.
        try {
          const fallbackStat = window.api.fs.lstatSync(fullPath)
          return [{
            name: entry.name,
            path: sandboxPath,
            type: getIsDirectoryFromStat(fallbackStat) ? 'directory' : 'file',
            hasChildren: false
          } satisfies SandboxWorkspaceEntry]
        } catch {
          return []
        }
      }
    })
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.path.localeCompare(b.path)
    })
}

export const readSandboxFileFromWorkspace = (workspaceDir: string, filePath: string): SandboxFile => {
  const sandboxPath = normalizeSandboxPath(filePath)
  const fullPath = getSandboxWorkspaceFilePath(workspaceDir, sandboxPath)

  if (!window.api.fs.existsSync(fullPath)) {
    throw new Error(`文件不存在: ${sandboxPath}`)
  }

  const stat = window.api.fs.statSync(fullPath)
  const shouldReadAsBinary = !isTextFile(sandboxPath)
  const content = shouldReadAsBinary
    ? (() => {
      const bytes = window.api.fs.readFileSync(fullPath)
      const mediaType = getSandboxMediaType(sandboxPath)
      return `data:${mediaType};base64,${encodeSandboxBase64(bytes)}`
    })()
    : window.api.fs.readFileSync(fullPath, 'utf-8')

  return {
    path: sandboxPath,
    content,
    encoding: shouldReadAsBinary ? 'data-url' : 'text',
    mediaType: shouldReadAsBinary ? getSandboxMediaType(sandboxPath) : undefined,
    updatedAt: stat.mtimeMs || Date.now()
  }
}

export const collectSandboxWorkspaceFiles = (workspaceDir: string, directoryPath = '/'): string[] => {
  const normalizedDirectoryPath = directoryPath === '/' ? '/' : normalizeSandboxPath(directoryPath)
  const targetDir = normalizedDirectoryPath === '/'
    ? workspaceDir
    : getSandboxWorkspaceFilePath(workspaceDir, normalizedDirectoryPath)

  if (!window.api.fs.existsSync(targetDir)) {
    return []
  }

  const files: string[] = []
  const walk = (currentDir: string, currentPath: string) => {
    window.api.fs.readdirSync(currentDir, { withFileTypes: true }).forEach((entry) => {
      const nextPath = normalizeSandboxPath(currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`)
      const fullPath = window.api.path.join(currentDir, entry.name)
      const stat = window.api.fs.statSync(fullPath)
      const entryType = stat.mode & 0o170000
      const isDirectory = entryType === 0o040000
      if (isDirectory) {
        walk(fullPath, nextPath)
        return
      }
      files.push(nextPath)
    })
  }

  walk(targetDir, normalizedDirectoryPath)
  return files.sort((a, b) => a.localeCompare(b))
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
