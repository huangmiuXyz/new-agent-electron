export interface Plugin {
  name: string
  version: string
  description: string
  author: string
  install: (context: PluginContext) => Promise<void>
  uninstall: (context: PluginContext) => void
}

export interface PluginContext {
  localforage: any
  useForm: any
  registerRegistry: (id: string, factory: (options?: any) => any) => void
  registerProvider: (id: string, config: any) => void
  unregisterProvider: (id: string) => void
  useTerminal?: () => any
  basePath: string
  api?: {
    os?: {
      platform: () => string
    }
    path?: {
      join: (...paths: string[]) => string
    }
  }
  notification: any
}

export interface VoxCPM2Config {
  apiKey?: string
  baseURL?: string
}
