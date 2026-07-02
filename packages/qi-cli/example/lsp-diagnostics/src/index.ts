import type { Plugin, PluginContext } from '@agent-qi/types'
import { createRendererBridge, type DiagnosticEntry } from './protocol'
import { findServerByExtension } from './server-config'

const PLUGIN_NAME = 'lsp-diagnostics'
const MAX_PER_FILE = 20

let unsubBridge: (() => void) | null = null

const plugin: Plugin = {
  name: PLUGIN_NAME,
  version: '1.0.0',
  description: 'edit_file 后自动诊断插件（基于真实 LSP 协议）',

  async install(context: PluginContext) {
    const bridge = createRendererBridge(context, PLUGIN_NAME)
    if (!bridge) {
      context.notification.error('LSP 诊断插件需要桌面环境。', PLUGIN_NAME)
      return
    }

    context.registerHook('tool:after-use', async (params: any) => {
      if (params.toolName !== 'edit_file') return
      if (!params.result?.toolResult?.content) return

      const filePath = params.input?.path || params.input?.new_path
      if (!filePath) return

      const ext = (filePath.split('.').pop() || '').toLowerCase()
      const extWithDot = '.' + ext
      const serverConfig = findServerByExtension(extWithDot)
      if (!serverConfig) return

      const workPath = await resolveWorkPath(context, params.options.chatId)
      if (!workPath) return

      const fullPath = context.api.path.resolve(workPath, filePath)
      if (!context.api.fs.existsSync(fullPath)) return

      try {
        const initResult = await bridge.invoke('init-server', {
          serverId: serverConfig.id,
          filePath: fullPath,
          directory: workPath,
        })
        if (!initResult.ok) return

        await bridge.invoke('open-document', {
          serverId: serverConfig.id,
          filePath: fullPath,
        })
        await delay(500)

        const diagResult = await bridge.invoke('get-diagnostics', {
          serverId: serverConfig.id,
          filePath: fullPath,
        })

        const fileDiags = diagResult.diagnostics[fullPath] || []
        if (fileDiags.length > 0) {
          const limited = fileDiags.slice(0, MAX_PER_FILE)
          const more = fileDiags.length - MAX_PER_FILE
          const suffix = more > 0 ? `\n... and ${more} more` : ''
          const formatted = limited.map(formatDiagnostic).join('\n')

          params.result.toolResult.content.push({
            type: 'text',
            text: `\n\n<lsp-diagnostics file="${filePath}">\n${formatted}${suffix}\n</lsp-diagnostics>`,
          })
          return params.result
        }
      } catch (err: any) {
        console.error('[lsp-diagnostics] Error:', err)
      }
    })
  },

  async uninstall(context: PluginContext) {
    const bridge = createRendererBridge(context, PLUGIN_NAME)
    if (bridge) {
      await bridge.invoke('shutdown-all').catch(() => { })
    }
    if (unsubBridge) {
      unsubBridge()
      unsubBridge = null
    }
  },
}

function formatDiagnostic(d: DiagnosticEntry): string {
  const severityLabel: Record<number, string> = { 1: 'ERROR', 2: 'WARN', 3: 'INFO', 4: 'HINT' }
  const severity = severityLabel[d.severity] || 'ERROR'
  const source = d.source ? `${d.source}: ` : ''
  const code = d.code ? `(${d.code}) ` : ''
  return `${severity} [${d.line}:${d.column}] ${source}${code}${d.message}`
}

async function resolveWorkPath(context: any, chatId: string): Promise<string | null> {
  const chatsStore = await context.getStore('chats')
  const agentStore = await context.getStore('agent')

  const chat = chatsStore.allChats?.find((c: any) => c.id === chatId)
  if (!chat) return null

  const agent = agentStore.getAgentById(chat.agentId)
  if (!agent) return null

  const workPath = agent.workPath?.trim()
  if (!workPath) return null

  return context.api.path.resolve(context.api.path.normalize(workPath))
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export default plugin
