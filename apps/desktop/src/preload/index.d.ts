import { ElectronAPI as ToolkitElectronAPI } from '@electron-toolkit/preload'
import { type ElectronAPI as SharedElectronAPI } from '@agent-qi/types'

type ElectronAPI = SharedElectronAPI & {
  setTitleBarTheme: (isDarkMode: boolean) => Promise<boolean>
  window: {
    isFullScreen: () => boolean
    onFullScreenChanged: (callback: (isFullScreen: boolean) => void) => () => void
  }
  system: {
    getSettings: () => Promise<{
      openAtLogin: boolean
      openAtLoginSupported: boolean
    }>
    setOpenAtLogin: (enabled: boolean) => Promise<{
      openAtLogin: boolean
      openAtLoginSupported: boolean
    }>
  }
  sync?: {
    startHost: (options?: { displayName?: string; port?: number }) => Promise<{
      running: boolean
      port: number
      displayName: string
      deviceId: string
      urls: string[]
      connectedClients: number
      snapshotUpdatedAt?: number
      error?: string
    }>
    stopHost: () => Promise<{
      running: boolean
      port: number
      displayName: string
      deviceId: string
      urls: string[]
      connectedClients: number
      snapshotUpdatedAt?: number
      error?: string
    }>
    getHostState: () => Promise<{
      running: boolean
      port: number
      displayName: string
      deviceId: string
      urls: string[]
      connectedClients: number
      snapshotUpdatedAt?: number
      error?: string
    }>
    updateProfile: (options: { displayName?: string }) => Promise<{
      running: boolean
      port: number
      displayName: string
      deviceId: string
      urls: string[]
      connectedClients: number
      snapshotUpdatedAt?: number
      error?: string
    }>
    publishSnapshot: (payload: { deviceId: string; displayName: string; snapshot: any }) => Promise<{ ok: boolean }>
    listEndpoints: () => Promise<any[]>
    getEndpointSnapshot: (deviceId: string) => Promise<any | null>
    onEvent: (callback: (event: any) => void) => () => void
  }
}

declare global {
  interface Window {
    electron: ToolkitElectronAPI
    api: ElectronAPI
  }
}
