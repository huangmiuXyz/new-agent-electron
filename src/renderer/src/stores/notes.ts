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

    // 获取根文件夹（没有父文件夹的文件夹）
    rootFolders: (state) => {
      return state.folders.filter((folder) => folder.parentId === null)
    },

    // 获取指定文件夹的子文件夹
    subFolders: (state) => (parentId: string) => {
      return state.folders.filter((folder) => folder.parentId === parentId)
    },

    // 获取当前文件夹的子文件夹
    currentSubFolders: (state) => {
      if (!state.currentFolderId) return []
      return state.folders.filter((folder) => folder.parentId === state.currentFolderId)
    },

    // 获取文件夹路径（从根到当前文件夹）
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
    // 初始化数据
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

    // 保存数据到本地存储
    saveToStorage() {
      localStorage.setItem('notes-folders', JSON.stringify(this.folders))
      localStorage.setItem('notes-data', JSON.stringify(this.notes))
    },

    // 创建文件夹
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

    // 更新文件夹
    updateFolder(id: string, name: string) {
      const folder = this.folders.find((f) => f.id === id)
      if (folder) {
        folder.name = name
        folder.updatedAt = new Date()
        this.saveToStorage()
      }
    },

    // 删除文件夹（递归删除子文件夹）
    deleteFolder(id: string) {
      // 递归删除所有子文件夹
      const deleteRecursive = (folderId: string) => {
        // 找到所有子文件夹
        const subFolders = this.folders.filter((f) => f.parentId === folderId)

        // 递归删除每个子文件夹
        subFolders.forEach((subFolder) => {
          deleteRecursive(subFolder.id)
        })

        // 删除当前文件夹的笔记
        this.notes = this.notes.filter((note) => note.folderId !== folderId)

        // 删除文件夹本身
        const index = this.folders.findIndex((f) => f.id === folderId)
        if (index !== -1) {
          this.folders.splice(index, 1)
        }
      }

      deleteRecursive(id)

      // 如果删除的是当前文件夹，则切换到根文件夹或清空
      if (this.currentFolderId === id) {
        this.currentFolderId = null
        this.currentNoteId = null
      }

      this.saveToStorage()
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
    },

    // 发送到知识库
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

    // 获取文件夹及其所有子文件夹中的所有笔记
    getAllNotesInFolder(folderId: string): Note[] {
      const notes: Note[] = []

      // 获取当前文件夹的笔记
      const folderNotes = this.notes.filter((note) => note.folderId === folderId)
      notes.push(...folderNotes)

      // 递归获取子文件夹的笔记
      const subFolders = this.folders.filter((folder) => folder.parentId === folderId)
      for (const subFolder of subFolders) {
        notes.push(...this.getAllNotesInFolder(subFolder.id))
      }

      return notes
    }
  }
})
