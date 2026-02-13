// @ts-nocheck
import { contextBridge, shell } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { aiServices } from './services/ai/index'
import fs from 'fs'
import path from 'path'
import mime from 'mime-types'
import url from 'url'
import { app, getCurrentWindow } from '@electron/remote'
import { exec, spawn, fork } from 'child_process'
import os from 'os'
import { type ElectronAPI } from '@agent-qi/types'


export const api: ElectronAPI = {
  ...aiServices(),
  process: {
    platform: process.platform,
    env: process.env,
    execPath: process.execPath
  },
  pty: {
    spawn: (options: {
      id: string
      cols?: number
      rows?: number
      cwd?: string
      startupLocation?: string
      customLocationPath?: string
    }) => electronAPI.ipcRenderer.invoke('pty:spawn', options),
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
  app,
  openDevTools: () => getCurrentWindow().webContents.openDevTools(),
  isPackaged: app.isPackaged,
  getPath: app.getPath,
  getAppPath: app.getAppPath,
  getPluginsPath: () => {
    return path.join(app.getPath('userData'), 'plugins')
  },
  shell,
  fs,
  path,
  mime,
  url,
  sqlite: {
    isSupported: () => electronAPI.ipcRenderer.invoke('sqlite:isSupported'),
    upsertChunks: (chunks: any[]) => electronAPI.ipcRenderer.invoke('sqlite:upsertChunks', chunks),
    updateChunks: (chunks: any[]) => electronAPI.ipcRenderer.invoke('sqlite:updateChunks', chunks),
    deleteChunksByDoc: (docId: string) =>
      electronAPI.ipcRenderer.invoke('sqlite:deleteChunksByDoc', docId),
    deleteChunksByKb: (kbId: string) =>
      electronAPI.ipcRenderer.invoke('sqlite:deleteChunksByKb', kbId),
    search: (options: any) => electronAPI.ipcRenderer.invoke('sqlite:search', options),
    getAllChunks: () => electronAPI.ipcRenderer.invoke('sqlite:getAllChunks'),
    getChunksByHash: (params: { content_hashes: string[]; model_id: string; dimension: number }) =>
      electronAPI.ipcRenderer.invoke('sqlite:getChunksByHash', params)
  },
  exec,
  spawn,
  fork,
  os,
  watch: (path: string, callback: (event: string, filename: string) => void) => {
    const watcher = fs.watch(path, { recursive: true }, callback)
    return () => watcher.close()
  },
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
  },
  net: {
    fetch: (url: string, options?: any) => electronAPI.ipcRenderer.invoke('net:fetch', url, options),
    download: (options: { url: string; destPath: string; id?: string; offset?: number }) =>
      electronAPI.ipcRenderer.invoke('net:download', options),
    onDownloadProgress: (id: string, callback: (progress: any) => void) => {
      const listener = (_event: any, progress: any) => callback(progress)
      electronAPI.ipcRenderer.on(`net:download-progress:${id}`, listener)
      return () => electronAPI.ipcRenderer.removeListener(`net:download-progress:${id}`, listener)
    },
    cancelDownload: (id: string) => electronAPI.ipcRenderer.invoke('net:cancel-download', id)
  }
}

// @ts-ignore - 类型推断需要引用 .pnpm/@ai-sdk+provider，不可移植
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
