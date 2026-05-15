import { ipcMain } from 'electron'
import { promises as fs } from 'fs'
import nodePath from 'path'

type SearchReplaceType = 'modify' | 'add' | 'delete' | 'move'

type SearchReplacePayload = {
  baseDir?: string
  type?: SearchReplaceType | 'update' | 'create' | 'remove' | 'rename'
  path?: string
  filePath?: string
  old_string?: string
  new_string?: string
  target_path?: string
  oldStr?: string
  newStr?: string
  targetPath?: string
  overwrite?: boolean
}

const normalizeSearchReplaceType = (payload?: SearchReplacePayload): SearchReplaceType => {
  const type = payload?.type
  const normalizedType = (type || 'modify').trim().toLowerCase()
  const oldString = payload?.old_string ?? payload?.oldStr
  if (normalizedType === 'add' || normalizedType === 'create' || ((normalizedType === 'modify' || normalizedType === 'update') && oldString === undefined)) return 'add'
  if (normalizedType === 'modify' || normalizedType === 'update') return 'modify'
  if (normalizedType === 'delete' || normalizedType === 'remove') return 'delete'
  if (normalizedType === 'move' || normalizedType === 'rename') return 'move'
  throw new Error(`Unsupported type: ${type}. Expected modify/add/delete/move.`)
}

const resolvePathInBaseDir = (baseDir: string, rawPath: string) => {
  const inputPath = rawPath.trim()
  const noPrefixPath =
    inputPath.startsWith('a/') || inputPath.startsWith('b/') ? inputPath.slice(2) : inputPath
  const targetPath = nodePath.isAbsolute(noPrefixPath)
    ? nodePath.normalize(noPrefixPath)
    : nodePath.resolve(baseDir, noPrefixPath)
  const normalizedBaseDir = nodePath.resolve(nodePath.normalize(baseDir))
  const relativePath = nodePath.relative(normalizedBaseDir, targetPath)
  const isInsideBaseDir =
    relativePath === '' || (!relativePath.startsWith('..') && !nodePath.isAbsolute(relativePath))

  if (!isInsideBaseDir) {
    throw new Error(`Path escapes workPath: ${normalizedBaseDir}`)
  }

  return targetPath
}

const ensureParentDir = async (filePath: string) => {
  await fs.mkdir(nodePath.dirname(filePath), { recursive: true })
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
  const countOccurrences = (text: string, search: string) => text.split(search).length - 1
  const normalizedContent = normalize(content)
  const normalizedOldStr = normalize(oldStr)
  const exactMatchCount = countOccurrences(content, oldStr)
  const normalizedMatchCount = countOccurrences(normalizedContent, normalizedOldStr)

  if (normalizedMatchCount === 0) {
    throw new Error(
      'old_string was not found in the file. Ensure the snippet matches exactly, including whitespace and line endings.'
    )
  }

  if (exactMatchCount > 1 || (exactMatchCount === 0 && normalizedMatchCount > 1)) {
    throw new Error('old_string matched multiple locations. Provide a more specific snippet.')
  }

  if (exactMatchCount === 1) {
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

  if (nodePath.resolve(sourcePath) === nodePath.resolve(destinationPath)) {
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

  const filePath =
    typeof payload.path === 'string'
      ? payload.path.trim()
      : typeof payload.filePath === 'string'
        ? payload.filePath.trim()
        : ''
  if (!filePath) {
    throw new Error('path is required')
  }

  const type = normalizeSearchReplaceType(payload)
  const sourcePath = resolvePathInBaseDir(baseDir, filePath)
  const oldString = payload.old_string ?? payload.oldStr
  const newString = payload.new_string ?? payload.newStr
  const targetPathInput = payload.target_path ?? payload.targetPath ?? (type === 'move' ? newString : undefined)

  if (type === 'modify') {
    if (typeof oldString !== 'string' || oldString.length === 0 || typeof newString !== 'string') {
      throw new Error('type=modify requires non-empty old_string and string new_string')
    }
    return applyModify(sourcePath, oldString, newString)
  }

  if (type === 'add') {
    if (typeof newString !== 'string') {
      throw new Error('type=add requires new_string')
    }
    return applyAdd(sourcePath, newString, Boolean(payload.overwrite))
  }

  if (type === 'delete') {
    return applyDelete(sourcePath)
  }

  if (typeof targetPathInput !== 'string' || targetPathInput.trim().length === 0) {
    throw new Error('type=move requires new_string as destination path')
  }

  const targetPath = resolvePathInBaseDir(baseDir, targetPathInput)
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

  ipcMain.handle('edit-file:execute', async (_event, payload: SearchReplacePayload) => {
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
