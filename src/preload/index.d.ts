import { ElectronAPI } from '@electron-toolkit/preload'
import { type API } from './index'
declare global {
  interface Window {
    electron: ElectronAPI
    api: API
  }
}
declare module '@ai-sdk/provider-utils' {}
declare module '@ai-sdk/provider' {}
