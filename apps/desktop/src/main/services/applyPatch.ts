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
const EOF_MARKER = '*** End of File'
const CHANGE_CONTEXT_MARKER = '@@ '
const EMPTY_CHANGE_CONTEXT_MARKER = '@@'

type UpdateFileChunk = {
  changeContext: string | null
  oldLines: string[]
  newLines: string[]
  isEndOfFile: boolean
}

type Hunk =
  | { type: 'AddFile'; path: string; contents: string }
  | { type: 'DeleteFile'; path: string }
  | { type: 'UpdateFile'; path: string; movePath: string | null; chunks: UpdateFileChunk[] }

type ParsedPatch = {
  hunks: Hunk[]
}

class PatchParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PatchParseError'
  }
}

function parsePatch(patchText: string): ParsedPatch {
  const lines = patchText.trim().split('\n')

  if (lines.length === 0) {
    throw new PatchParseError("The first line of the patch must be '*** Begin Patch'")
  }

  if (lines[0].trim() !== BEGIN_PATCH_MARKER) {
    if (isHeredocWrapped(lines)) {
      return parsePatch(lines.slice(1, lines.length - 1).join('\n'))
    }
    throw new PatchParseError("The first line of the patch must be '*** Begin Patch'")
  }

  if (lines[lines.length - 1].trim() !== END_PATCH_MARKER) {
    throw new PatchParseError("The last line of the patch must be '*** End Patch'")
  }

  let cursor = 1
  if (cursor < lines.length - 1 && lines[cursor].trimStart().startsWith(ENVIRONMENT_ID_MARKER)) {
    cursor++
  }

  const hunks: Hunk[] = []
  while (cursor < lines.length - 1) {
    const line = lines[cursor].trim()
    if (!line) {
      cursor++
      continue
    }

    if (line.startsWith(ADD_FILE_MARKER)) {
      const filePath = line.slice(ADD_FILE_MARKER.length)
      let contents = ''
      cursor++
      while (cursor < lines.length - 1 && lines[cursor].startsWith('+')) {
        contents += lines[cursor].slice(1) + '\n'
        cursor++
      }
      hunks.push({ type: 'AddFile', path: filePath, contents })
      continue
    }

    if (line.startsWith(DELETE_FILE_MARKER)) {
      hunks.push({ type: 'DeleteFile', path: line.slice(DELETE_FILE_MARKER.length) })
      cursor++
      continue
    }

    if (line.startsWith(UPDATE_FILE_MARKER)) {
      const filePath = line.slice(UPDATE_FILE_MARKER.length)
      cursor++

      let movePath: string | null = null
      if (cursor < lines.length - 1 && lines[cursor].startsWith(MOVE_TO_MARKER)) {
        movePath = lines[cursor].slice(MOVE_TO_MARKER.length)
        cursor++
      }

      const chunks: UpdateFileChunk[] = []
      while (cursor < lines.length - 1) {
        const currentLine = lines[cursor]
        if (!currentLine.trim()) {
          cursor++
          continue
        }
        if (currentLine.startsWith('*')) break

        const chunk = parseUpdateFileChunk(lines, cursor, chunks.length === 0)
        chunks.push(chunk.chunk)
        cursor += chunk.linesConsumed
      }

      if (chunks.length === 0) {
        throw new PatchParseError(`Update file hunk for path '${filePath}' is empty`)
      }

      hunks.push({ type: 'UpdateFile', path: filePath, movePath, chunks })
      continue
    }

    throw new PatchParseError(
      `'${line}' is not a valid hunk header. Valid headers: '*** Add File: {path}', '*** Delete File: {path}', '*** Update File: {path}'`
    )
  }

  return { hunks }
}

function isHeredocWrapped(lines: string[]): boolean {
  if (lines.length < 4) return false
  const first = lines[0]
  const last = lines[lines.length - 1]
  return (
    (first === '<<EOF' || first === "<<'EOF'" || first === '<<"EOF"') &&
    last.trimEnd() === 'EOF'
  )
}

