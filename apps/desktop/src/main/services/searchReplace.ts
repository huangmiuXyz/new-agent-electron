import { ipcMain } from 'electron'
import { promises as fs } from 'fs'
import nodePath from 'path'
import {
  applyHashlineOperations,
  parseHashlineOperations,
  resolveHashlinePathInBaseDir,
  splitHashlineSections
} from './hashline'

type HashlineEditPayload = {
  baseDir?: string
  input?: string
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

const executeHashlineEdit = async (payload: HashlineEditPayload) => {
  const baseDir = typeof payload.baseDir === 'string' ? payload.baseDir.trim() : ''
  if (!baseDir) {
    throw new Error('workPath is required')
  }

  const input = typeof payload.input === 'string' ? payload.input : ''
  if (!input.trim()) {
    throw new Error('hashline input is required')
  }

  return applyHashlineInput(baseDir, input)
}

export const setupSearchReplaceHandlers = () => {
  ipcMain.handle('search-replace:execute', async (_event, payload: HashlineEditPayload) => {
    try {
      const summaries = await executeHashlineEdit(payload)
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
      const summaries = await executeHashlineEdit(payload)
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
