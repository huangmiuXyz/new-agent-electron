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

export const useNotesStore = defineStore('notes', {
  state: () => ({
    folders: [] as NoteFolder[],
    notes: [] as Note[],
    currentFolderId: null as string | null,
    currentNoteId: null as string | null
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

      if (savedFolders) {
        this.folders = JSON.parse(savedFolders)
      } else {
        this.createFolder('默认文件夹')
      }

      if (savedNotes) {
        this.notes = JSON.parse(savedNotes)
      }
    },

    
    saveToStorage() {
      localStorage.setItem('notes-folders', JSON.stringify(this.folders))
      localStorage.setItem('notes-data', JSON.stringify(this.notes))
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

    
    createNote(title: string, folderId: string) {
      const newNote: Note = {
        id: nanoid(),
        title,
        content: '',
        folderId,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      this.notes.push(newNote)
      this.saveToStorage()
      return newNote
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
          status: 'processing',
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
            status: 'processing',
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
