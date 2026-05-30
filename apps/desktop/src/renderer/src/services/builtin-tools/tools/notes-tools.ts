import { z } from 'zod'

type NoteLike = {
  id: string
  title: string
  content: string
  folderId: string
  createdAt: Date | string
  updatedAt: Date | string
}

type NoteFolderLike = {
  id: string
  name: string
  parentId: string | null
  createdAt: Date | string
  updatedAt: Date | string
}

const ensureNotesInitialized = () => {
  const notesStore = useNotesStore()
  if (notesStore.folders.length === 0 && notesStore.notes.length === 0) {
    notesStore.initializeData()
  }
  return notesStore
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const textToNoteHtml = (text: string): string => {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (!normalized.trim()) return '<p></p>'

  return normalized
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split('\n').map((line) => escapeHtml(line))
      return `<p>${lines.join('<br>')}</p>`
    })
    .join('')
}

const stripHtml = (html: string): string =>
  html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()

const formatDate = (value: Date | string): string => {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString()
}

const HL_BIGRAMS = Array.from({ length: 26 * 26 }, (_, index) => {
  const first = String.fromCharCode(97 + Math.floor(index / 26))
  const second = String.fromCharCode(97 + (index % 26))
  return `${first}${second}`
})

type HashlineAnchor = {
  line: number
  hash: string
}

type HashlineOperation =
  | {
      type: 'insert'
      position: 'before' | 'after' | 'bof' | 'eof'
      anchor?: HashlineAnchor
      payload: string[]
      index: number
    }
  | {
      type: 'replace'
      start: HashlineAnchor
      end: HashlineAnchor
      payload: string[]
      index: number
    }

const normalizeText = (value: string) => value.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

const fnv1a = (value: string): number => {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

const computeLineHash = (line: string): string => {
  const normalized = line.replace(/\r/g, '').trimEnd()
  return HL_BIGRAMS[fnv1a(normalized) % HL_BIGRAMS.length]
}

const clampInt = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.floor(parsed)))
}

const formatHashlineRead = (
  note: NoteLike,
  folders: NoteFolderLike[],
  options: { start_line?: unknown; end_line?: unknown; limit?: unknown; max_columns?: unknown }
): string => {
  const plainText = stripHtml(note.content)
  const lines = normalizeText(plainText).split('\n')
  const totalLines = Math.max(1, lines.length)
  const startLine = clampInt(options.start_line, 1, 1, totalLines)
  const hasExplicitEnd = options.end_line !== undefined && options.end_line !== null
  const limit = clampInt(options.limit, 160, 1, 2000)
  const requestedEndLine = hasExplicitEnd
    ? clampInt(options.end_line, startLine, startLine, totalLines)
    : Math.min(totalLines, startLine + limit - 1)
  const shouldAddContext = hasExplicitEnd || options.limit !== undefined
  const displayStartLine = Math.max(1, startLine - (shouldAddContext ? 1 : 0))
  const displayEndLine = Math.min(totalLines, requestedEndLine + (shouldAddContext ? 3 : 0))
  const maxColumns = clampInt(options.max_columns, 240, 20, 2000)
  const hashLines = lines.slice(displayStartLine - 1, displayEndLine).map((line, index) => {
    const lineNumber = displayStartLine + index
    if (line.length > maxColumns) {
      return `${lineNumber}|${line.slice(0, maxColumns - 1)}…`
    }
    return `${lineNumber}${computeLineHash(line)}|${line}`
  })

  return [
    `note: ${getNoteDisplayPath(folders, note)}`,
    `note_id: ${note.id}`,
    `title: ${note.title}`,
    `folder: ${getFolderDisplayPath(folders, note.folderId)}`,
    `updated_at: ${formatDate(note.updatedAt)}`,
    `lines: ${displayStartLine}-${displayEndLine} of ${totalLines}`,
    displayStartLine !== startLine || displayEndLine !== requestedEndLine
      ? `requested: ${startLine}-${requestedEndLine}; included context around the requested range.`
      : '',
    requestedEndLine < totalLines ? `note: output truncated; call list_notes with start_line=${requestedEndLine + 1} for more anchors.` : '',
    'hashlines:',
    hashLines.join('\n')
  ].filter(Boolean).join('\n')
}

