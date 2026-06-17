import { ipcMain } from 'electron'
import { promises as fs } from 'fs'
import nodePath from 'path'
import { createTwoFilesPatch } from 'diff'
import {
  applyHashlineOperations,
  computeSnapshotTag,
  parseHashlineOperations,
  resolveHashlinePathInBaseDir,
  splitHashlineSections
} from './hashline'

type HashlineEditPayload = {
  baseDir?: string
  input?: string
  type?: 'add' | 'delete' | 'update' | 'move' | 'replace'
  path?: string
  new_path?: string
  content?: string
  old_string?: string
  new_string?: string
  replace_all?: boolean
}

export type FileEditChange = {
  status: 'A' | 'D' | 'M' | 'R'
  path: string
  new_path?: string
  old_hash?: string
  new_hash?: string
  replacements?: number
  diff?: string
  summary: string
}

const ensureParentDir = async (filePath: string) => {
  await fs.mkdir(nodePath.dirname(filePath), { recursive: true })
}

const readTextIfExists = async (
  filePath: string
): Promise<{ exists: boolean; content: string }> => {
  try {
    const stat = await fs.lstat(filePath)
    if (stat.isDirectory())
      throw new Error(`Hashline edit failed: target is a directory ${filePath}`)
    return { exists: true, content: await fs.readFile(filePath, 'utf-8') }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { exists: false, content: '' }
    }
    throw error
  }
}

const formatChangeSummary = (change: Omit<FileEditChange, 'summary'>): string => {
  const pathPart =
    change.status === 'R' && change.new_path ? `${change.path} -> ${change.new_path}` : change.path
  const replacePart =
    typeof change.replacements === 'number' ? `replacements=${change.replacements}` : ''
  const hashParts = [
    change.old_hash ? `old_hash=${change.old_hash}` : '',
    change.new_hash ? `new_hash=${change.new_hash}` : '',
    replacePart
  ].filter(Boolean)
  return [`${change.status} ${pathPart}`, ...hashParts].join(' ')
}

const makeChange = (change: Omit<FileEditChange, 'summary'>): FileEditChange => ({
  ...change,
  summary: formatChangeSummary(change)
})

const buildUnifiedDiff = (oldContent: string, newContent: string, filePath: string) => {
  return createTwoFilesPatch(filePath, filePath, oldContent, newContent, '', '', {
    context: 3
  })
}

const applyHashlineInput = async (baseDir: string, input: string): Promise<FileEditChange[]> => {
  const sections = splitHashlineSections(input)
  const changes: FileEditChange[] = []

  for (const section of sections) {
    const filePath = resolveHashlinePathInBaseDir(baseDir, section.path)
    const operations = parseHashlineOperations(section.body)
    const current = await readTextIfExists(filePath)
    const currentTag = computeSnapshotTag(current.content)
    if (section.tag !== currentTag) {
      throw new Error(
        `Hashline snapshot mismatch for ${section.path}: expected ${section.tag}, actual ${currentTag}. Re-read the file and retry with the fresh ¶path#TAG header.`
      )
    }
    const nextContent = applyHashlineOperations(current.content, operations)

    if (current.content === nextContent) {
      throw new Error(`Hashline edit made no changes: ${section.path}`)
    }

    await ensureParentDir(filePath)
    await fs.writeFile(filePath, nextContent, 'utf-8')
    changes.push(
      makeChange({
        status: current.exists ? 'M' : 'A',
        path: section.path,
        old_hash: current.exists ? currentTag : undefined,
        new_hash: computeSnapshotTag(nextContent)
      })
    )
  }

  return changes
}

const getRequiredPath = (payload: HashlineEditPayload, field: 'path' | 'new_path') => {
  const value = typeof payload[field] === 'string' ? payload[field]!.trim() : ''
  if (!value) {
    throw new Error(`${field} is required`)
  }
  return value
}

const normalizeModelEditableQuotes = (text: string) =>
  text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')

const findActualString = (content: string, oldString: string): string | null => {
  if (content.includes(oldString)) return oldString

  const normalizedOldString = normalizeModelEditableQuotes(oldString)
  if (normalizedOldString === oldString) return null

  const normalizedContent = normalizeModelEditableQuotes(content)
  const index = normalizedContent.indexOf(normalizedOldString)
  if (index === -1) return null

  return content.slice(index, index + oldString.length)
}

const countOccurrences = (content: string, needle: string) => {
  if (!needle) return 0
  return content.split(needle).length - 1
}

