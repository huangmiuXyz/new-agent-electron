import { ElectronAPI as ToolkitElectronAPI } from '@electron-toolkit/preload'
import { type ElectronAPI as SharedElectronAPI } from '@agent-qi/types'

type ElectronAPI = SharedElectronAPI & {
  setTitleBarTheme: (isDarkMode: boolean) => Promise<boolean>
}

declare global {
  interface Window {
    electron: ToolkitElectronAPI
    api: ElectronAPI
  }
}
