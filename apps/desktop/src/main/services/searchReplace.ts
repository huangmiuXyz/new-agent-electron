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
        new_hash: computeSnapshotTag(nextContent),
        diff: buildUnifiedDiff(current.content, nextContent, section.path)
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

// ── 9-level replacer cascade ──────────────────────────────────────────
// Adapted from Kilo Code / OpenCode (packages/opencode/src/tool/edit.ts)

const normalizeQuotes = (text: string) =>
  text.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')

const normalizeLineEndings = (text: string) => text.replace(/\r\n/g, '\n')

const createNormalizedIndexMap = (text: string) => {
  const chars: string[] = []
  const indexMap: number[] = []
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\r' && text[i + 1] === '\n') {
      chars.push('\n')
      indexMap.push(i)
      i++
      continue
    }
    chars.push(text[i])
    indexMap.push(i)
  }
  return { text: chars.join(''), indexMap }
}

const originalIndexForNormalized = (indexMap: number[], normalizedIndex: number, originalLength: number) =>
  normalizedIndex >= indexMap.length ? originalLength : indexMap[normalizedIndex]

const lineEndingForRange = (text: string, start: number, end: number): '\n' | '\r\n' => {
  const before = text.lastIndexOf('\n', Math.max(0, start - 1))
  const after = text.indexOf('\n', end)
  const from = before === -1 ? 0 : before + 1
  const to = after === -1 ? text.length : after + 1
  return text.slice(from, to).includes('\r\n') ? '\r\n' : '\n'
}

const withLineEnding = (text: string, ending: '\n' | '\r\n') =>
  ending === '\n' ? normalizeLineEndings(text) : normalizeLineEndings(text).replace(/\n/g, '\r\n')

function levenshtein(a: string, b: string): number {
  if (a === '' || b === '') return Math.max(a.length, b.length)
  const m = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + cost)
    }
  }
  return m[a.length][b.length]
}

type Replacer = (content: string, find: string) => Generator<string, void, unknown>

const SimpleReplacer: Replacer = function* (_content, find) {
  yield find
}

const LineTrimmedReplacer: Replacer = function* (content, find) {
  const originalLines = content.split('\n')
  const searchLines = find.split('\n')
  if (searchLines[searchLines.length - 1] === '') searchLines.pop()
  for (let i = 0; i <= originalLines.length - searchLines.length; i++) {
    let matches = true
    for (let j = 0; j < searchLines.length; j++) {
      if (originalLines[i + j].trim() !== searchLines[j].trim()) {
        matches = false; break
      }
    }
    if (!matches) continue
    let start = 0
    for (let k = 0; k < i; k++) start += originalLines[k].length + 1
    let end = start
    for (let k = 0; k < searchLines.length; k++) {
      end += originalLines[i + k].length
      if (k < searchLines.length - 1) end += 1
    }
    yield content.substring(start, end)
  }
}

const BlockAnchorReplacer: Replacer = function* (content, find) {
  const originalLines = content.split('\n')
  const searchLines = find.split('\n')
  if (searchLines.length < 3) return
  if (searchLines[searchLines.length - 1] === '') searchLines.pop()

  const firstAnchor = searchLines[0].trim()
  const lastAnchor = searchLines[searchLines.length - 1].trim()
  const blockSize = searchLines.length

  const candidates: Array<{ startLine: number; endLine: number }> = []
  for (let i = 0; i < originalLines.length; i++) {
    if (originalLines[i].trim() !== firstAnchor) continue
    for (let j = i + 2; j < originalLines.length; j++) {
      if (originalLines[j].trim() === lastAnchor) {
        candidates.push({ startLine: i, endLine: j }); break
      }
    }
  }
  if (!candidates.length) return

  const threshold = candidates.length === 1 ? 0.35 : 0.5
  let best: { startLine: number; endLine: number } | null = null
  let bestSim = -1

  for (const c of candidates) {
    const actualSize = c.endLine - c.startLine + 1
    const midCount = Math.min(blockSize - 2, actualSize - 2)
    if (midCount <= 0) { best = c; bestSim = 1; break }
    let sim = 0
    for (let j = 1; j < blockSize - 1 && j < actualSize - 1; j++) {
      const ol = originalLines[c.startLine + j].trim()
      const sl = searchLines[j].trim()
      const maxLen = Math.max(ol.length, sl.length)
      if (maxLen === 0) continue
      sim += (1 - levenshtein(ol, sl) / maxLen) / midCount
    }
    if (sim > bestSim) { best = c; bestSim = sim }
  }

  if (!best || bestSim < threshold) return
  let start = 0
  for (let k = 0; k < best.startLine; k++) start += originalLines[k].length + 1
  let end = start
  for (let k = best.startLine; k <= best.endLine; k++) {
    end += originalLines[k].length
    if (k < best.endLine) end += 1
  }
  yield content.substring(start, end)
}