const getFolderDisplayPath = (folders: NoteFolderLike[], folderId: string | null): string => {
  if (!folderId) return '/'

  const segments: string[] = []
  let currentFolder = folders.find((folder) => folder.id === folderId) || null
  const visited = new Set<string>()

  while (currentFolder && !visited.has(currentFolder.id)) {
    visited.add(currentFolder.id)
    segments.unshift(currentFolder.name)
    currentFolder = currentFolder.parentId
      ? folders.find((folder) => folder.id === currentFolder?.parentId) || null
      : null
  }

  return `/${segments.join('/')}`
}

const getNoteDisplayPath = (folders: NoteFolderLike[], note: NoteLike): string => {
  return `${getFolderDisplayPath(folders, note.folderId)}/${note.title}`.replace(/\/+/g, '/')
}

const resolvePathSegments = (rawPath: string, useCurrent: boolean): { parentId: string | null; segments: string[] } => {
  const isCurrentRelativePath = rawPath.startsWith('./')
  const parentId =
    isCurrentRelativePath && useCurrent
      ? useNotesStore().currentFolderId
      : null
  const segments = rawPath.replace(/^\.\/+/, '').replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)
  return { parentId, segments }
}

const resolveFolderId = (
  folders: NoteFolderLike[],
  params: { folder_id?: unknown; path?: unknown; use_current?: unknown }
): string | null => {
  const folderId = typeof params.folder_id === 'string' ? params.folder_id.trim() : ''
  if (folderId) {
    const folder = folders.find((item) => item.id === folderId)
    if (!folder) throw new Error(`未找到文件夹：folder_id=${folderId}`)
    return folder.id
  }

  const rawPath = typeof params.path === 'string' ? params.path.trim() : ''
  if (!rawPath) {
    const notesStore = useNotesStore()
    return params.use_current !== false && notesStore.currentFolderId ? notesStore.currentFolderId : null
  }

  if (['/', '.', 'root', '根目录'].includes(rawPath)) return null

  let { parentId, segments } = resolvePathSegments(rawPath, params.use_current !== false)

  for (const segment of segments) {
    const matchedFolders = folders.filter((folder) => folder.parentId === parentId && folder.name === segment)
    if (matchedFolders.length === 0) {
      throw new Error(`未找到路径：${rawPath}`)
    }
    if (matchedFolders.length > 1) {
      throw new Error(`路径"${rawPath}"中的"${segment}"匹配到多个文件夹，请改用 folder_id`)
    }
    parentId = matchedFolders[0].id
  }

  return parentId
}

const resolveListNotesTarget = (
  folders: NoteFolderLike[],
  notes: NoteLike[],
  params: { folder_id?: unknown; note_id?: unknown; path?: unknown; use_current?: unknown }
): { type: 'folder'; folderId: string | null } | { type: 'note'; note: NoteLike } => {
  const noteId = typeof params.note_id === 'string' ? params.note_id.trim() : ''
  if (noteId) {
    const note = notes.find((item) => item.id === noteId)
    if (!note) throw new Error(`未找到笔记：note_id=${noteId}`)
    return { type: 'note', note }
  }

  const folderId = typeof params.folder_id === 'string' ? params.folder_id.trim() : ''
  if (folderId) {
    return { type: 'folder', folderId: resolveFolderId(folders, params) }
  }

  const rawPath = typeof params.path === 'string' ? params.path.trim() : ''
  if (!rawPath || ['/', '.', 'root', '根目录'].includes(rawPath)) {
    return { type: 'folder', folderId: resolveFolderId(folders, params) }
  }

  const forceFolder = /[\\/]$/.test(rawPath)
  let { parentId, segments } = resolvePathSegments(rawPath, params.use_current !== false)
  const lastSegment = segments.pop()
  if (!lastSegment) return { type: 'folder', folderId: parentId }

  for (const segment of segments) {
    const matchedFolders = folders.filter((folder) => folder.parentId === parentId && folder.name === segment)
    if (matchedFolders.length === 0) {
      throw new Error(`未找到路径：${rawPath}`)
    }
    if (matchedFolders.length > 1) {
      throw new Error(`路径"${rawPath}"中的"${segment}"匹配到多个文件夹，请改用 folder_id`)
    }
    parentId = matchedFolders[0].id
  }

  const matchedFolders = folders.filter((folder) => folder.parentId === parentId && folder.name === lastSegment)
  const matchedNotes = forceFolder
    ? []
    : notes.filter((note) => note.folderId === parentId && note.title === lastSegment)

  if (matchedFolders.length > 1) {
    throw new Error(`路径"${rawPath}"匹配到多个文件夹，请改用 folder_id`)
  }
  if (matchedNotes.length > 1) {
    throw new Error(`路径"${rawPath}"匹配到多个笔记，请改用 note_id`)
  }
  if (matchedFolders.length === 1 && matchedNotes.length === 1) {
    throw new Error(`路径"${rawPath}"同时匹配到文件夹和笔记，请改用 folder_id 或 note_id`)
  }
  if (matchedFolders.length === 1) {
    return { type: 'folder', folderId: matchedFolders[0].id }
  }
  if (matchedNotes.length === 1) {
    return { type: 'note', note: matchedNotes[0] }
  }

  throw new Error(`未找到路径：${rawPath}`)
}

