import { ipcMain } from 'electron'
import { promises as fs } from 'fs'
import nodePath from 'path'

const HL_BIGRAMS = Array.from({ length: 26 * 26 }, (_, index) => {
  const first = String.fromCharCode(97 + Math.floor(index / 26))
  const second = String.fromCharCode(97 + (index % 26))
  return `${first}${second}`
})

export const HL_FILE_PREFIX = '§'
export const HL_INSERT_BEFORE = '«'
export const HL_INSERT_AFTER = '»'
export const HL_REPLACE = '≔'
export const HL_BODY_SEPARATOR = '|'
export const RANGE_INTERIOR_HASH = '**'
export const DEFAULT_HASHLINE_READ_LIMIT = 160
export const MAX_HASHLINE_READ_LIMIT = 2000
export const HASHLINE_RANGE_LEADING_CONTEXT = 1
export const HASHLINE_RANGE_TRAILING_CONTEXT = 3
export const DEFAULT_HASHLINE_MAX_COLUMNS = 240

export type HashlineAnchor = {
  line: number
  hash: string
}

export type HashlineSection = {
  path: string
  body: string
}

export type HashlineOperation =
  | {
      type: 'insert'
      position: 'before' | 'after' | 'bof' | 'eof'
      anchor?: HashlineAnchor
      payload: string[]
      sourceLine: number
      index: number
    }
  | {
      type: 'replace'
      start: HashlineAnchor
      end: HashlineAnchor
      payload: string[]
      sourceLine: number
      index: number
    }

export const normalizeHashlineText = (value: string) => value.replace(/\r\n/g, '\n')

export const splitFileLines = (text: string) => normalizeHashlineText(text).split('\n')

const fnv1a = (value: string): number => {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export const computeLineHash = (_lineNumber: number, line: string): string => {
  const normalized = line.replace(/\r/g, '').trimEnd()
  return HL_BIGRAMS[fnv1a(normalized) % HL_BIGRAMS.length]
}

export const formatHashLine = (lineNumber: number, line: string): string =>
  `${lineNumber}${computeLineHash(lineNumber, line)}${HL_BODY_SEPARATOR}${line}`

export const formatHashLines = (text: string, startLine = 1): string =>
  splitFileLines(text).map((line, index) => formatHashLine(startLine + index, line)).join('\n')

export type HashlineReadSelection = {
  startLine: number
  endLine: number
  requestedStartLine: number
  requestedEndLine: number
  hasMore: boolean
  selectedLines: string[]
}

export type HashlineDisplayResult = {
  text: string
  truncatedLineNumbers: number[]
}

const clampInt = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.floor(parsed)))
}

export const selectHashlineReadLines = (
  lines: string[],
  options?: {
    startLine?: unknown
    endLine?: unknown
    limit?: unknown
    defaultLimit?: number
    leadingContext?: number
    trailingContext?: number
  }
): HashlineReadSelection => {
  const totalLines = Math.max(1, lines.length)
  const startLine = clampInt(options?.startLine, 1, 1, totalLines)
  const hasExplicitEnd = options?.endLine !== undefined && options?.endLine !== null
  const defaultLimit = clampInt(
    options?.defaultLimit,
    DEFAULT_HASHLINE_READ_LIMIT,
    1,
    MAX_HASHLINE_READ_LIMIT
  )
  const limit = clampInt(options?.limit, defaultLimit, 1, MAX_HASHLINE_READ_LIMIT)
  const requestedEndLine = hasExplicitEnd
    ? clampInt(options?.endLine, startLine, startLine, totalLines)
    : Math.min(totalLines, startLine + limit - 1)
  const requestedLength = requestedEndLine - startLine + 1
  const shouldAddContext = hasExplicitEnd || options?.limit !== undefined
  const leadingContext = shouldAddContext
    ? clampInt(options?.leadingContext, HASHLINE_RANGE_LEADING_CONTEXT, 0, 20)
    : 0
  const trailingContext = shouldAddContext
    ? clampInt(options?.trailingContext, HASHLINE_RANGE_TRAILING_CONTEXT, 0, 20)
    : 0
  const displayStartLine = Math.max(1, startLine - leadingContext)
  const displayEndLine = Math.min(totalLines, requestedEndLine + trailingContext)

  return {
    startLine: displayStartLine,
    endLine: displayEndLine,
    requestedStartLine: startLine,
    requestedEndLine,
    hasMore: startLine + requestedLength - 1 < totalLines,
    selectedLines: lines.slice(displayStartLine - 1, displayEndLine)
  }
}

