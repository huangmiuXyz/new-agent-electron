import { ipcMain } from 'electron'
import { promises as fs } from 'fs'
import nodePath from 'path'
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
  type?: 'add' | 'delete' | 'update' | 'move'
  path?: string
  new_path?: string
  content?: string
}

const ensureParentDir = async (filePath: string) => {
  await fs.mkdir(nodePath.dirname(filePath), { recursive: true })
}

const readTextIfExists = async (filePath: string): Promise<{ exists: boolean; content: string }> => {
  try {
    const stat = await fs.lstat(filePath)
    if (stat.isDirectory()) throw new Error(`Hashline edit failed: target is a directory ${filePath}`)
    return { exists: true, content: await fs.readFile(filePath, 'utf-8') }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { exists: false, content: '' }
    }
    throw error
  }
}

const applyHashlineInput = async (baseDir: string, input: string): Promise<string[]> => {
  const sections = splitHashlineSections(input)
  const summaries: string[] = []

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
    summaries.push(`${current.exists ? 'M' : 'A'} ${section.path}`)
  }

  return summaries
}

const getRequiredPath = (payload: HashlineEditPayload, field: 'path' | 'new_path') => {
  const value = typeof payload[field] === 'string' ? payload[field]!.trim() : ''
  if (!value) {
    throw new Error(`${field} is required`)
  }
  return value
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

  const type = payload.type || 'update'

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
    await fs.writeFile(filePath, typeof payload.content === 'string' ? payload.content : '', 'utf-8')
    return [`A ${toDisplayPath(baseDir, filePath)}`]
  }

  if (type === 'delete') {
    const rawPath = getRequiredPath(payload, 'path')
    const filePath = resolveHashlinePathInBaseDir(baseDir, rawPath)
    await assertRegularFileTarget(filePath, 'Delete target')
    await fs.unlink(filePath)
    return [`D ${toDisplayPath(baseDir, filePath)}`]
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
    try {
      await fs.lstat(newFilePath)
      throw new Error(`Move destination already exists: ${toDisplayPath(baseDir, newFilePath)}`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }

    await ensureParentDir(newFilePath)
    await fs.rename(filePath, newFilePath)
    return [`R ${toDisplayPath(baseDir, filePath)} -> ${toDisplayPath(baseDir, newFilePath)}`]
  }

  throw new Error(`Unsupported edit type: ${type}`)
}

export const setupSearchReplaceHandlers = () => {
  ipcMain.handle('search-replace:execute', async (_event, payload: HashlineEditPayload) => {
    try {
      const summaries = await executeFileEdit({ ...payload, type: 'update' })
      return {
        ok: true,
        summary: summaries.join('\n')
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
      const summaries = await executeFileEdit(payload)
      return {
        ok: true,
        summary: summaries.join('\n')
      }
    } catch (error) {
      return {
        ok: false,
        error: (error as Error).message
      }
    }
  })
}