const WhitespaceNormalizedReplacer: Replacer = function* (content, find) {
  const norm = (t: string) => t.replace(/\s+/g, ' ').trim()
  const nf = norm(find)
  const lines = content.split('\n')

  for (const line of lines) {
    if (norm(line) === nf) { yield line; continue }
    const nl = norm(line)
    if (nl.includes(nf)) {
      const words = find.trim().split(/\s+/).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      try {
        const m = line.match(new RegExp(words.join('\\s+')))
        if (m) yield m[0]
      } catch { /* skip */ }
    }
  }

  const findLines = find.split('\n')
  if (findLines.length > 1) {
    for (let i = 0; i <= lines.length - findLines.length; i++) {
      const block = lines.slice(i, i + findLines.length).join('\n')
      if (norm(block) === nf) yield block
    }
  }
}

const IndentationFlexibleReplacer: Replacer = function* (content, find) {
  const stripIndent = (text: string) => {
    const ls = text.split('\n')
    const nonEmpty = ls.filter(l => l.trim().length > 0)
    if (!nonEmpty.length) return text
    const min = Math.min(...nonEmpty.map(l => l.match(/^(\s*)/)![1].length))
    return ls.map(l => l.trim().length === 0 ? l : l.slice(min)).join('\n')
  }
  const nf = stripIndent(find)
  const cls = content.split('\n')
  const fls = find.split('\n')
  for (let i = 0; i <= cls.length - fls.length; i++) {
    const block = cls.slice(i, i + fls.length).join('\n')
    if (stripIndent(block) === nf) yield block
  }
}

