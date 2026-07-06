import { ElectronAPI as ToolkitElectronAPI } from '@electron-toolkit/preload'
import { type ElectronAPI as SharedElectronAPI } from '@agent-qi/types'

interface ProcessMetric {
  type: string
  pid: number
  memory?: {
    workingSetSize?: number
    privateBytes?: number
    sharedBytes?: number
  }
  url?: string
  name?: string
}

type ElectronAPI = SharedElectronAPI & {
  setTitleBarTheme: (isDarkMode: boolean) => Promise<boolean>
  getProcessMetrics: () => Promise<ProcessMetric[]>
  /** 设置当前插件上下文名称（供进程追踪使用） */
  __setCurrentPlugin: (name: string | null) => void
  /** 清除当前插件上下文 */
  __clearCurrentPlugin: () => void
  window: {
    isFullScreen: () => boolean
    onFullScreenChanged: (callback: (isFullScreen: boolean) => void) => () => void
  }
  process: {
    pid: number
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