const truncateDisplayLine = (line: string, maxColumns: number): { text: string; wasTruncated: boolean } => {
  if (line.length <= maxColumns) return { text: line, wasTruncated: false }
  if (maxColumns <= 1) return { text: '…', wasTruncated: true }
  return { text: `${line.slice(0, maxColumns - 1)}…`, wasTruncated: true }
}

export const formatHashlineDisplayLines = (
  lines: string[],
  startLine = 1,
  options?: { maxColumns?: unknown }
): HashlineDisplayResult => {
  const maxColumns = clampInt(options?.maxColumns, DEFAULT_HASHLINE_MAX_COLUMNS, 20, 2000)
  const truncatedLineNumbers: number[] = []
  const text = lines
    .map((line, index) => {
      const lineNumber = startLine + index
      const truncated = truncateDisplayLine(line, maxColumns)
      if (truncated.wasTruncated) {
        truncatedLineNumbers.push(lineNumber)
        return `${lineNumber}${HL_BODY_SEPARATOR}${truncated.text}`
      }
      return formatHashLine(lineNumber, line)
    })
    .join('\n')

  return { text, truncatedLineNumbers }
}

const isSectionHeader = (line: string) => line.startsWith(HL_FILE_PREFIX)

const isOpLine = (line: string) =>
  line.startsWith(HL_INSERT_BEFORE) || line.startsWith(HL_INSERT_AFTER) || line.startsWith(HL_REPLACE)

const parseAnchor = (rawValue: string, lineNumber: number): HashlineAnchor => {
  const match = rawValue.match(/^([1-9]\d*)([a-z]{2})$/)
  if (!match) {
    throw new Error(`line ${lineNumber}: expected hashline anchor like "12ab", got "${rawValue}"`)
  }
  return {
    line: Number.parseInt(match[1], 10),
    hash: match[2]
  }
}

const parseRange = (rawValue: string, lineNumber: number): { start: HashlineAnchor; end: HashlineAnchor } => {
  if (!rawValue.includes('..')) {
    const anchor = parseAnchor(rawValue, lineNumber)
    return { start: anchor, end: { ...anchor } }
  }

  const parts = rawValue.split('..')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`line ${lineNumber}: range must be "START..END"`)
  }

  const start = parseAnchor(parts[0], lineNumber)
  const end = parseAnchor(parts[1], lineNumber)
  if (end.line < start.line) {
    throw new Error(`line ${lineNumber}: range end is before range start`)
  }
  return { start, end }
}

const collectPayload = (
  lines: string[],
  startIndex: number,
  requirePayload: boolean,
  sourceLine: number
): { payload: string[]; nextIndex: number } => {
  const payload: string[] = []
  let cursor = startIndex

  while (cursor < lines.length) {
    const line = lines[cursor]
    if (line === '*** End Patch' || isSectionHeader(line) || isOpLine(line)) break
    payload.push(line)
    cursor += 1
  }

  if (requirePayload && payload.length === 0) {
    throw new Error(`line ${sourceLine}: insert operations require at least one payload line`)
  }

  return { payload, nextIndex: cursor }
}

export const splitHashlineSections = (input: string): HashlineSection[] => {
  const lines = normalizeHashlineText(input).split('\n')
  const sections: HashlineSection[] = []
  let currentPath = ''
  let currentBody: string[] = []

  const pushCurrent = () => {
    if (!currentPath) return
    sections.push({ path: currentPath, body: currentBody.join('\n') })
    currentBody = []
  }

  for (const line of lines) {
    if (!line.trim() || line === '*** Begin Patch' || line === '*** End Patch') {
      if (currentPath && line !== '*** Begin Patch' && line !== '*** End Patch') currentBody.push(line)
      continue
    }

    if (isSectionHeader(line)) {
      pushCurrent()
      currentPath = line.replace(/^§+/, '').trim()
      if (!currentPath) throw new Error('hashline section path is empty')
      continue
    }

    if (!currentPath) {
      throw new Error('hashline input must start with a section header like "§src/file.ts"')
    }
    currentBody.push(line)
  }

  pushCurrent()

  if (sections.length === 0) {
    throw new Error('hashline input did not include any file sections')
  }

  return sections
}