const EscapeNormalizedReplacer: Replacer = function* (content, find) {
  const unescape = (s: string) =>
    s.replace(/\\([ntr'"`\\\n$])/g, (_, c) =>
      c === 'n' ? '\n' : c === 't' ? '\t' : c === 'r' ? '\r' : c
    )
  const uf = unescape(find)
  if (content.includes(uf)) yield uf
  const lines = content.split('\n')
  const fls = uf.split('\n')
  for (let i = 0; i <= lines.length - fls.length; i++) {
    const block = lines.slice(i, i + fls.length).join('\n')
    if (unescape(block) === uf) yield block
  }
}

const TrimmedBoundaryReplacer: Replacer = function* (content, find) {
  const tf = find.trim()
  if (tf === find) return
  if (content.includes(tf)) yield tf
  const lines = content.split('\n')
  const fls = find.split('\n')
  for (let i = 0; i <= lines.length - fls.length; i++) {
    const block = lines.slice(i, i + fls.length).join('\n')
    if (block.trim() === tf) yield block
  }
}

const ContextAwareReplacer: Replacer = function* (content, find) {
  const fls = find.split('\n')
  if (fls.length < 3) return
  if (fls[fls.length - 1] === '') fls.pop()
  const cls = content.split('\n')
  const first = fls[0].trim()
  const last = fls[fls.length - 1].trim()
  for (let i = 0; i < cls.length; i++) {
    if (cls[i].trim() !== first) continue
    for (let j = i + 2; j < cls.length; j++) {
      if (cls[j].trim() !== last) continue
      const block = cls.slice(i, j + 1)
      if (block.length !== fls.length) { break }
      let match = 0, total = 0
      for (let k = 1; k < block.length - 1; k++) {
        if (block[k].trim().length > 0 || fls[k].trim().length > 0) {
          total++
          if (block[k].trim() === fls[k].trim()) match++
        }
      }
      if (total === 0 || match / total >= 0.5) {
        yield block.join('\n'); break
      }
    }
  }
}

const MultiOccurrenceReplacer: Replacer = function* (content, find) {
  let pos = 0
  while (true) {
    const idx = content.indexOf(find, pos)
    if (idx === -1) break
    yield find
    pos = idx + find.length
  }
}

const ALL_REPLACERS: Replacer[] = [
  SimpleReplacer,
  LineTrimmedReplacer,
  BlockAnchorReplacer,
  WhitespaceNormalizedReplacer,
  IndentationFlexibleReplacer,
  EscapeNormalizedReplacer,
  TrimmedBoundaryReplacer,
  ContextAwareReplacer,
  MultiOccurrenceReplacer
]

type ReplaceResult = {
  content: string
  replacements: number
}

const countOccurrences = (content: string, needle: string) => {
  if (!needle) return 0
  return content.split(needle).length - 1
}

function replaceText(
  content: string,
  oldString: string,
  newString: string,
  replaceAll = false
): ReplaceResult {
  if (oldString === newString) {
    throw new Error('No changes to apply: oldString and newString are identical.')
  }

  let notFound = true
  let duplicateCount = 0

  for (const replacer of ALL_REPLACERS) {
    for (const search of replacer(content, oldString)) {
      const idx = content.indexOf(search)
      if (idx === -1) continue
      notFound = false
      if (replaceAll) {
        return {
          content: content.replaceAll(search, newString),
          replacements: countOccurrences(content, search)
        }
      }
      const occurrences = countOccurrences(content, search)
      if (occurrences > 1) {
        duplicateCount = Math.max(duplicateCount, occurrences)
        continue
      }
      return {
        content: content.substring(0, idx) + newString + content.substring(idx + search.length),
        replacements: 1
      }
    }
  }

  if (notFound) {
    const snippet = content.slice(0, 120).replace(/\n/g, '\\n').replace(/\t/g, '\\t')
    const oldSnippet = oldString.slice(0, 80).replace(/\n/g, '\\n').replace(/\t/g, '\\t')
    throw new Error(
      `Could not find oldString in the file. ` +
      `old_string 开头: "${oldSnippet}..."；文件开头: "${snippet}..."`
    )
  }
  throw new Error(
    duplicateCount > 0
      ? `Found ${duplicateCount} matches for oldString. Provide more surrounding context to make the match unique.`
      : 'Found multiple matches for oldString. Provide more surrounding context to make the match unique.'
  )
}

function replaceTextPreservingLineEndings(
  originalContent: string,
  oldString: string,
  newString: string,
  replaceAll = false
): ReplaceResult {
  const normalized = createNormalizedIndexMap(originalContent)
  const result = replaceText(normalized.text, normalizeLineEndings(oldString), normalizeLineEndings(newString), replaceAll)

  if (normalized.text === originalContent) return result

  let nextContent = originalContent
  for (const replacer of ALL_REPLACERS) {
    for (const search of replacer(normalized.text, normalizeLineEndings(oldString))) {
      const normalizedIdx = normalized.text.indexOf(search)
      if (normalizedIdx === -1) continue
      const occurrences = countOccurrences(normalized.text, search)
      if (!replaceAll && occurrences > 1) continue

      const ranges: Array<{ start: number; end: number }> = []
      let pos = 0
      while (true) {
        const idx = normalized.text.indexOf(search, pos)
        if (idx === -1) break
        ranges.push({
          start: originalIndexForNormalized(normalized.indexMap, idx, originalContent.length),
          end: originalIndexForNormalized(normalized.indexMap, idx + search.length, originalContent.length)
        })
        if (!replaceAll) break
        pos = idx + search.length
      }

      for (let i = ranges.length - 1; i >= 0; i--) {
        const range = ranges[i]
        const replacement = withLineEnding(newString, lineEndingForRange(originalContent, range.start, range.end))
        nextContent = nextContent.substring(0, range.start) + replacement + nextContent.substring(range.end)
      }
      return { content: nextContent, replacements: ranges.length }
    }
  }

  return result
}

const applyStringReplace = async (baseDir: string, payload: HashlineEditPayload) => {
  const rawPath = getRequiredPath(payload, 'path')
  const filePath = resolveHashlinePathInBaseDir(baseDir, rawPath)
  await assertRegularFileTarget(filePath, 'Replace target')

  const oldString = typeof payload.old_string === 'string' ? payload.old_string : ''
  if (!oldString) throw new Error('old_string is required')

  const newString = typeof payload.new_string === 'string' ? payload.new_string : ''
  const currentContent = await fs.readFile(filePath, 'utf-8')

  const replaceAll = payload.replace_all === true

  let result: ReplaceResult | undefined
  const oldVariants = [oldString]
  const qOld = normalizeQuotes(oldString)
  if (qOld !== oldString) oldVariants.push(qOld)

  let lastError: unknown
  for (const variant of oldVariants) {
    try {
      result = replaceTextPreservingLineEndings(currentContent, variant, newString, replaceAll)
      lastError = undefined
      break
    } catch (e) {
      lastError = e
    }
  }
  if (lastError) throw lastError

  const finalContent = result!.content
  if (currentContent === finalContent) {
    throw new Error(`String replacement made no changes: ${rawPath}`)
  }

  await fs.writeFile(filePath, finalContent, 'utf-8')

  return [
    makeChange({
      status: 'M',
      path: toDisplayPath(baseDir, filePath),
      old_hash: computeSnapshotTag(currentContent),
      new_hash: computeSnapshotTag(finalContent),
      replacements: result!.replacements,
      diff: buildUnifiedDiff(currentContent, finalContent, toDisplayPath(baseDir, filePath))
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