const resolveNoteForEdit = (folders: NoteFolderLike[], notes: NoteLike[], reference: string): NoteLike => {
  const trimmedReference = reference.trim()
  const noteById = notes.find((note) => note.id === trimmedReference)
  if (noteById) return noteById

  const target = resolveListNotesTarget(folders, notes, {
    path: trimmedReference,
    use_current: false
  })
  if (target.type === 'note') return target.note

  throw new Error(`编辑目标不是笔记：${reference}`)
}

const isHashlineSectionHeader = (line: string) => line.startsWith('§')
const isHashlineOperationLine = (line: string) =>
  line.startsWith('«') || line.startsWith('»') || line.startsWith('≔')

const parseHashlineAnchor = (rawValue: string, sourceLine: number): HashlineAnchor => {
  const match = rawValue.match(/^([1-9]\d*)([a-z]{2})$/)
  if (!match) {
    throw new Error(`line ${sourceLine}: expected hashline anchor like "12ab", got "${rawValue}"`)
  }
  return {
    line: Number.parseInt(match[1], 10),
    hash: match[2]
  }
}

const parseHashlineRange = (rawValue: string, sourceLine: number): { start: HashlineAnchor; end: HashlineAnchor } => {
  if (!rawValue.includes('..')) {
    const anchor = parseHashlineAnchor(rawValue, sourceLine)
    return { start: anchor, end: { ...anchor } }
  }

  const parts = rawValue.split('..')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`line ${sourceLine}: range must be "START..END"`)
  }

  const start = parseHashlineAnchor(parts[0], sourceLine)
  const end = parseHashlineAnchor(parts[1], sourceLine)
  if (end.line < start.line) {
    throw new Error(`line ${sourceLine}: range end is before range start`)
  }
  return { start, end }
}

const collectHashlinePayload = (
  lines: string[],
  startIndex: number,
  requirePayload: boolean,
  sourceLine: number
): { payload: string[]; nextIndex: number } => {
  const payload: string[] = []
  let cursor = startIndex

  while (cursor < lines.length) {
    const line = lines[cursor]
    if (line === '*** End Patch' || isHashlineSectionHeader(line) || isHashlineOperationLine(line)) break
    payload.push(line)
    cursor += 1
  }

  if (requirePayload && payload.length === 0) {
    throw new Error(`line ${sourceLine}: insert operations require at least one payload line`)
  }

  return { payload, nextIndex: cursor }
}

