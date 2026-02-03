import { ElectronAPI as ToolkitElectronAPI } from '@electron-toolkit/preload'
import { type ElectronAPI } from '@agent-qi/types'

declare global {
  interface Window {
    electron: ToolkitElectronAPI
    api: ElectronAPI
  }
}
