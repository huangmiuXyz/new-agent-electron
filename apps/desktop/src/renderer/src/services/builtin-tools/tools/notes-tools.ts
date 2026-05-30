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

const normalizeIncomingContent = (content: string, format: 'html' | 'text'): string => {
  return format === 'text' ? textToNoteHtml(content) : content
}

const isEmptyNoteContent = (content: string): boolean => {
  const text = content
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim()
  return text.length === 0
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

  const baseFolderId = rawPath.startsWith('/')
    ? null
    : params.use_current !== false
      ? useNotesStore().currentFolderId
      : null
  let parentId: string | null = baseFolderId || null
  const segments = rawPath.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)

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

const findNoteByInput = (
  notes: NoteLike[],
  params: { note_id?: unknown; title?: unknown; use_current?: unknown }
): NoteLike => {
  const noteId = typeof params.note_id === 'string' ? params.note_id.trim() : ''
  const title = typeof params.title === 'string' ? params.title.trim() : ''

  if (noteId) {
    const note = notes.find((item) => item.id === noteId)
    if (!note) throw new Error(`未找到笔记：note_id=${noteId}`)
    return note
  }

  if (title) {
    const matchedNotes = notes.filter((item) => item.title === title)
    if (matchedNotes.length === 0) throw new Error(`未找到标题为"${title}"的笔记`)
    if (matchedNotes.length > 1) {
      throw new Error(`标题"${title}"匹配到 ${matchedNotes.length} 条笔记，请改用 note_id 精确指定`)
    }
    return matchedNotes[0]
  }

  if (params.use_current !== false) {
    const notesStore = useNotesStore()
    const currentNote = notesStore.currentNote
    if (currentNote) return currentNote
  }

  throw new Error('请提供 note_id、title，或先选中当前笔记')
}

export const getNotesBuiltinTools = (): Partial<Tools> => ({
  list_notes: {
    title: '列出笔记',
    description:
      '按笔记文件夹位置列出文件夹和笔记，类似 list_dir。默认列出当前笔记文件夹；没有当前文件夹时列出根目录。',
    inputSchema: z.object({
      folder_id: z.string().optional().describe('要列出的笔记文件夹 ID。优先级高于 path。'),
      path: z
        .string()
        .optional()
        .describe('要列出的笔记文件夹路径，例如 /默认文件夹/子文件夹；/ 表示根目录。相对路径基于当前文件夹解析。'),
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
      max_length: z
        .number()
        .int()
        .min(100)
        .max(10000)
        .optional()
        .default(5000)
        .describe('最大输出字符长度，默认 5000。')
    }),
    execute: async (args: unknown) => {
      const params = (args || {}) as Record<string, any>
      const notesStore = ensureNotesInitialized()
      const maxDepth = typeof params.max_depth === 'number' ? params.max_depth : 1
      const maxLength = typeof params.max_length === 'number' ? params.max_length : 5000

      try {
        const rootFolderId = resolveFolderId(notesStore.folders, params)
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
    description:
      [
        '修改应用内笔记。可通过 note_id 精确指定，也可通过唯一标题 title 指定；都不传时默认修改当前选中的笔记。',
        '支持替换、追加、前置内容，以及修改标题。笔记内容以 HTML 存储；默认按纯文本写入并自动转换为段落 HTML。',
        '为避免误改，标题匹配到多条笔记时会失败并提示改用 note_id。'
      ].join('\n'),
    inputSchema: z.object({
      note_id: z.string().optional().describe('要修改的笔记 ID，优先使用 list_notes 返回的 note_id。'),
      title: z.string().optional().describe('要修改的笔记标题。仅当标题唯一时可用；与 note_id 同传时忽略。'),
      use_current: z
        .boolean()
        .optional()
        .default(true)
        .describe('未提供 note_id/title 时是否修改当前选中的笔记，默认 true。'),
      new_title: z.string().optional().describe('新的笔记标题；不传则保持原标题。'),
      content: z.string().optional().describe('要写入、追加或前置的笔记内容。'),
      content_format: z
        .enum(['html', 'text'])
        .optional()
        .default('text')
        .describe('content 的格式。text 表示自动转成段落 HTML；html 表示直接写入富文本 HTML。默认 text。'),
      mode: z
        .enum(['replace', 'append', 'prepend'])
        .optional()
        .default('replace')
        .describe('content 的写入方式：replace 替换正文，append 追加到末尾，prepend 前置到开头。默认 replace。')
    }),
    execute: async (args: unknown) => {
      const params = (args || {}) as Record<string, any>
      const notesStore = ensureNotesInitialized()

      try {
        const note = findNoteByInput(notesStore.notes, params)
        const newTitle = typeof params.new_title === 'string' ? params.new_title.trim() : undefined
        const hasContent = typeof params.content === 'string'

        if (!newTitle && !hasContent) {
          return {
            toolResult: {
              content: [{ type: 'text', text: 'edit_note 失败：请提供 new_title 或 content' }]
            }
          }
        }

        const updateData: { title?: string; content?: string } = {}
        if (newTitle) updateData.title = newTitle

        if (hasContent) {
          const contentFormat = params.content_format === 'html' ? 'html' : 'text'
          const mode = ['append', 'prepend'].includes(params.mode) ? params.mode : 'replace'
          const incomingContent = normalizeIncomingContent(params.content, contentFormat)
          const currentContent = note.content || ''

          if (mode === 'append' && !isEmptyNoteContent(currentContent)) {
            updateData.content = `${currentContent}${incomingContent}`
          } else if (mode === 'prepend' && !isEmptyNoteContent(currentContent)) {
            updateData.content = `${incomingContent}${currentContent}`
          } else {
            updateData.content = incomingContent
          }
        }

        notesStore.updateNote(note.id, updateData)
        const updatedNote = notesStore.notes.find((item) => item.id === note.id) || note
        const plainText = stripHtml(updatedNote.content)

        return {
          toolResult: {
            content: [
              {
                type: 'text',
                text: [
                  '笔记已修改',
                  `note_id: ${updatedNote.id}`,
                  `title: ${updatedNote.title}`,
                  `updated_at: ${formatDate(updatedNote.updatedAt)}`,
                  `content_chars: ${plainText.length}`,
                  plainText ? `preview: ${plainText.slice(0, 300)}` : 'preview:'
                ].join('\n')
              }
            ]
          }
        }
      } catch (error) {
        return {
          toolResult: {
            content: [{ type: 'text', text: `edit_note 失败：${(error as Error).message}` }]
          }
        }
      }
    }
  }
})
