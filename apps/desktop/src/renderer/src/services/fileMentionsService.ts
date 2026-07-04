import { isTextFile } from '@renderer/utils'

export interface WorkspaceFileEntry {
  name: string
  relativePath: string
  absolutePath: string
  kind: 'file' | 'directory'
}

interface SearchWorkspaceEntriesOptions {
  limit?: number
}

interface ReadWorkspaceFileTextOptions {
  maxChars?: number
}

const DIRECTORY_MODE = 0o040000
const FILE_MODE = 0o100000
const SEARCH_SKIPPED_DIR_NAMES = new Set([
  '.git',
  'node_modules',
  'dist',
  'out',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  '.turbo'
])

const normalizeRelativePath = (value: string) => value.replaceAll('\\', '/')

const getEntryKind = (absolutePath: string): WorkspaceFileEntry['kind'] | null => {
  try {
    const stat = window.api.fs.lstatSync(absolutePath)
    const mode = stat.mode & 0o170000
    if (mode === DIRECTORY_MODE) return 'directory'
    if (mode === FILE_MODE) return 'file'
  } catch {
    return null
  }

  return null
}

const compareWorkspaceEntries = (a: WorkspaceFileEntry, b: WorkspaceFileEntry) => {
  if (a.kind !== b.kind) {
    return a.kind === 'directory' ? -1 : 1
  }

  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
}

export const normalizeWorkspacePath = (workPath: string) => {
  return window.api.path.resolve(window.api.path.normalize(workPath.trim()))
}

export const resolveWorkspacePath = (workPath: string, rawPath: string) => {
  const normalizedWorkPath = normalizeWorkspacePath(workPath)
  const inputPath = rawPath.trim() || '.'
  const resolvedPath = window.api.path.isAbsolute(inputPath)
    ? window.api.path.resolve(window.api.path.normalize(inputPath))
    : window.api.path.resolve(normalizedWorkPath, inputPath)

  const relativePath = window.api.path.relative(normalizedWorkPath, resolvedPath)
  const isInsideWorkPath =
    relativePath === '' || (!relativePath.startsWith('..') && !window.api.path.isAbsolute(relativePath))

  if (!isInsideWorkPath) {
    return null
  }

  return resolvedPath
}

export const getWorkspaceEntry = (workPath: string, rawPath: string): WorkspaceFileEntry | null => {
  const absolutePath = resolveWorkspacePath(workPath, rawPath)
  if (!absolutePath || !window.api.fs.existsSync(absolutePath)) {
    return null
  }

  const kind = getEntryKind(absolutePath)
  if (!kind) {
    return null
  }

  const normalizedWorkPath = normalizeWorkspacePath(workPath)
  const relativePath = normalizeRelativePath(window.api.path.relative(normalizedWorkPath, absolutePath))

  return {
    name: window.api.path.basename(absolutePath),
    relativePath,
    absolutePath,
    kind
  }
}

export const listWorkspaceEntries = (workPath: string, relativeDir: string = ''): WorkspaceFileEntry[] => {
  const absoluteDir = resolveWorkspacePath(workPath, relativeDir || '.')
  if (!absoluteDir || !window.api.fs.existsSync(absoluteDir)) {
    return []
  }

  if (getEntryKind(absoluteDir) !== 'directory') {
    return []
  }

  const normalizedWorkPath = normalizeWorkspacePath(workPath)

  try {
    return window.api.fs
      .readdirSync(absoluteDir)
      .map((entryName) => {
        const absolutePath = window.api.path.join(absoluteDir, entryName)
        const kind = getEntryKind(absolutePath)
        if (!kind) return null

        return {
          name: entryName,
          relativePath: normalizeRelativePath(window.api.path.relative(normalizedWorkPath, absolutePath)),
          absolutePath,
          kind
        } satisfies WorkspaceFileEntry
      })
      .filter((entry): entry is WorkspaceFileEntry => Boolean(entry))
      .sort(compareWorkspaceEntries)
  } catch {
    return []
  }
}

let workspaceIndexCache: {
  workPath: string
  entries: WorkspaceFileEntry[]
  timestamp: number
} | null = null

const WORKSPACE_INDEX_TTL = 60_000 // 60 秒内复用缓存

const buildWorkspaceIndex = (workPath: string): WorkspaceFileEntry[] => {
  const entries: WorkspaceFileEntry[] = []
  const visited = new Set<string>()
  const queue = ['']

  while (queue.length > 0) {
    const currentRelativeDir = queue.shift() || ''
    if (visited.has(currentRelativeDir)) continue
    visited.add(currentRelativeDir)

    const dirEntries = listWorkspaceEntries(workPath, currentRelativeDir)
    for (const entry of dirEntries) {
      entries.push(entry)

      if (entry.kind === 'directory' && !SEARCH_SKIPPED_DIR_NAMES.has(entry.name)) {
        queue.push(entry.relativePath)
      }
    }
  }

  return entries
}

