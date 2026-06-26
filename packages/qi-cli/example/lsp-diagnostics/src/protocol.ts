import type { PluginContext, MainPluginContext } from '@agent-qi/types'

export interface DiagnosticEntry {
  severity: 1 | 2 | 3 | 4
  message: string
  line: number
  column: number
  source?: string
  code?: string | number
}

export interface PluginProtocol {
  'init-server': {
    args: [{ serverId: string; filePath: string; directory: string }]
    result: { ok: boolean; error?: string }
  }
  'open-document': {
    args: [{ serverId: string; filePath: string }]
    result: { version: number; ok: boolean }
  }
  'get-diagnostics': {
    args: [{ serverId?: string; filePath?: string }]
    result: { diagnostics: Record<string, DiagnosticEntry[]> }
  }
  'shutdown-server': {
    args: [{ serverId: string }]
    result: void
  }
  'shutdown-all': {
    args: []
    result: void
  }
}

export type ProtocolChannel = keyof PluginProtocol

export type RendererBridge = {
  invoke: <K extends ProtocolChannel>(
    channel: K,
    ...args: PluginProtocol[K]['args']
  ) => Promise<PluginProtocol[K]['result']>
  on: <K extends ProtocolChannel>(
    channel: K,
    callback: (...args: PluginProtocol[K]['args']) => void
  ) => () => void
}

export type MainBridge = {
  handle: <K extends ProtocolChannel>(
    channel: K,
    handler: (...args: PluginProtocol[K]['args']) => PluginProtocol[K]['result'] | Promise<PluginProtocol[K]['result']>
  ) => void
  broadcast: <K extends ProtocolChannel>(channel: K, ...args: PluginProtocol[K]['args']) => void
}

export function createRendererBridge(ctx: PluginContext, pluginName: string): RendererBridge | null {
  const ipc = ctx.api?.pluginMain?.ipc
  if (!ipc) return null
  return {
    invoke: (channel, ...args) =>
      ipc.invoke(pluginName, channel, ...args) as Promise<PluginProtocol[typeof channel]['result']>,
    on: (channel, callback) => ipc.on(pluginName, channel, callback as (...args: unknown[]) => void),
  }
}

export function createMainBridge(ctx: MainPluginContext): MainBridge {
  const { ipc } = ctx
  return {
    handle: (channel, handler) => {
      ipc.handle(channel, (_event, ...args) => handler(...(args as PluginProtocol[typeof channel]['args'])))
    },
    broadcast: (channel, ...args) => {
      ipc.broadcast(channel, ...args)
    },
  }
}