export const parseHashlineOperations = (body: string): HashlineOperation[] => {
  const lines = normalizeHashlineText(body).split('\n')
  if (body.endsWith('\n') && lines[lines.length - 1] === '') lines.pop()
  const operations: HashlineOperation[] = []
  let cursor = 0

  while (cursor < lines.length) {
    const line = lines[cursor]
    const sourceLine = cursor + 1

    if (!line.trim() || line === '*** Begin Patch') {
      cursor += 1
      continue
    }
    if (line === '*** End Patch') break

    const beforeMatch = line.match(/^«\s*(\S+)\s*$/)
    if (beforeMatch) {
      const target = beforeMatch[1]
      if (target.includes(HL_BODY_SEPARATOR)) {
        throw new Error(
          `line ${sourceLine}: operation line must use only the anchor before "|". Write "«3rx" on its own line, then put payload on following lines.`
        )
      }
      const { payload, nextIndex } = collectPayload(lines, cursor + 1, true, sourceLine)
      operations.push(
        target === 'BOF'
          ? { type: 'insert', position: 'bof', payload, sourceLine, index: operations.length }
          : {
              type: 'insert',
              position: 'before',
              anchor: parseAnchor(target, sourceLine),
              payload,
              sourceLine,
              index: operations.length
            }
      )
      cursor = nextIndex
      continue
    }

    const afterMatch = line.match(/^»\s*(\S+)\s*$/)
    if (afterMatch) {
      const target = afterMatch[1]
      if (target.includes(HL_BODY_SEPARATOR)) {
        throw new Error(
          `line ${sourceLine}: operation line must use only the anchor before "|". Write "»3rx" on its own line, then put payload on following lines.`
        )
      }
      const { payload, nextIndex } = collectPayload(lines, cursor + 1, true, sourceLine)
      operations.push(
        target === 'EOF'
          ? { type: 'insert', position: 'eof', payload, sourceLine, index: operations.length }
          : target === 'BOF'
            ? { type: 'insert', position: 'bof', payload, sourceLine, index: operations.length }
            : {
                type: 'insert',
                position: 'after',
                anchor: parseAnchor(target, sourceLine),
                payload,
                sourceLine,
                index: operations.length
              }
      )
      cursor = nextIndex
      continue
    }

    const replaceMatch = line.match(/^≔\s*(\S+)\s*$/)
    if (replaceMatch) {
      if (replaceMatch[1].includes(HL_BODY_SEPARATOR)) {
        throw new Error(
          `line ${sourceLine}: operation line must use only anchors before "|". Write "≔3rx" or "≔3rx..5ab" on its own line, then put replacement payload on following lines.`
        )
      }
      const range = parseRange(replaceMatch[1], sourceLine)
      const { payload, nextIndex } = collectPayload(lines, cursor + 1, false, sourceLine)
      operations.push({
        type: 'replace',
        ...range,
        payload,
        sourceLine,
        index: operations.length
      })
      cursor = nextIndex
      continue
    }

    if (isOpLine(line)) {
      throw new Error(
        `line ${sourceLine}: operation line must be only an operator plus anchor, for example "»3rx". Do not include "|content" on the operation line; payload belongs on the next line.`
      )
    }

    throw new Error(`line ${sourceLine}: expected «ANCHOR, »ANCHOR, or ≔ANCHOR, got "${line}"`)
  }

  if (operations.length === 0) {
    throw new Error('hashline section did not include any edit operations')
  }

  return operations
}

const validateAnchor = (anchor: HashlineAnchor, lines: string[]) => {
  if (anchor.line < 1 || anchor.line > lines.length) {
    throw new Error(`Line ${anchor.line} does not exist (file has ${lines.length} lines)`)
  }
  if (anchor.hash === RANGE_INTERIOR_HASH) return

  const actualHash = computeLineHash(anchor.line, lines[anchor.line - 1] || '')
  if (actualHash !== anchor.hash) {
    throw new Error(
      `Hash mismatch at line ${anchor.line}: expected ${anchor.hash}, actual ${actualHash}. Re-read the file and retry with fresh anchors.`
    )
  }
}

type SpliceEdit = {
  start: number
  deleteCount: number
  payload: string[]
  index: number
}

