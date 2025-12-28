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
    }
  },

  actions: {
    // 初始化数据
    initializeData() {
      const savedFolders = localStorage.getItem('notes-folders')
      const savedNotes = localStorage.getItem('notes-data')

      if (savedFolders) {
        this.folders = JSON.parse(savedFolders)
      } else {
        // 创建默认文件夹
        this.createFolder('默认文件夹')
      }

      if (savedNotes) {
        this.notes = JSON.parse(savedNotes)
      }
    },

    // 保存数据到本地存储
    saveToStorage() {
      localStorage.setItem('notes-folders', JSON.stringify(this.folders))
      localStorage.setItem('notes-data', JSON.stringify(this.notes))
    },

    // 创建文件夹
    createFolder(name: string) {
      const newFolder: NoteFolder = {
        id: nanoid(),
        name,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      this.folders.push(newFolder)
      this.saveToStorage()
      return newFolder
    },

    // 更新文件夹
    updateFolder(id: string, name: string) {
      const folder = this.folders.find((f) => f.id === id)
      if (folder) {
        folder.name = name
        folder.updatedAt = new Date()
        this.saveToStorage()
      }
    },

    // 删除文件夹
    deleteFolder(id: string) {
      const index = this.folders.findIndex((f) => f.id === id)
      if (index !== -1) {
        this.folders.splice(index, 1)

        // 删除文件夹下的所有笔记
        this.notes = this.notes.filter((note) => note.folderId !== id)

        // 如果删除的是当前文件夹，则切换到默认文件夹
        if (this.currentFolderId === id) {
          this.currentFolderId = this.folders.length > 0 ? this.folders[0].id : null
          this.currentNoteId = null
        }

        this.saveToStorage()
      }
    },

    // 创建笔记
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

    // 更新笔记
    updateNote(id: string, data: Partial<Note>) {
      const note = this.notes.find((n) => n.id === id)
      if (note) {
        Object.assign(note, data)
        note.updatedAt = new Date()
        this.saveToStorage()
      }
    },

    // 删除笔记
    deleteNote(id: string) {
      const index = this.notes.findIndex((n) => n.id === id)
      if (index !== -1) {
        this.notes.splice(index, 1)

        // 如果删除的是当前笔记，则清空当前笔记
        if (this.currentNoteId === id) {
          this.currentNoteId = null
        }

        this.saveToStorage()
      }
    },

    // 设置当前文件夹
    setCurrentFolder(folderId: string | null) {
      this.currentFolderId = folderId
      this.currentNoteId = null
    },

    // 设置当前笔记
    setCurrentNote(noteId: string | null) {
      this.currentNoteId = noteId
    }
  }
})
