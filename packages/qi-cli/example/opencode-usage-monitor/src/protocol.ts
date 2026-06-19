import type { PluginContext, MainPluginContext } from '@agent-qi/types'

export interface WorkspaceData {
  workId: string
  authCookie: string
}

export interface PluginProtocol {
  'show-window': { args: []; result: { ok: boolean } }
  'hide-window': { args: []; result: { ok: boolean } }
  'workspace-data': { args: [WorkspaceData]; result: void }
  'auth-success': { args: []; result: void }
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
  broadcast: <K extends ProtocolChannel>(
    channel: K,
    ...args: PluginProtocol[K]['args']
  ) => void
}

export function createRendererBridge(ctx: PluginContext, pluginName: string): RendererBridge | null {
  const ipc = ctx.api?.pluginMain?.ipc
  if (!ipc) return null

  return {
    invoke: (channel, ...args) =>
      ipc.invoke(pluginName, channel, ...args) as Promise<unknown> as Promise<PluginProtocol[typeof channel]['result']>,
    on: (channel, callback) =>
      ipc.on(pluginName, channel, callback as (...args: unknown[]) => void)
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
    }
  }
}
