import { contextBridge, shell } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { aiServices } from './services/ai/index'
import fs from 'fs'
import path from 'path'
import mime from 'mime-types'
import url from 'url'
import { app } from '@electron/remote'
// Custom APIs for renderer

// @ts-ignore
export const api: any = {
  ...aiServices(),
  showOpenDialog: async (options: Electron.OpenDialogOptions) =>
    (await electronAPI.ipcRenderer.invoke(
      'dialog:showOpenDialog',
      options
    )) as Electron.OpenDialogReturnValue,
  getPath: app.getPath,
  shell,
  fs,
  path,
  mime,
  url,
  sqlite: {
    getItem: (key: string) => electronAPI.ipcRenderer.invoke('sqlite:getItem', key),
    setItem: (key: string, value: string) =>
      electronAPI.ipcRenderer.invoke('sqlite:setItem', key, value),
    removeItem: (key: string) => electronAPI.ipcRenderer.invoke('sqlite:removeItem', key),
    initVssTable: (dimension: number) =>
      electronAPI.ipcRenderer.invoke('sqlite:initVssTable', dimension),
    insertChunks: (chunks: any[]) => electronAPI.ipcRenderer.invoke('sqlite:insertChunks', chunks),
    searchChunks: (kbId: string, embedding: number[], limit?: number) =>
      electronAPI.ipcRenderer.invoke('sqlite:searchChunks', kbId, embedding, limit),
    deleteChunksByDoc: (docId: string) =>
      electronAPI.ipcRenderer.invoke('sqlite:deleteChunksByDoc', docId),
    deleteChunksByKb: (kbId: string) =>
      electronAPI.ipcRenderer.invoke('sqlite:deleteChunksByKb', kbId),
    getChunksByDoc: (docId: string) =>
      electronAPI.ipcRenderer.invoke('sqlite:getChunksByDoc', docId)
  }
}

export type API = typeof api
// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