function parseUpdateFileChunk(
  lines: string[],
  startIdx: number,
  allowMissingContext: boolean
): { chunk: UpdateFileChunk; linesConsumed: number } {
  let idx = startIdx
  let changeContext: string | null = null

  if (lines[idx] === EMPTY_CHANGE_CONTEXT_MARKER) {
    changeContext = null
    idx++
  } else if (lines[idx].startsWith(CHANGE_CONTEXT_MARKER)) {
    changeContext = lines[idx].slice(CHANGE_CONTEXT_MARKER.length)
    idx++
  } else {
    if (!allowMissingContext) {
      throw new PatchParseError(
        `Expected update hunk to start with a @@ context marker, got: '${lines[idx]}'`
      )
    }
    changeContext = null
  }

  if (idx >= lines.length) {
    throw new PatchParseError('Update hunk does not contain any lines')
  }

  const chunk: UpdateFileChunk = {
    changeContext,
    oldLines: [],
    newLines: [],
    isEndOfFile: false
  }

  let parsedLines = 0
  while (idx < lines.length) {
    const line = lines[idx]

    if (line === EOF_MARKER) {
      if (parsedLines === 0) {
        throw new PatchParseError('Update hunk does not contain any lines')
      }
      chunk.isEndOfFile = true
      idx++
      parsedLines++
      break
    }

    if (line.startsWith('***') && parsedLines > 0) {
      break
    }

    if (line.length === 0) {
      chunk.oldLines.push('')
      chunk.newLines.push('')
    } else {
      const prefix = line[0]
      const rest = line.slice(1)
      if (prefix === ' ') {
        chunk.oldLines.push(rest)
        chunk.newLines.push(rest)
      } else if (prefix === '+') {
        chunk.newLines.push(rest)
      } else if (prefix === '-') {
        chunk.oldLines.push(rest)
      } else {
        if (parsedLines === 0) {
          throw new PatchParseError(
            `Unexpected line found in update hunk: '${line}'. Every line should start with ' ' (context), '+' (added), or '-' (removed)`
          )
        }
        break
      }
    }

    idx++
    parsedLines++
  }

  return { chunk, linesConsumed: idx - startIdx }
}

function seekSequence(
  lines: string[],
  pattern: string[],
  start: number,
  eof: boolean
): number | null {
  if (pattern.length === 0) return start
  if (pattern.length > lines.length) return null

  const searchStart = eof && lines.length >= pattern.length ? lines.length - pattern.length : start
  const maxIdx = lines.length - pattern.length

  for (let i = searchStart; i <= maxIdx; i++) {
    let ok = true
    for (let j = 0; j < pattern.length; j++) {
      if (lines[i + j] !== pattern[j]) {
        ok = false
        break
      }
    }
    if (ok) return i
  }

  for (let i = searchStart; i <= maxIdx; i++) {
    let ok = true
    for (let j = 0; j < pattern.length; j++) {
      if (lines[i + j].trimEnd() !== pattern[j].trimEnd()) {
        ok = false
        break
      }
    }
    if (ok) return i
  }

  for (let i = searchStart; i <= maxIdx; i++) {
    let ok = true
    for (let j = 0; j < pattern.length; j++) {
      if (lines[i + j].trim() !== pattern[j].trim()) {
        ok = false
        break
      }
    }
    if (ok) return i
  }

  const normalise = (s: string): string => {
    return s
      .trim()
      .split('')
      .map((c) => {
        const code = c.codePointAt(0)!
        if (
          code === 0x2010 || code === 0x2011 || code === 0x2012 ||
          code === 0x2013 || code === 0x2014 || code === 0x2015 ||
          code === 0x2212
        )
          return '-'
        if (code === 0x2018 || code === 0x2019 || code === 0x201a || code === 0x201b) return "'"
        if (code === 0x201c || code === 0x201d || code === 0x201e || code === 0x201f) return '"'
        if (
          code === 0x00a0 || code === 0x2002 || code === 0x2003 || code === 0x2004 ||
          code === 0x2005 || code === 0x2006 || code === 0x2007 || code === 0x2008 ||
          code === 0x2009 || code === 0x200a || code === 0x202f || code === 0x205f ||
          code === 0x3000
        )
          return ' '
        return c
      })
      .join('')
  }

  for (let i = searchStart; i <= maxIdx; i++) {
    let ok = true
    for (let j = 0; j < pattern.length; j++) {
      if (normalise(lines[i + j]) !== normalise(pattern[j])) {
        ok = false
        break
      }
    }
    if (ok) return i
  }

  return null
}

function computeReplacements(
  originalLines: string[],
  filePath: string,
  chunks: UpdateFileChunk[]
): Array<{ startIdx: number; oldLen: number; newLines: string[] }> {
  const replacements: Array<{ startIdx: number; oldLen: number; newLines: string[] }> = []
  let lineIndex = 0

  for (const chunk of chunks) {
    let contextMatchEnd: number | null = null

    if (chunk.changeContext !== null) {
      const ctxArr = [chunk.changeContext]
      const idx = seekSequence(originalLines, ctxArr, lineIndex, false)
      if (idx !== null) {
        lineIndex = idx + 1
        contextMatchEnd = lineIndex
      } else {
        throw new PatchParseError(`Failed to find context '${chunk.changeContext}' in ${filePath}`)
      }
    }

    if (chunk.oldLines.length === 0) {
      const insertionIdx =
        contextMatchEnd ??
        (originalLines.length > 0 && originalLines[originalLines.length - 1] === ''
          ? originalLines.length - 1
          : originalLines.length)
      replacements.push({ startIdx: insertionIdx, oldLen: 0, newLines: chunk.newLines })
      continue
    }

    let pattern: string[] = chunk.oldLines
    let found = seekSequence(originalLines, pattern, lineIndex, chunk.isEndOfFile)
    let newSlice: string[] = chunk.newLines

    if (found === null && pattern.length > 0 && pattern[pattern.length - 1] === '') {
      pattern = pattern.slice(0, -1)
      if (newSlice.length > 0 && newSlice[newSlice.length - 1] === '') {
        newSlice = newSlice.slice(0, -1)
      }
      found = seekSequence(originalLines, pattern, lineIndex, chunk.isEndOfFile)
    }

    if (found !== null) {
      replacements.push({ startIdx: found, oldLen: pattern.length, newLines: newSlice })
      lineIndex = found + pattern.length
    } else {
      throw new PatchParseError(
        `Failed to find expected lines in ${filePath}:\n${chunk.oldLines.join('\n')}`
      )
    }
  }

  replacements.sort((a, b) => a.startIdx - b.startIdx)
  return replacements
}

