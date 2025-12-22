import { contextBridge, shell } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { aiServices } from './services/ai/index'
import fs from 'fs'
import path from 'path'
import mime from 'mime-types'
import url from 'url'
import { app } from '@electron/remote'
import { exec } from 'child_process'
import os from 'os'
import { ptyServices } from './services/pty'
// Custom APIs for renderer

const pty = ptyServices()

// @ts-ignore ts(2742)
export const api = {
  ...aiServices(),
  pty: {
    start: pty.startPty,
    sendInput: pty.sendInput,
    resize: pty.resize,
    onOutput: pty.onOutput
  },
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
    isSupported: () => electronAPI.ipcRenderer.invoke('sqlite:isSupported'),
    upsertChunks: (chunks: any[]) => electronAPI.ipcRenderer.invoke('sqlite:upsertChunks', chunks),
    deleteChunksByDoc: (docId: string) =>
      electronAPI.ipcRenderer.invoke('sqlite:deleteChunksByDoc', docId),
    deleteChunksByKb: (kbId: string) =>
      electronAPI.ipcRenderer.invoke('sqlite:deleteChunksByKb', kbId),
    search: (options: any) => electronAPI.ipcRenderer.invoke('sqlite:search', options)
  },
  exec,
  os,
  createTempChat: (data: any) => electronAPI.ipcRenderer.invoke('window:create-temp-chat', data),
  getTempChatData: (windowId: string) =>
    electronAPI.ipcRenderer.invoke('window:get-temp-chat-data', windowId),
  updater: {
    getVersion: () => electronAPI.ipcRenderer.invoke('updater:get-version'),
    checkForUpdates: () => electronAPI.ipcRenderer.invoke('updater:check-for-updates'),
    downloadUpdate: () => electronAPI.ipcRenderer.invoke('updater:download-update'),
    quitAndInstall: () => electronAPI.ipcRenderer.invoke('updater:quit-and-install'),
    onStatus: (callback: (status: any) => void) => {
      const listener = (_event: any, status: any) => callback(status)
      electronAPI.ipcRenderer.on('updater:status', listener)
      return () => {
        electronAPI.ipcRenderer.removeListener('updater:status', listener)
      }
    }
  }
} satisfies typeof api

export type API = typeof api
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
