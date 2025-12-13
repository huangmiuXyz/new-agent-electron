import { contextBridge, shell } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { aiServices } from './services/ai/index'
import fs from 'fs'
import path from 'path'
import mime from 'mime-types'
// Custom APIs for renderer

// @ts-ignore
export const api = {
  ...aiServices(),
  openFile: (url: string) => shell.openExternal(url),
  showOpenDialog: (options: Electron.OpenDialogOptions) =>
    electronAPI.ipcRenderer.invoke('dialog:showOpenDialog', options),
  fs,
  path,
  mime,
  saveFilesToUserData: async (
    files: {
      name: string
      buffer: ArrayBuffer
    }[]
  ) => {
    const { app } = require('@electron/remote')
    const userDataPath = app.getPath('userData')
    const uploadDir = path.join(userDataPath, 'uploads')

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }

    const results: { name: string; path: string }[] = []

    for (const file of files) {
      const filePath = path.join(uploadDir, file.name)
      const buffer = Buffer.from(file.buffer)

      fs.writeFileSync(filePath, buffer)

      results.push({
        name: file.name,
        path: filePath
      })
    }

    return results
  },
  copyFilesToUserData: async (filePaths: string[]) => {
    const { app } = require('@electron/remote')
    const userDataPath = app.getPath('userData')
    const uploadDir = path.join(userDataPath, 'uploads')

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }

    const results: {
      name: string
      sourcePath: string
      destPath: string
    }[] = []

    for (const filePath of filePaths) {
      const fileName = path.basename(filePath)
      const destPath = path.join(uploadDir, fileName)

      fs.copyFileSync(filePath, destPath)

      results.push({
        name: fileName,
        sourcePath: filePath,
        destPath
      })
    }

    return results
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