function applyReplacements(
  lines: string[],
  replacements: Array<{ startIdx: number; oldLen: number; newLines: string[] }>
): string[] {
  const result = [...lines]
  for (let i = replacements.length - 1; i >= 0; i--) {
    const { startIdx, oldLen, newLines: newSeg } = replacements[i]
    result.splice(startIdx, oldLen, ...newSeg)
  }
  return result
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

const pathExists = async (filePath: string) => {
  try {
    await fs.lstat(filePath)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false
    }
    throw error
  }
}

type AffectedPaths = {
  added: string[]
  modified: string[]
  deleted: string[]
}

type ApplyPatchResult = {
  affectedPaths: AffectedPaths
  summaries: string[]
}

async function executeApplyPatch(baseDir: string, patchText: string): Promise<ApplyPatchResult> {
  const { hunks } = parsePatch(patchText)

  if (hunks.length === 0) {
    throw new PatchParseError('No files were modified.')
  }

  const added: string[] = []
  const modified: string[] = []
  const deleted: string[] = []
  const summaries: string[] = []

  for (const hunk of hunks) {
    switch (hunk.type) {
      case 'AddFile': {
        const absPath = resolvePathInBaseDir(baseDir, hunk.path)
        if (await pathExists(absPath)) {
          throw new Error(`Add file failed: target already exists ${absPath}`)
        }
        await ensureParentDir(absPath)
        await fs.writeFile(absPath, hunk.contents, 'utf-8')
        added.push(hunk.path)
        summaries.push(`A ${hunk.path}`)
        break
      }
      case 'DeleteFile': {
        const absPath = resolvePathInBaseDir(baseDir, hunk.path)
        let stat
        try {
          stat = await fs.lstat(absPath)
        } catch {
          throw new Error(`Delete file failed: file does not exist ${absPath}`)
        }
        if (stat.isDirectory()) {
          throw new Error(`Delete file failed: target is a directory ${absPath}`)
        }
        await fs.unlink(absPath)
        deleted.push(hunk.path)
        summaries.push(`D ${hunk.path}`)
        break
      }
      case 'UpdateFile': {
        const absPath = resolvePathInBaseDir(baseDir, hunk.path)
        let originalContent: string
        try {
          originalContent = await fs.readFile(absPath, 'utf-8')
        } catch {
          throw new Error(`Failed to read file to update ${absPath}`)
        }

        let originalLines = originalContent.split('\n')
        if (originalLines.length > 0 && originalLines[originalLines.length - 1] === '') {
          originalLines.pop()
        }

        const replacements = computeReplacements(originalLines, hunk.path, hunk.chunks)
        let newLines = applyReplacements(originalLines, replacements)

        if (newLines.length === 0 || newLines[newLines.length - 1] !== '') {
          newLines.push('')
        }
        const newContent = newLines.join('\n')

        if (hunk.movePath) {
          const destAbsPath = resolvePathInBaseDir(baseDir, hunk.movePath)
          if (await pathExists(destAbsPath)) {
            throw new Error(`Move file failed: target already exists ${destAbsPath}`)
          }
          await ensureParentDir(destAbsPath)
          await fs.writeFile(destAbsPath, newContent, 'utf-8')

          let stat
          try {
            stat = await fs.lstat(absPath)
          } catch {
            throw new Error(`Failed to stat original file ${absPath}`)
          }
          if (stat.isDirectory()) {
            throw new Error(`Failed to remove original: path is a directory ${absPath}`)
          }
          await fs.unlink(absPath)
          modified.push(hunk.movePath)
          summaries.push(`M ${hunk.movePath}`)
        } else {
          await fs.writeFile(absPath, newContent, 'utf-8')
          modified.push(hunk.path)
          summaries.push(`M ${hunk.path}`)
        }
        break
      }
    }
  }

  return { affectedPaths: { added, modified, deleted }, summaries }
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