const splitHashlineSections = (input: string): Array<{ path: string; body: string }> => {
  const lines = normalizeText(input).split('\n')
  const sections: Array<{ path: string; body: string }> = []
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

    if (isHashlineSectionHeader(line)) {
      pushCurrent()
      currentPath = line.replace(/^§+/, '').trim()
      if (!currentPath) throw new Error('hashline section note id/path is empty')
      continue
    }

    if (!currentPath) {
      throw new Error('hashline input must start with a section header like "§NOTE_ID" or "§folder/note"')
    }
    currentBody.push(line)
  }

  pushCurrent()

  if (sections.length === 0) {
    throw new Error('hashline input did not include any note sections')
  }

  return sections
}

const parseHashlineOperations = (body: string): HashlineOperation[] => {
  const lines = normalizeText(body).split('\n')
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
      if (target.includes('|')) {
        throw new Error(`line ${sourceLine}: operation line must use only the anchor before "|".`)
      }
      const { payload, nextIndex } = collectHashlinePayload(lines, cursor + 1, true, sourceLine)
      operations.push(
        target === 'BOF'
          ? { type: 'insert', position: 'bof', payload, index: operations.length }
          : {
              type: 'insert',
              position: 'before',
              anchor: parseHashlineAnchor(target, sourceLine),
              payload,
              index: operations.length
            }
      )
      cursor = nextIndex
      continue
    }

    const afterMatch = line.match(/^»\s*(\S+)\s*$/)
    if (afterMatch) {
      const target = afterMatch[1]
      if (target.includes('|')) {
        throw new Error(`line ${sourceLine}: operation line must use only the anchor before "|".`)
      }
      const { payload, nextIndex } = collectHashlinePayload(lines, cursor + 1, true, sourceLine)
      operations.push(
        target === 'EOF'
          ? { type: 'insert', position: 'eof', payload, index: operations.length }
          : target === 'BOF'
            ? { type: 'insert', position: 'bof', payload, index: operations.length }
            : {
                type: 'insert',
                position: 'after',
                anchor: parseHashlineAnchor(target, sourceLine),
                payload,
                index: operations.length
              }
      )
      cursor = nextIndex
      continue
    }

    const replaceMatch = line.match(/^≔\s*(\S+)\s*$/)
    if (replaceMatch) {
      if (replaceMatch[1].includes('|')) {
        throw new Error(`line ${sourceLine}: operation line must use only anchors before "|".`)
      }
      const range = parseHashlineRange(replaceMatch[1], sourceLine)
      const { payload, nextIndex } = collectHashlinePayload(lines, cursor + 1, false, sourceLine)
      operations.push({
        type: 'replace',
        ...range,
        payload,
        index: operations.length
      })
      cursor = nextIndex
      continue
    }

    throw new Error(`line ${sourceLine}: expected «ANCHOR, »ANCHOR, or ≔ANCHOR, got "${line}"`)
  }

  if (operations.length === 0) {
    throw new Error('hashline section did not include any edit operations')
  }

  return operations
}

const validateHashlineAnchor = (anchor: HashlineAnchor, lines: string[]) => {
  if (anchor.line < 1 || anchor.line > lines.length) {
    throw new Error(`Line ${anchor.line} does not exist (note has ${lines.length} lines)`)
  }

  const actualHash = computeLineHash(lines[anchor.line - 1] || '')
  if (actualHash !== anchor.hash) {
    throw new Error(
      `Hash mismatch at line ${anchor.line}: expected ${anchor.hash}, actual ${actualHash}. Re-read the note and retry with fresh anchors.`
    )
  }
}

