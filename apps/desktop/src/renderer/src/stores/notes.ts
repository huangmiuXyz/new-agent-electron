import { defineStore } from 'pinia'
import { nanoid } from '../utils/nanoid'

export interface Note {
  id: string
  title: string
  content: string
  folderId: string
  createdAt: Date
  updatedAt: Date
}

export interface NoteFolder {
  id: string
  name: string
  parentId: string | null
  createdAt: Date
  updatedAt: Date
}

const ROOT_ORDER_SCOPE = '__root__'

const getOrderScope = (folderId: string | null) => folderId || ROOT_ORDER_SCOPE

const normalizeItemOrder = (itemIds: string[], savedOrder: string[] = []) => {
  const availableIds = new Set(itemIds)
  const normalized = savedOrder.filter((id) => availableIds.has(id))

  itemIds.forEach((id) => {
    if (!normalized.includes(id)) {
      normalized.push(id)
    }
  })

  return normalized
}

export type NoteClipboard =
  | {
      kind: 'note'
      title: string
      content: string
    }
  | {
      kind: 'folder'
      folder: NoteFolder
      subFolders: NoteFolder[]
      notes: Note[]
    }

export const useNotesStore = defineStore('notes', {
  state: () => ({
    folders: [] as NoteFolder[],
    notes: [] as Note[],
    itemOrder: {} as Record<string, string[]>,
    currentFolderId: null as string | null,
    currentNoteId: null as string | null,
    copyBuffer: null as NoteClipboard | null
  }),

  getters: {
    currentFolder: (state) => {
      if (!state.currentFolderId) return null
      return state.folders.find((folder) => folder.id === state.currentFolderId) || null
    },

    currentNote: (state) => {
      if (!state.currentNoteId) return null
      return state.notes.find((note) => note.id === state.currentNoteId) || null
    },

    notesInCurrentFolder: (state) => {
      if (!state.currentFolderId) return []
      return state.notes.filter((note) => note.folderId === state.currentFolderId)
    },

    folderNotes: (state) => (folderId: string) => {
      return state.notes.filter((note) => note.folderId === folderId)
    },


    rootFolders: (state) => {
      return state.folders.filter((folder) => folder.parentId === null)
    },


    subFolders: (state) => (parentId: string) => {
      return state.folders.filter((folder) => folder.parentId === parentId)
    },


    currentSubFolders: (state) => {
      if (!state.currentFolderId) return []
      return state.folders.filter((folder) => folder.parentId === state.currentFolderId)
    },

    orderedItemsInCurrentScope: (state) => {
      const scope = getOrderScope(state.currentFolderId)
      const folders = state.currentFolderId
        ? state.folders.filter((folder) => folder.parentId === state.currentFolderId)
        : state.folders.filter((folder) => folder.parentId === null)
      const notes = state.currentFolderId
        ? state.notes.filter((note) => note.folderId === state.currentFolderId)
        : []
      const items = [...folders, ...notes]
      const itemMap = new Map(items.map((item) => [item.id, item] as const))
      const order = normalizeItemOrder(items.map((item) => item.id), state.itemOrder[scope])

      return order.map((id) => itemMap.get(id)).filter(Boolean) as (NoteFolder | Note)[]
    },


    folderPath: (state) => (folderId: string) => {
      const path: NoteFolder[] = []
      let currentFolder: NoteFolder | null = state.folders.find((f) => f.id === folderId)!

      while (currentFolder) {
        path.unshift(currentFolder)
        if (currentFolder.parentId) {
          currentFolder = state.folders.find((f) => f.id === currentFolder!.parentId)!
        } else {
          currentFolder = null
        }
      }

      return path
    }
  },

  actions: {

    initializeData() {
      const savedFolders = localStorage.getItem('notes-folders')
      const savedNotes = localStorage.getItem('notes-data')
      const savedItemOrder = localStorage.getItem('notes-item-order')

      if (savedFolders) {
        this.folders = JSON.parse(savedFolders)
      } else {
        this.createFolder('默认文件夹')
      }

      if (savedNotes) {
        this.notes = JSON.parse(savedNotes)
      }

      if (savedItemOrder) {
        this.itemOrder = JSON.parse(savedItemOrder)
      }

      this.normalizeAllItemOrders()
      this.saveToStorage()
    },


    saveToStorage() {
      localStorage.setItem('notes-folders', JSON.stringify(this.folders))
      localStorage.setItem('notes-data', JSON.stringify(this.notes))
      localStorage.setItem('notes-item-order', JSON.stringify(this.itemOrder))
    },

    getScopeItemIds(folderId: string | null) {
      const folderIds = this.folders
        .filter((folder) => folder.parentId === folderId)
        .map((folder) => folder.id)
      const noteIds = folderId
        ? this.notes
          .filter((note) => note.folderId === folderId)
          .map((note) => note.id)
        : []

      return [...folderIds, ...noteIds]
    },

    normalizeItemOrder(folderId: string | null) {
      const scope = getOrderScope(folderId)
      this.itemOrder[scope] = normalizeItemOrder(this.getScopeItemIds(folderId), this.itemOrder[scope])
    },

    normalizeAllItemOrders() {
      this.normalizeItemOrder(null)
      this.folders.forEach((folder) => {
        this.normalizeItemOrder(folder.id)
      })

      const availableScopes = new Set([ROOT_ORDER_SCOPE, ...this.folders.map((folder) => folder.id)])
      Object.keys(this.itemOrder).forEach((scope) => {
        if (!availableScopes.has(scope)) {
          delete this.itemOrder[scope]
        }
      })
    },

    addItemToOrder(folderId: string | null, itemId: string) {
      this.normalizeItemOrder(folderId)
      const scope = getOrderScope(folderId)
      if (!this.itemOrder[scope].includes(itemId)) {
        this.itemOrder[scope].push(itemId)
      }
    },

    removeItemFromOrder(itemId: string) {
      Object.keys(this.itemOrder).forEach((scope) => {
        this.itemOrder[scope] = this.itemOrder[scope].filter((id) => id !== itemId)
      })
    },

    moveItem(fromId: string, toId: string, after = false) {
      const folder = this.folders.find((item) => item.id === fromId)
      const note = this.notes.find((item) => item.id === fromId)
      const parentId = folder ? folder.parentId : note?.folderId

      if (parentId === undefined) return

      this.normalizeItemOrder(parentId)
      const scope = getOrderScope(parentId)
      if (!this.itemOrder[scope].includes(toId)) return

      const fromIndex = this.itemOrder[scope].findIndex((id) => id === fromId)
      if (fromIndex === -1) return

      const [itemId] = this.itemOrder[scope].splice(fromIndex, 1)
      if (!itemId) return

      const targetIndex = this.itemOrder[scope].findIndex((id) => id === toId)
      if (targetIndex === -1) {
        this.itemOrder[scope].push(itemId)
        this.saveToStorage()
        return
      }

      const insertIndex = after ? targetIndex + 1 : targetIndex
      this.itemOrder[scope].splice(insertIndex, 0, itemId)
      this.saveToStorage()
    },


    createFolder(name: string, parentId: string | null = null) {
      const newFolder: NoteFolder = {
        id: nanoid(),
        name,
        parentId,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      this.folders.push(newFolder)
      this.addItemToOrder(parentId, newFolder.id)
      this.saveToStorage()
      return newFolder
    },


    updateFolder(id: string, name: string) {
      const folder = this.folders.find((f) => f.id === id)
      if (folder) {
        folder.name = name
        folder.updatedAt = new Date()
        this.saveToStorage()
      }
    },


    deleteFolder(id: string) {

      const deleteRecursive = (folderId: string) => {

        const subFolders = this.folders.filter((f) => f.parentId === folderId)


        subFolders.forEach((subFolder) => {
          deleteRecursive(subFolder.id)
        })


        this.notes = this.notes.filter((note) => note.folderId !== folderId)


        const index = this.folders.findIndex((f) => f.id === folderId)
        if (index !== -1) {
          this.removeItemFromOrder(folderId)
          delete this.itemOrder[folderId]
          this.folders.splice(index, 1)
        }
      }

      deleteRecursive(id)


      if (this.currentFolderId === id) {
        this.currentFolderId = null
        this.currentNoteId = null
      }

      this.saveToStorage()
    },


    createNote(title: string, folderId: string, content = '') {
      const newNote: Note = {
        id: nanoid(),
        title,
        content,
        folderId,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      this.notes.push(newNote)
      this.addItemToOrder(folderId, newNote.id)
      this.saveToStorage()
      return newNote
    },

    copyNote(id: string) {
      const note = this.notes.find((n) => n.id === id)
      if (!note) return false
      this.copyBuffer = {
        kind: 'note',
        title: note.title,
        content: note.content
      }
      return true
    },

    copyFolder(id: string) {
      const folder = this.folders.find((f) => f.id === id)
      if (!folder) return false

      const subFolders: NoteFolder[] = []
      const folderIds = new Set<string>([id])

      const queue: string[] = [id]
      while (queue.length) {
        const currentId = queue.shift()!
        const children = this.folders.filter((f) => f.parentId === currentId)
        for (const child of children) {
          subFolders.push({ ...child })
          folderIds.add(child.id)
          queue.push(child.id)
        }
      }

      const notes = this.notes.filter((n) => folderIds.has(n.folderId)).map((n) => ({ ...n }))

      this.copyBuffer = {
        kind: 'folder',
        folder: { ...folder },
        subFolders,
        notes
      }
      return true
    },

    pasteNote(folderId: string) {
      if (!this.copyBuffer || this.copyBuffer.kind !== 'note') return null
      const folder = this.folders.find((f) => f.id === folderId)
      if (!folder) return null

      const baseTitle = this.copyBuffer.title
      let title = `${baseTitle} (副本)`
      let suffix = 2
      while (this.notes.some((n) => n.folderId === folderId && n.title === title)) {
        title = `${baseTitle} (副本 ${suffix})`
        suffix += 1
      }

      const newNote = this.createNote(title, folderId, this.copyBuffer.content)
      this.setCurrentNote(newNote.id)
      this.saveToStorage()
      return newNote
    },

    pasteClipboard(targetFolderId: string): Note | NoteFolder | null {
      if (!this.copyBuffer) return null
      if (this.copyBuffer.kind === 'note') {
        return this.pasteNote(targetFolderId)
      }
      return this.pasteFolder(targetFolderId)
    },

    pasteFolder(targetFolderId: string): NoteFolder | null {
      if (!this.copyBuffer || this.copyBuffer.kind !== 'folder') return null
      const target = this.folders.find((f) => f.id === targetFolderId)
      if (!target) return null

      const sourceRootId = this.copyBuffer.folder.id
      if (targetFolderId === sourceRootId || this.isDescendantOf(targetFolderId, sourceRootId)) {
        return null
      }

      const idMap = new Map<string, string>()
      const now = new Date()

      const baseName = this.copyBuffer.folder.name
      const siblingNames = new Set(
        this.folders.filter((f) => f.parentId === targetFolderId).map((f) => f.name)
      )
      let newName = `${baseName} (副本)`
      let nameSuffix = 2
      while (siblingNames.has(newName)) {
        newName = `${baseName} (副本 ${nameSuffix})`
        nameSuffix += 1
      }

      const newRoot: NoteFolder = {
        id: nanoid(),
        name: newName,
        parentId: targetFolderId,
        createdAt: now,
        updatedAt: now
      }
      idMap.set(sourceRootId, newRoot.id)
      this.folders.push(newRoot)
      this.addItemToOrder(targetFolderId, newRoot.id)

      const childrenByParent = new Map<string, NoteFolder[]>()
      for (const sf of this.copyBuffer.subFolders) {
        const parentKey = sf.parentId || sourceRootId
        const list = childrenByParent.get(parentKey) || []
        list.push(sf)
        childrenByParent.set(parentKey, list)
      }

      const processQueue: string[] = [sourceRootId]
      while (processQueue.length) {
        const currentSourceId = processQueue.shift()!
        const currentNewParentId = idMap.get(currentSourceId)!
        const children = childrenByParent.get(currentSourceId) || []
        for (const child of children) {
          const newId = nanoid()
          idMap.set(child.id, newId)
          const newFolder: NoteFolder = {
            id: newId,
            name: child.name,
            parentId: currentNewParentId,
            createdAt: new Date(),
            updatedAt: new Date()
          }
          this.folders.push(newFolder)
          this.addItemToOrder(currentNewParentId, newId)
          processQueue.push(child.id)
        }
      }

      for (const note of this.copyBuffer.notes) {
        const newFolderId = idMap.get(note.folderId)
        if (!newFolderId) continue

        const baseTitle = note.title
        let newTitle = `${baseTitle} (副本)`
        let titleSuffix = 2
        while (this.notes.some((n) => n.folderId === newFolderId && n.title === newTitle)) {
          newTitle = `${baseTitle} (副本 ${titleSuffix})`
          titleSuffix += 1
        }

        this.createNote(newTitle, newFolderId, note.content)
      }

      this.saveToStorage()
      this.setCurrentFolder(newRoot.id)
      return newRoot
    },

    isDescendantOf(folderId: string, ancestorId: string): boolean {
      let current: string | null | undefined = folderId
      const visited = new Set<string>()
      while (current) {
        if (current === ancestorId) return true
        if (visited.has(current)) return false
        visited.add(current)
        const folder = this.folders.find((f) => f.id === current)
        if (!folder) return false
        current = folder.parentId
      }
      return false
    },


    updateNote(id: string, data: Partial<Note>) {
      const note = this.notes.find((n) => n.id === id)
      if (note) {
        Object.assign(note, data)
        note.updatedAt = new Date()
        this.saveToStorage()
      }
    },


    deleteNote(id: string) {
      const index = this.notes.findIndex((n) => n.id === id)
      if (index !== -1) {
        this.notes.splice(index, 1)
        this.removeItemFromOrder(id)


        if (this.currentNoteId === id) {
          this.currentNoteId = null
        }

        this.saveToStorage()
      }
    },


    setCurrentFolder(folderId: string | null) {
      this.currentFolderId = folderId
      this.currentNoteId = null
    },


    setCurrentNote(noteId: string | null) {
      this.currentNoteId = noteId
    },


    async sendToKnowledgeBase(type: 'note' | 'folder', item: any, knowledgeBase: KnowledgeBase) {
      const { addDocumentToKnowledgeBase } = useKnowledgeStore()

      if (type === 'note') {
        const note = this.notes.find((n) => n.id === item.id)
        if (!note) return

        const document: KnowledgeDocument = {
          id: `note-${note.id}`,
          name: note.title,
          path: `note://${note.id}`,
          type: 'text',
          size: note.content.length,
          created: Date.now(),
          status: 'pending',
          chunks: [],
          url: note.content
        }

        addDocumentToKnowledgeBase(knowledgeBase.id, document)
      } else if (type === 'folder') {
        const notesInFolder = this.getAllNotesInFolder(item.id)

        for (const note of notesInFolder) {
          const document: KnowledgeDocument = {
            id: `note-${note.id}`,
            name: note.title,
            path: `note://${note.id}`,
            type: 'text',
            size: note.content.length,
            created: Date.now(),
            status: 'pending',
            chunks: [],
            url: note.content
          }

          addDocumentToKnowledgeBase(knowledgeBase.id, document)
        }
      }
      messageApi.success('发送成功')
    },


    getAllNotesInFolder(folderId: string): Note[] {
      const notes: Note[] = []


      const folderNotes = this.notes.filter((note) => note.folderId === folderId)
      notes.push(...folderNotes)


      const subFolders = this.folders.filter((folder) => folder.parentId === folderId)
      for (const subFolder of subFolders) {
        notes.push(...this.getAllNotesInFolder(subFolder.id))
      }

      return notes
    }
  }
})
