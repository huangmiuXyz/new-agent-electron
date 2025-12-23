import { contextBridge, shell } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { aiServices } from './services/ai/index'
import fs from 'fs'
import path from 'path'
import mime from 'mime-types'
import url from 'url'
import { app } from '@electron/remote'
import { exec, spawn } from 'child_process'
import os from 'os'
// Custom APIs for renderer

// @ts-ignore ts(2742)
export const api = {
  ...aiServices(),
  pty: {
    spawn: (options: { id: string; cols?: number; rows?: number; cwd?: string }) =>
      electronAPI.ipcRenderer.invoke('pty:spawn', options),
    write: (id: string, data: string) => electronAPI.ipcRenderer.invoke('pty:write', { id, data }),
    resize: (id: string, cols: number, rows: number) =>
      electronAPI.ipcRenderer.invoke('pty:resize', { id, cols, rows }),
    kill: (id: string) => electronAPI.ipcRenderer.invoke('pty:kill', id),
    onData: (id: string, callback: (data: string) => void) => {
      const listener = (_event: any, data: string) => callback(data)
      electronAPI.ipcRenderer.on(`pty:data:${id}`, listener)
      return () => electronAPI.ipcRenderer.removeListener(`pty:data:${id}`, listener)
    },
    onExit: (id: string, callback: (info: { exitCode: number; signal?: number }) => void) => {
      const listener = (_event: any, info: any) => callback(info)
      electronAPI.ipcRenderer.on(`pty:exit:${id}`, listener)
      return () => electronAPI.ipcRenderer.removeListener(`pty:exit:${id}`, listener)
    }
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
