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

export const searchWorkspaceEntries = (
  workPath: string,
  query: string,
  options: SearchWorkspaceEntriesOptions = {}
): WorkspaceFileEntry[] => {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) {
    return listWorkspaceEntries(workPath)
  }

  const limit = options.limit ?? 60
  const matches: WorkspaceFileEntry[] = []
  const visited = new Set<string>()
  const queue = ['']

  while (queue.length > 0 && matches.length < limit) {
    const currentRelativeDir = queue.shift() || ''
    if (visited.has(currentRelativeDir)) continue
    visited.add(currentRelativeDir)

    const entries = listWorkspaceEntries(workPath, currentRelativeDir)
    for (const entry of entries) {
      if (matches.length >= limit) break

      const normalizedName = entry.name.toLowerCase()
      const normalizedRelativePath = entry.relativePath.toLowerCase()

      if (
        normalizedName.includes(normalizedQuery) ||
        normalizedRelativePath.includes(normalizedQuery)
      ) {
        matches.push(entry)
      }

      if (
        entry.kind === 'directory' &&
        !SEARCH_SKIPPED_DIR_NAMES.has(entry.name)
      ) {
        queue.push(entry.relativePath)
      }
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