const applyHashlineOperations = (text: string, operations: HashlineOperation[]): string => {
  const lines = normalizeText(text).split('\n')
  const splices: Array<{ start: number; deleteCount: number; payload: string[]; index: number }> = []

  for (const operation of operations) {
    if (operation.type === 'replace') {
      validateHashlineAnchor(operation.start, lines)
      validateHashlineAnchor(operation.end, lines)
      splices.push({
        start: operation.start.line - 1,
        deleteCount: operation.end.line - operation.start.line + 1,
        payload: operation.payload,
        index: operation.index
      })
      continue
    }

    if (operation.anchor) validateHashlineAnchor(operation.anchor, lines)

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

export const getNotesBuiltinTools = (): Partial<Tools> => ({
  list_notes: {
    title: '列出笔记',
    description:
      '按笔记文件夹位置列出文件夹和笔记，或读取指定笔记。path 指向文件夹时列目录，指向笔记时返回正文。',
    inputSchema: z.object({
      folder_id: z.string().optional().describe('要列出的笔记文件夹 ID。优先级高于 path。'),
      note_id: z.string().optional().describe('要读取的笔记 ID。优先级高于 folder_id/path。'),
      path: z
        .string()
        .optional()
        .describe('要列出或读取的路径，例如 默认文件夹/子文件夹 或 默认文件夹/笔记标题；/ 表示根目录。默认从根目录解析；使用 ./ 前缀时基于当前文件夹解析；末尾 / 强制按文件夹解析。'),
      use_current: z
        .boolean()
        .optional()
        .default(true)
        .describe('未提供 folder_id/path 时是否列出当前笔记文件夹，默认 true；false 时列根目录。'),
      max_depth: z
        .number()
        .int()
        .min(1)
        .max(5)
        .optional()
        .default(1)
        .describe('递归深度，默认 1（仅列出当前文件夹），最大 5。'),
      start_line: z.number().int().min(1).optional().describe('读取笔记时的起始行号，1-based，默认 1。'),
      end_line: z.number().int().min(1).optional().describe('读取笔记时的结束行号，1-based；传入后会自动附带少量上下文。'),
      limit: z.number().int().min(1).max(2000).optional().describe('读取笔记时最多读取多少行，默认 160，最大 2000。'),
      max_columns: z.number().int().min(20).max(2000).optional().describe('读取笔记时单行最大显示列数，默认 240；超出后不生成 hash 锚点。'),
      max_length: z
        .number()
        .int()
        .min(100)
        .max(10000)
        .optional()
        .default(5000)
        .describe('最大输出字符长度，默认 5000。读取笔记时会截断正文。'),
      content_format: z
        .enum(['text', 'html'])
        .optional()
        .default('text')
        .describe('读取笔记时返回的正文格式。text 为带 hashline 锚点的纯文本，可用于 edit_note；html 为原始富文本 HTML。默认 text。')
    }),
    execute: async (args: unknown) => {
      const params = (args || {}) as Record<string, any>
      const notesStore = ensureNotesInitialized()
      const maxDepth = typeof params.max_depth === 'number' ? params.max_depth : 1
      const maxLength = typeof params.max_length === 'number' ? params.max_length : 5000

      try {
        const target = resolveListNotesTarget(notesStore.folders, notesStore.notes, params)

        if (target.type === 'note') {
          const contentFormat = params.content_format === 'html' ? 'html' : 'text'
          if (contentFormat === 'text') {
            return {
              toolResult: {
                content: [
                  {
                    type: 'text',
                    text: formatHashlineRead(target.note, notesStore.folders, {
                      start_line: params.start_line,
                      end_line: params.end_line,
                      limit: params.limit,
                      max_columns: params.max_columns
                    })
                  }
                ]
              }
            }
          }

          const truncated = target.note.content.length > maxLength
          const content = truncated ? `${target.note.content.slice(0, maxLength)}\n\n... (content truncated)` : target.note.content

          return {
            toolResult: {
              content: [
                {
                  type: 'text',
                  text: [
                    `Note ${getNoteDisplayPath(notesStore.folders, target.note)}:`,
                    `note_id: ${target.note.id}`,
                    `title: ${target.note.title}`,
                    `folder: ${getFolderDisplayPath(notesStore.folders, target.note.folderId)}`,
                    `updated_at: ${formatDate(target.note.updatedAt)}`,
                    `content_format: ${contentFormat}`,
                    'content:',
                    content
                  ].join('\n')
                }
              ]
            }
          }
        }

        const rootFolderId = target.folderId
        const output: string[] = []
        let currentLength = 0
        let truncated = false

        const pushLine = (line: string) => {
          if (truncated) return
          if (currentLength + line.length > maxLength) {
            output.push('... (output truncated)\n')
            truncated = true
            return
          }
          output.push(line)
          currentLength += line.length
        }

        const processFolder = (folderId: string | null, currentDepth: number) => {
          if (truncated || currentDepth >= maxDepth) return

          const childFolders = notesStore.folders
            .filter((folder) => folder.parentId === folderId)
            .sort((a, b) => a.name.localeCompare(b.name))
          const childNotes = notesStore.notes
            .filter((note) => note.folderId === folderId)
            .sort((a, b) => a.title.localeCompare(b.title))
          const indent = '  '.repeat(currentDepth)

          for (const folder of childFolders) {
            pushLine(`${indent}d ${folder.name}/ (folder_id: ${folder.id})\n`)
            processFolder(folder.id, currentDepth + 1)
          }

          for (const note of childNotes) {
            const preview = stripHtml(note.content).replace(/\s+/g, ' ').slice(0, 80)
            pushLine(
              `${indent}- ${note.title} (note_id: ${note.id}, updated_at: ${formatDate(note.updatedAt)})${preview ? ` - ${preview}` : ''}\n`
            )
          }
        }

        processFolder(rootFolderId, 0)

        return {
          toolResult: {
            content: [
              {
                type: 'text',
                text: [
                  `Notes listing for ${getFolderDisplayPath(notesStore.folders, rootFolderId)}:`,
                  output.length > 0 ? output.join('') : '(empty)'
                ].join('\n')
              }
            ]
          }
        }
      } catch (error) {
        return {
          toolResult: {
            content: [{ type: 'text', text: `list_notes 失败：${(error as Error).message}` }]
          }
        }
      }
    }
  },

  edit_note: {
    title: '修改笔记',
    description: [
      '使用 hashline 模式编辑应用内笔记正文',
      '',
      '输入格式：',
      '§NOTE_ID 或 §笔记路径',
      '»ANCHOR 在锚点后插入；«ANCHOR 在锚点前插入；≔ANCHOR 或 ≔START..END 替换/删除行。',
      '操作符 + 锚点必须独占一行；payload 必须从下一行开始。不要写成 »12ab|payload。',
      '»BOF/«BOF 表示笔记开头，»EOF 表示笔记末尾。',
      '≔ANCHOR 后跟 payload 表示替换；不跟 payload 表示删除。',
      '',
      '编辑前必须用 list_notes 读取目标笔记，复制左侧 LINEhash 锚点，例如 12ab|内容 中的锚点是 12ab。',
      '注意：hashline 编辑基于纯文本正文，保存时会转换为笔记富文本段落 HTML。'
    ].join('\n'),
    inputSchema: z.object({
      input: z.string().describe('hashline 编辑内容，必须包含一个或多个 §NOTE_ID 或 §笔记路径 区块。')
    }),
    execute: async (args: unknown) => {
      const params = (args || {}) as Record<string, any>
      const input = typeof params.input === 'string' ? params.input : ''

      if (!input.trim()) {
        return {
          error: '缺少必要参数: input',
          toolResult: {
            content: [{ type: 'text', text: 'edit_note 失败：缺少必要参数 input' }]
          }
        }
      }

      const notesStore = ensureNotesInitialized()

      try {
        const summaries: string[] = []
        const sections = splitHashlineSections(input)

        for (const section of sections) {
          const note = resolveNoteForEdit(notesStore.folders, notesStore.notes, section.path)
          const originalText = stripHtml(note.content)
          const operations = parseHashlineOperations(section.body)
          const nextText = applyHashlineOperations(originalText, operations)
          notesStore.updateNote(note.id, { content: textToNoteHtml(nextText) })
          const lineCount = normalizeText(nextText).split('\n').length
          summaries.push(`updated ${getNoteDisplayPath(notesStore.folders, note)} (note_id: ${note.id}, ${lineCount} lines)`)
        }

        const summary = ['笔记已修改', ...summaries].join('\n')

        return {
          summary,
          toolResult: {
            content: [{ type: 'text', text: summary }]
          }
        }
      } catch (error) {
        return {
          error: (error as Error).message,
          toolResult: {
            content: [{ type: 'text', text: `edit_note 失败：${(error as Error).message}` }]
          }
        }
      }
    }
  }
})
