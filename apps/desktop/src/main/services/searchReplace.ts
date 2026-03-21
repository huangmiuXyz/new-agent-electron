import { ipcMain } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'

type SearchReplaceType = 'modify' | 'add' | 'delete' | 'move'

type SearchReplacePayload = {
  baseDir?: string
  type?: SearchReplaceType | 'update' | 'create' | 'remove' | 'rename'
  filePath?: string
  oldStr?: string
  newStr?: string
  targetPath?: string
  overwrite?: boolean
}

const normalizeSearchReplaceType = (type?: string): SearchReplaceType => {
  const normalizedType = (type || 'modify').trim().toLowerCase()
  if (normalizedType === 'modify' || normalizedType === 'update') return 'modify'
  if (normalizedType === 'add' || normalizedType === 'create') return 'add'
  if (normalizedType === 'delete' || normalizedType === 'remove') return 'delete'
  if (normalizedType === 'move' || normalizedType === 'rename') return 'move'
  throw new Error(`Unsupported type: ${type}. Expected modify/add/delete/move.`)
}

const resolvePathInBaseDir = (baseDir: string, rawPath: string) => {
  const inputPath = rawPath.trim()
  const noPrefixPath =
    inputPath.startsWith('a/') || inputPath.startsWith('b/') ? inputPath.slice(2) : inputPath
  const targetPath = path.isAbsolute(noPrefixPath)
    ? path.normalize(noPrefixPath)
    : path.resolve(baseDir, noPrefixPath)
  const normalizedBaseDir = path.resolve(path.normalize(baseDir))
  const relativePath = path.relative(normalizedBaseDir, targetPath)
  const isInsideBaseDir =
    relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))

  if (!isInsideBaseDir) {
    throw new Error(`Path escapes workPath: ${normalizedBaseDir}`)
  }

  return targetPath
}

const ensureParentDir = async (filePath: string) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
}

const ensureFilePath = async (filePath: string, operation: string) => {
  let stat
  try {
    stat = await fs.lstat(filePath)
  } catch {
    throw new Error(`${operation} failed: file does not exist ${filePath}`)
  }

  if (stat.isDirectory()) {
    throw new Error(`${operation} failed: target is a directory ${filePath}`)
  }
}

const applyModify = async (targetPath: string, oldStr: string, newStr: string) => {
  await ensureFilePath(targetPath, 'Modify file')
  const content = await fs.readFile(targetPath, 'utf-8')

  const normalize = (value: string) => value.replace(/\r\n/g, '\n')
  const normalizedContent = normalize(content)
  const normalizedOldStr = normalize(oldStr)

  if (!normalizedContent.includes(normalizedOldStr)) {
    throw new Error(
      'old_str was not found in the file. Ensure the snippet matches exactly, including whitespace and line endings.'
    )
  }

  if (content.includes(oldStr)) {
    await fs.writeFile(targetPath, content.replace(oldStr, newStr), 'utf-8')
    return `Successfully replaced content in ${targetPath}`
  }

  await fs.writeFile(targetPath, normalizedContent.replace(normalizedOldStr, normalize(newStr)), 'utf-8')
  return `Successfully replaced content in ${targetPath} (normalized line endings)`
}

const applyAdd = async (targetPath: string, newStr: string, overwrite: boolean) => {
  let stat: Awaited<ReturnType<typeof fs.lstat>> | null = null

  try {
    stat = await fs.lstat(targetPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }

  if (stat) {
    if (stat.isDirectory()) {
      throw new Error(`Add file failed: target is a directory ${targetPath}`)
    }
    if (!overwrite) {
      throw new Error(`Add file failed: file already exists ${targetPath}. Pass overwrite=true to replace it.`)
    }
  }

  await ensureParentDir(targetPath)
  await fs.writeFile(targetPath, newStr, 'utf-8')
  return overwrite ? `Successfully wrote file ${targetPath}` : `Successfully created file ${targetPath}`
}

const applyDelete = async (targetPath: string) => {
  await ensureFilePath(targetPath, 'Delete file')
  await fs.unlink(targetPath)
  return `Successfully deleted file ${targetPath}`
}

const applyMove = async (sourcePath: string, destinationPath: string, overwrite: boolean) => {
  await ensureFilePath(sourcePath, 'Move file')

  if (path.resolve(sourcePath) === path.resolve(destinationPath)) {
    throw new Error('Move file failed: source and destination are the same.')
  }

  let stat: Awaited<ReturnType<typeof fs.lstat>> | null = null

  try {
    stat = await fs.lstat(destinationPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }

  if (stat) {
    if (stat.isDirectory()) {
      throw new Error(`Move file failed: target is a directory ${destinationPath}`)
    }
    if (!overwrite) {
      throw new Error(
        `Move file failed: destination already exists ${destinationPath}. Pass overwrite=true to replace it.`
      )
    }
    await fs.unlink(destinationPath)
  }

  await ensureParentDir(destinationPath)
  await fs.rename(sourcePath, destinationPath)
  return `Successfully moved file from ${sourcePath} to ${destinationPath}`
}

const executeSearchReplace = async (payload: SearchReplacePayload) => {
  const baseDir = typeof payload.baseDir === 'string' ? payload.baseDir.trim() : ''
  if (!baseDir) {
    throw new Error('workPath is required')
  }

  const filePath = typeof payload.filePath === 'string' ? payload.filePath.trim() : ''
  if (!filePath) {
    throw new Error('filePath is required')
  }

  const type = normalizeSearchReplaceType(payload.type)
  const sourcePath = resolvePathInBaseDir(baseDir, filePath)

  if (type === 'modify') {
    if (typeof payload.oldStr !== 'string' || payload.oldStr.length === 0 || typeof payload.newStr !== 'string') {
      throw new Error('type=modify requires non-empty oldStr and string newStr')
    }
    return applyModify(sourcePath, payload.oldStr, payload.newStr)
  }

  if (type === 'add') {
    if (typeof payload.newStr !== 'string') {
      throw new Error('type=add requires newStr')
    }
    return applyAdd(sourcePath, payload.newStr, Boolean(payload.overwrite))
  }

  if (type === 'delete') {
    return applyDelete(sourcePath)
  }

  if (typeof payload.targetPath !== 'string' || payload.targetPath.trim().length === 0) {
    throw new Error('type=move requires targetPath')
  }

  const targetPath = resolvePathInBaseDir(baseDir, payload.targetPath)
  return applyMove(sourcePath, targetPath, Boolean(payload.overwrite))
}

export const setupSearchReplaceHandlers = () => {
  ipcMain.handle('search-replace:execute', async (_event, payload: SearchReplacePayload) => {
    try {
      return {
        ok: true,
        summary: await executeSearchReplace(payload)
      }
    } catch (error) {
      return {
        ok: false,
        error: (error as Error).message
      }
    }
  })
}
