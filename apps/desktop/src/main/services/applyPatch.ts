import { applyDiff, type ApplyPatchOperation, type Editor } from '@openai/agents'
import { ipcMain } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'

const BEGIN_PATCH_MARKER = '*** Begin Patch'
const ENVIRONMENT_ID_MARKER = '*** Environment ID: '
const END_PATCH_MARKER = '*** End Patch'
const ADD_FILE_MARKER = '*** Add File: '
const DELETE_FILE_MARKER = '*** Delete File: '
const UPDATE_FILE_MARKER = '*** Update File: '
const MOVE_TO_MARKER = '*** Move to: '

class PatchParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PatchParseError'
  }
}

function parseCodexPatch(patchText: string): ApplyPatchOperation[] {
  const lines = patchText.trim().split('\n')
  if (lines[0]?.trim() !== BEGIN_PATCH_MARKER) {
    if (isHeredocWrapped(lines)) return parseCodexPatch(lines.slice(1, -1).join('\n'))
    throw new PatchParseError("The first line of the patch must be '*** Begin Patch'")
  }
  if (lines.at(-1)?.trim() !== END_PATCH_MARKER) {
    throw new PatchParseError("The last line of the patch must be '*** End Patch'")
  }

  const operations: ApplyPatchOperation[] = []
  let cursor = lines[1]?.trimStart().startsWith(ENVIRONMENT_ID_MARKER) ? 2 : 1

  while (cursor < lines.length - 1) {
    const line = lines[cursor].trim()
    if (!line) {
      cursor++
      continue
    }

    if (line.startsWith(ADD_FILE_MARKER)) {
      const filePath = line.slice(ADD_FILE_MARKER.length)
      const diffLines: string[] = []
      for (cursor++; cursor < lines.length - 1 && !lines[cursor].startsWith('*** '); cursor++) {
        if (!lines[cursor].startsWith('+')) {
          throw new PatchParseError(`Invalid Add File line (missing '+'): ${lines[cursor]}`)
        }
        diffLines.push(lines[cursor])
      }
      operations.push({ type: 'create_file', path: filePath, diff: `${diffLines.join('\n')}\n` })
      continue
    }

    if (line.startsWith(DELETE_FILE_MARKER)) {
      operations.push({ type: 'delete_file', path: line.slice(DELETE_FILE_MARKER.length) })
      cursor++
      continue
    }

    if (line.startsWith(UPDATE_FILE_MARKER)) {
      const filePath = line.slice(UPDATE_FILE_MARKER.length)
      let moveTo: string | undefined
      const diffLines: string[] = []
      cursor++

      if (lines[cursor]?.startsWith(MOVE_TO_MARKER)) {
        moveTo = lines[cursor].slice(MOVE_TO_MARKER.length)
        cursor++
      }

      while (cursor < lines.length - 1 && !lines[cursor].startsWith('*** ')) {
        diffLines.push(lines[cursor])
        cursor++
      }
      if (diffLines.length === 0) {
        throw new PatchParseError(`Update file hunk for '${filePath}' is empty`)
      }

      operations.push({
        type: 'update_file',
        path: filePath,
        diff: `${diffLines.join('\n')}\n`,
        ...(moveTo ? { moveTo } : {})
      })
      continue
    }

    throw new PatchParseError(`Invalid patch operation header: '${line}'`)
  }

  return operations
}

function isHeredocWrapped(lines: string[]): boolean {
  const first = lines[0]
  return (
    lines.length >= 4 &&
    (first === '<<EOF' || first === "<<'EOF'" || first === '<<"EOF"') &&
    lines.at(-1)?.trimEnd() === 'EOF'
  )
}

const resolvePathInBaseDir = (baseDir: string, rawPath: string) => {
  const targetPath = path.isAbsolute(rawPath)
    ? path.normalize(rawPath)
    : path.resolve(baseDir, rawPath)
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

const createLocalEditor = (baseDir: string, summaries: string[]): Editor => ({
  async createFile(operation) {
    const filePath = resolvePathInBaseDir(baseDir, operation.path)
    await ensureParentDir(filePath)
    await fs.writeFile(filePath, applyDiff('', operation.diff, 'create'), {
      encoding: 'utf-8',
      flag: 'wx'
    })
    summaries.push(`A ${operation.path}`)
  },
  async updateFile(operation) {
    const sourcePath = resolvePathInBaseDir(baseDir, operation.path)
    const targetPath = resolvePathInBaseDir(baseDir, operation.moveTo ?? operation.path)
    const nextContent = applyDiff(await fs.readFile(sourcePath, 'utf-8'), operation.diff)

    await ensureParentDir(targetPath)
    await fs.writeFile(targetPath, nextContent, 'utf-8')
    if (operation.moveTo && sourcePath !== targetPath) {
      await fs.unlink(sourcePath)
    }
    summaries.push(`M ${operation.moveTo ?? operation.path}`)
  },
  async deleteFile(operation) {
    await fs.unlink(resolvePathInBaseDir(baseDir, operation.path))
    summaries.push(`D ${operation.path}`)
  }
})

async function executeApplyPatch(baseDir: string, patchText: string): Promise<{ summaries: string[] }> {
  const operations = parseCodexPatch(patchText)
  if (operations.length === 0) {
    throw new PatchParseError('No files were modified.')
  }

  const summaries: string[] = []
  const editor = createLocalEditor(baseDir, summaries)

  for (const operation of operations) {
    if (operation.type === 'create_file') {
      await editor.createFile(operation)
    } else if (operation.type === 'update_file') {
      await editor.updateFile(operation)
    } else {
      await editor.deleteFile(operation)
    }
  }

  return { summaries }
}

type ApplyPatchPayload = {
  baseDir?: string
  patch?: string
}

export const setupApplyPatchHandlers = () => {
  ipcMain.handle('apply-patch:execute', async (_event, payload: ApplyPatchPayload) => {
    try {
      const baseDir = typeof payload.baseDir === 'string' ? payload.baseDir.trim() : ''
      if (!baseDir) {
        return { ok: false, error: 'workPath is required' }
      }

      const patchText = typeof payload.patch === 'string' ? payload.patch : ''
      if (!patchText.trim()) {
        return { ok: false, error: 'patch text is required' }
      }

      const result = await executeApplyPatch(baseDir, patchText)
      return { ok: true, summaries: result.summaries }
    } catch (error) {
      return { ok: false, error: (error as Error).message }
    }
  })
}
