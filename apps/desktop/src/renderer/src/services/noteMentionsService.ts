import type { Note, NoteFolder } from '@renderer/stores/notes'

export interface NoteMentionEntry {
  id: string
  name: string
  path: string
  kind: 'note' | 'folder'
  folderId: string | null
  content?: string
  updatedAt: Date | string
}

interface SearchNoteEntriesOptions {
  limit?: number
}

const normalizeNotePath = (value: string) => value.replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/')

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

const ensureNotesInitialized = () => {
  const notesStore = useNotesStore()
  if (notesStore.folders.length === 0 && notesStore.notes.length === 0) {
    notesStore.initializeData()
  }
  return notesStore
}

const getFolderSegments = (folderId: string | null): string[] => {
  if (!folderId) return []

  const notesStore = ensureNotesInitialized()
  const segments: string[] = []
  const visited = new Set<string>()
  let currentFolder = notesStore.folders.find((folder) => folder.id === folderId) || null

  while (currentFolder && !visited.has(currentFolder.id)) {
    visited.add(currentFolder.id)
    segments.unshift(currentFolder.name)
    currentFolder = currentFolder.parentId
      ? notesStore.folders.find((folder) => folder.id === currentFolder?.parentId) || null
      : null
  }

  return segments
}

const buildFolderEntry = (folder: NoteFolder): NoteMentionEntry => ({
  id: folder.id,
  name: folder.name,
  path: getFolderSegments(folder.id).join('/'),
  kind: 'folder',
  folderId: folder.id,
  updatedAt: folder.updatedAt
})

const buildNoteEntry = (note: Note): NoteMentionEntry => ({
  id: note.id,
  name: note.title,
  path: [...getFolderSegments(note.folderId), note.title].join('/'),
  kind: 'note',
  folderId: note.folderId,
  content: note.content,
  updatedAt: note.updatedAt
})

const compareNoteEntries = (a: NoteMentionEntry, b: NoteMentionEntry) => {
  if (a.kind !== b.kind) {
    return a.kind === 'folder' ? -1 : 1
  }

  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
}

export const formatNoteMentionPath = (path: string) => {
  const normalizedPath = normalizeNotePath(path)
  if (!/[\s"'`]/.test(normalizedPath)) {
    return normalizedPath
  }

  return `"${normalizedPath.replaceAll('"', '\\"')}"`
}

export const listNoteEntries = (folderId: string | null = null): NoteMentionEntry[] => {
  const notesStore = ensureNotesInitialized()
  return [
    ...notesStore.folders
      .filter((folder) => folder.parentId === folderId)
      .map(buildFolderEntry),
    ...notesStore.notes
      .filter((note) => note.folderId === folderId)
      .map(buildNoteEntry)
  ].sort(compareNoteEntries)
}

export const searchNoteEntries = (
  query: string,
  options: SearchNoteEntriesOptions = {}
): NoteMentionEntry[] => {
  const notesStore = ensureNotesInitialized()
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) {
    return listNoteEntries(null)
  }

  const limit = options.limit ?? 80
  const entries = [
    ...notesStore.folders.map(buildFolderEntry),
    ...notesStore.notes.map(buildNoteEntry)
  ]

  return entries
    .filter((entry) => {
      const searchableText = [
        entry.name,
        entry.path,
        entry.kind === 'note' ? stripHtml(entry.content || '') : ''
      ].join('\n').toLowerCase()
      return searchableText.includes(normalizedQuery)
    })
    .sort((a, b) => {
      const aExact = Number(a.name.toLowerCase() === normalizedQuery || a.path.toLowerCase() === normalizedQuery)
      const bExact = Number(b.name.toLowerCase() === normalizedQuery || b.path.toLowerCase() === normalizedQuery)
      if (aExact !== bExact) return bExact - aExact

      const aPrefix = Number(a.name.toLowerCase().startsWith(normalizedQuery))
      const bPrefix = Number(b.name.toLowerCase().startsWith(normalizedQuery))
      if (aPrefix !== bPrefix) return bPrefix - aPrefix

      return compareNoteEntries(a, b)
    })
    .slice(0, limit)
}

export const getNoteEntry = (reference: string): NoteMentionEntry | null => {
  const notesStore = ensureNotesInitialized()
  const normalizedReference = normalizeNotePath(reference.trim())

  const noteById = notesStore.notes.find((note) => note.id === reference.trim())
  if (noteById) return buildNoteEntry(noteById)

  const folderById = notesStore.folders.find((folder) => folder.id === reference.trim())
  if (folderById) return buildFolderEntry(folderById)

  const entries = [
    ...notesStore.folders.map(buildFolderEntry),
    ...notesStore.notes.map(buildNoteEntry)
  ]

  return entries.find((entry) => normalizeNotePath(entry.path) === normalizedReference) || null
}

export const getNotePlainTextContent = (entry: NoteMentionEntry): string | null => {
  if (entry.kind !== 'note') return null
  return stripHtml(entry.content || '')
}
