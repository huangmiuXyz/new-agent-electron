import { ElectronAPI } from '@electron-toolkit/preload'
import { type API } from './index'

declare global {
  interface Window {
    electron: ElectronAPI
    api: API & {
      saveFilesToUserData: (
        files: {
          name: string
          buffer: ArrayBuffer
        }[]
      ) => Promise<
        {
          name: string
          path: string
        }[]
      >
      copyFilesToUserData: (filePaths: string[]) => Promise<
        {
          name: string
          sourcePath: string
          destPath: string
        }[]
      >
    }
  }
}
declare module '@ai-sdk/provider-utils' {}
declare module '@ai-sdk/provider' {}