const applyStringReplace = async (baseDir: string, payload: HashlineEditPayload) => {
  const rawPath = getRequiredPath(payload, 'path')
  const filePath = resolveHashlinePathInBaseDir(baseDir, rawPath)
  await assertRegularFileTarget(filePath, 'Replace target')

  const oldString = typeof payload.old_string === 'string' ? payload.old_string : ''
  if (!oldString) {
    throw new Error('old_string is required')
  }

  const newString = typeof payload.new_string === 'string' ? payload.new_string : ''
  const currentContent = await fs.readFile(filePath, 'utf-8')
  const actualOldString = findActualString(currentContent, oldString)
  if (!actualOldString) {
    throw new Error('String to replace not found in file')
  }

  const matches = countOccurrences(currentContent, actualOldString)
  if (matches > 1 && !payload.replace_all) {
    throw new Error(
      `Found ${matches} matches for old_string. Provide more context or set replace_all=true.`
    )
  }

  const nextContent = payload.replace_all
    ? currentContent.replaceAll(actualOldString, newString)
    : currentContent.replace(actualOldString, newString)

  if (currentContent === nextContent) {
    throw new Error(`String replacement made no changes: ${rawPath}`)
  }

  await fs.writeFile(filePath, nextContent, 'utf-8')
  return [
    makeChange({
      status: 'M',
      path: toDisplayPath(baseDir, filePath),
      old_hash: computeSnapshotTag(currentContent),
      new_hash: computeSnapshotTag(nextContent),
      replacements: payload.replace_all ? matches : 1,
      diff: buildUnifiedDiff(currentContent, nextContent, toDisplayPath(baseDir, filePath))
    })
  ]
}

const toDisplayPath = (baseDir: string, filePath: string) => {
  const relativePath = nodePath.relative(nodePath.resolve(baseDir), filePath)
  return (relativePath || nodePath.basename(filePath)).replaceAll('\\', '/')
}

const assertRegularFileTarget = async (filePath: string, label: string) => {
  const stat = await fs.lstat(filePath)
  if (stat.isDirectory()) {
    throw new Error(`${label} is a directory: ${filePath}`)
  }
}

export const executeFileEdit = async (payload: HashlineEditPayload) => {
  const baseDir = typeof payload.baseDir === 'string' ? payload.baseDir.trim() : ''
  if (!baseDir) {
    throw new Error('workPath is required')
  }

  const rawType = typeof payload.type === 'string' ? payload.type.trim() : ''
  const type =
    rawType === 'add' ||
    rawType === 'delete' ||
    rawType === 'move' ||
    rawType === 'replace' ||
    rawType === 'update'
      ? rawType
      : 'update'

  if (type === 'replace') {
    return applyStringReplace(baseDir, payload)
  }

  if (type === 'update') {
    const input = typeof payload.input === 'string' ? payload.input : ''
    if (!input.trim()) {
      throw new Error('hashline input is required')
    }

    return applyHashlineInput(baseDir, input)
  }

  if (type === 'add') {
    const rawPath = getRequiredPath(payload, 'path')
    const filePath = resolveHashlinePathInBaseDir(baseDir, rawPath)
    try {
      await fs.lstat(filePath)
      throw new Error(`File already exists: ${toDisplayPath(baseDir, filePath)}`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }

    await ensureParentDir(filePath)
    const content = typeof payload.content === 'string' ? payload.content : ''
    await fs.writeFile(filePath, content, 'utf-8')
    return [
      makeChange({
        status: 'A',
        path: toDisplayPath(baseDir, filePath),
        new_hash: computeSnapshotTag(content)
      })
    ]
  }

  if (type === 'delete') {
    const rawPath = getRequiredPath(payload, 'path')
    const filePath = resolveHashlinePathInBaseDir(baseDir, rawPath)
    await assertRegularFileTarget(filePath, 'Delete target')
    const oldContent = await fs.readFile(filePath, 'utf-8')
    await fs.unlink(filePath)
    return [
      makeChange({
        status: 'D',
        path: toDisplayPath(baseDir, filePath),
        old_hash: computeSnapshotTag(oldContent)
      })
    ]
  }

  if (type === 'move') {
    const rawPath = getRequiredPath(payload, 'path')
    const rawNewPath = getRequiredPath(payload, 'new_path')
    const filePath = resolveHashlinePathInBaseDir(baseDir, rawPath)
    const newFilePath = resolveHashlinePathInBaseDir(baseDir, rawNewPath)
    if (filePath === newFilePath) {
      throw new Error('new_path is the same as path')
    }

    await assertRegularFileTarget(filePath, 'Move source')
    const content = await fs.readFile(filePath, 'utf-8')
    const contentHash = computeSnapshotTag(content)
    try {
      await fs.lstat(newFilePath)
      throw new Error(`Move destination already exists: ${toDisplayPath(baseDir, newFilePath)}`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }

    await ensureParentDir(newFilePath)
    await fs.rename(filePath, newFilePath)
    return [
      makeChange({
        status: 'R',
        path: toDisplayPath(baseDir, filePath),
        new_path: toDisplayPath(baseDir, newFilePath),
        old_hash: contentHash,
        new_hash: contentHash
      })
    ]
  }

  throw new Error(`Unsupported edit type: ${type}`)
}

export const setupSearchReplaceHandlers = () => {
  ipcMain.handle('search-replace:execute', async (_event, payload: HashlineEditPayload) => {
    try {
      const changes = await executeFileEdit({ ...payload, type: 'update' })
      return {
        ok: true,
        summary: changes.map((change) => change.summary).join('\n'),
        changes
      }
    } catch (error) {
      return {
        ok: false,
        error: (error as Error).message
      }
    }
  })

  ipcMain.handle('edit-file:execute', async (_event, payload: HashlineEditPayload) => {
    try {
      const changes = await executeFileEdit(payload)
      return {
        ok: true,
        summary: changes.map((change) => change.summary).join('\n'),
        changes
      }
    } catch (error) {
      return {
        ok: false,
        error: (error as Error).message
      }
    }
  })
}