const getWorkspaceIndex = (workPath: string): WorkspaceFileEntry[] => {
  if (
    workspaceIndexCache &&
    workspaceIndexCache.workPath === workPath &&
    Date.now() - workspaceIndexCache.timestamp < WORKSPACE_INDEX_TTL
  ) {
    return workspaceIndexCache.entries
  }

  const entries = buildWorkspaceIndex(workPath)
  workspaceIndexCache = { workPath, entries, timestamp: Date.now() }
  return entries
}

/** 主动使工作区文件索引失效（工作目录切换或文件变更时调用） */
export const invalidateWorkspaceFileIndex = () => {
  workspaceIndexCache = null
}

export const searchWorkspaceEntries = (
  workPath: string,
  query: string,
  options: SearchWorkspaceEntriesOptions = {}
): WorkspaceFileEntry[] => {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) {
    return listWorkspaceEntries(workPath)
  }

  const limit = options.limit ?? 80
  const index = getWorkspaceIndex(workPath)

  const matches: WorkspaceFileEntry[] = []
  for (const entry of index) {
    if (matches.length >= limit) break

    const normalizedName = entry.name.toLowerCase()
    const normalizedRelativePath = entry.relativePath.toLowerCase()

    if (
      normalizedName.includes(normalizedQuery) ||
      normalizedRelativePath.includes(normalizedQuery)
    ) {
      matches.push(entry)
    }
  }

  return matches.sort((a, b) => {
    const aExact = Number(a.name.toLowerCase() === normalizedQuery || a.relativePath.toLowerCase() === normalizedQuery)
    const bExact = Number(b.name.toLowerCase() === normalizedQuery || b.relativePath.toLowerCase() === normalizedQuery)
    if (aExact !== bExact) return bExact - aExact

    const aPrefix = Number(a.name.toLowerCase().startsWith(normalizedQuery))
    const bPrefix = Number(b.name.toLowerCase().startsWith(normalizedQuery))
    if (aPrefix !== bPrefix) return bPrefix - aPrefix

    return compareWorkspaceEntries(a, b)
  })
}

export const readWorkspaceFileText = (
  workPath: string,
  rawPath: string,
  options: ReadWorkspaceFileTextOptions = {}
) => {
  const entry = getWorkspaceEntry(workPath, rawPath)
  if (!entry || entry.kind !== 'file' || !isTextFile(entry.name)) {
    return null
  }

  const maxChars = options.maxChars ?? 12000

  try {
    const content = window.api.fs.readFileSync(entry.absolutePath, 'utf-8')
    if (content.length <= maxChars) {
      return {
        entry,
        content,
        truncated: false
      }
    }

    return {
      entry,
      content: `${content.slice(0, maxChars)}\n\n... [truncated]`,
      truncated: true
    }
  } catch {
    return null
  }
}

// ── Recent file mention tracking (per workPath) ──

const RECENT_FILES_STORAGE_PREFIX = 'at-panel-recent-files:'
const MAX_RECENT_FILES = 10

interface RecentFileRecord {
  relativePath: string
  name: string
  kind: 'file' | 'directory'
  timestamp: number
}

const getRecentFilesStorageKey = (workPath: string) =>
  `${RECENT_FILES_STORAGE_PREFIX}${normalizeWorkspacePath(workPath)}`

const readRecentFileRecords = (workPath: string): RecentFileRecord[] => {
  try {
    const raw = localStorage.getItem(getRecentFilesStorageKey(workPath))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const writeRecentFileRecords = (workPath: string, records: RecentFileRecord[]) => {
  try {
    localStorage.setItem(getRecentFilesStorageKey(workPath), JSON.stringify(records))
  } catch {
    // ignore quota errors
  }
}

/** 记录最近引用的文件（按工作路径独立存储） */
export const recordRecentFileEntry = (workPath: string, entry: WorkspaceFileEntry) => {
  if (!workPath) return
  const records = readRecentFileRecords(workPath)
  const filtered = records.filter((r) => r.relativePath !== entry.relativePath)
  filtered.unshift({
    relativePath: entry.relativePath,
    name: entry.name,
    kind: entry.kind,
    timestamp: Date.now()
  })
  writeRecentFileRecords(workPath, filtered.slice(0, MAX_RECENT_FILES))
}

/** 获取最近引用的文件列表（按工作路径，校验文件仍存在） */
export const getRecentFileEntries = (
  workPath: string,
  limit: number = MAX_RECENT_FILES
): WorkspaceFileEntry[] => {
  if (!workPath) return []
  const records = readRecentFileRecords(workPath).slice(0, limit)
  const entries: WorkspaceFileEntry[] = []
  for (const record of records) {
    const entry = getWorkspaceEntry(workPath, record.relativePath)
    if (entry && entry.kind === record.kind) {
      entries.push(entry)
    }
  }
  return entries
}