export const applyHashlineOperations = (text: string, operations: HashlineOperation[]): string => {
  const lines = splitFileLines(text)
  const splices: SpliceEdit[] = []

  for (const operation of operations) {
    if (operation.type === 'replace') {
      validateAnchor(operation.start, lines)
      validateAnchor(operation.end, lines)
      splices.push({
        start: operation.start.line - 1,
        deleteCount: operation.end.line - operation.start.line + 1,
        payload: operation.payload,
        index: operation.index
      })
      continue
    }

    if (operation.anchor) validateAnchor(operation.anchor, lines)

    const start =
      operation.position === 'bof'
        ? 0
        : operation.position === 'eof'
          ? lines.length > 0 && lines[lines.length - 1] === ''
            ? lines.length - 1
            : lines.length
          : operation.position === 'before'
            ? operation.anchor!.line - 1
            : operation.anchor!.line

    splices.push({ start, deleteCount: 0, payload: operation.payload, index: operation.index })
  }

  splices.sort((a, b) => {
    if (a.start !== b.start) return b.start - a.start
    return b.index - a.index
  })

  const deletedRanges: Array<{ start: number; end: number }> = []
  for (const splice of splices) {
    if (splice.deleteCount > 0) {
      const end = splice.start + splice.deleteCount
      if (deletedRanges.some((range) => splice.start < range.end && end > range.start)) {
        throw new Error('Hashline operations contain overlapping replace/delete ranges')
      }
      deletedRanges.push({ start: splice.start, end })
    }
    lines.splice(splice.start, splice.deleteCount, ...splice.payload)
  }

  return lines.join('\n')
}

type HashlineReadPayload = {
  baseDir?: string
  path?: string
  start_line?: number
  end_line?: number
  limit?: number
  max_columns?: number
}

export const resolveHashlinePathInBaseDir = (baseDir: string, rawPath: string) => {
  const inputPath = rawPath.trim()
  const targetPath = nodePath.isAbsolute(inputPath)
    ? nodePath.normalize(inputPath)
    : nodePath.resolve(baseDir, inputPath)
  const normalizedBaseDir = nodePath.resolve(nodePath.normalize(baseDir))
  const relativePath = nodePath.relative(normalizedBaseDir, targetPath)
  const isInsideBaseDir =
    relativePath === '' || (!relativePath.startsWith('..') && !nodePath.isAbsolute(relativePath))

  if (!isInsideBaseDir) {
    throw new Error(`Path escapes workPath: ${normalizedBaseDir}`)
  }

  return targetPath
}

const executeHashlineRead = async (payload: HashlineReadPayload): Promise<string> => {
  const baseDir = typeof payload.baseDir === 'string' ? payload.baseDir.trim() : ''
  if (!baseDir) {
    throw new Error('workPath is required')
  }

  const rawPath = typeof payload.path === 'string' ? payload.path.trim() : ''
  if (!rawPath) {
    throw new Error('path is required')
  }

  const filePath = resolveHashlinePathInBaseDir(baseDir, rawPath)
  let stat
  try {
    stat = await fs.lstat(filePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`File does not exist: ${filePath}`)
    }
    throw error
  }

  if (stat.isDirectory()) {
    throw new Error(`Target is a directory: ${filePath}`)
  }

  const content = await fs.readFile(filePath, 'utf-8')
  const lines = splitFileLines(content)
  const selection = selectHashlineReadLines(lines, {
    startLine: payload.start_line,
    endLine: payload.end_line,
    limit: payload.limit
  })
  const hashlineDisplay = formatHashlineDisplayLines(selection.selectedLines, selection.startLine, {
    maxColumns: payload.max_columns
  })

  return [
    `file: ${filePath.replaceAll('\\', '/')}`,
    `lines: ${selection.startLine}-${selection.endLine} of ${lines.length}`,
    selection.startLine !== selection.requestedStartLine || selection.endLine !== selection.requestedEndLine
      ? `requested: ${selection.requestedStartLine}-${selection.requestedEndLine}; included context around the requested range.`
      : '',
    selection.hasMore ? `note: output truncated; call readFile with start_line=${selection.requestedEndLine + 1} for more anchors.` : '',
    hashlineDisplay.truncatedLineNumbers.length > 0
      ? `note: lines without hash anchors due to column truncation: ${hashlineDisplay.truncatedLineNumbers.join(', ')}`
      : '',
    'hashlines:',
    hashlineDisplay.text
  ]
    .filter(Boolean)
    .join('\n')
}

export const setupHashlineHandlers = () => {
  ipcMain.handle('hashline:read', async (_event, payload: HashlineReadPayload) => {
    try {
      return {
        ok: true,
        text: await executeHashlineRead(payload)
      }
    } catch (error) {
      return {
        ok: false,
        error: (error as Error).message
      }
    }
  })
}
