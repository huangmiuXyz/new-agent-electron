import type { Plugin, PluginContext } from '@agent-qi/types'
import { createRendererBridge, type DiagnosticEntry, type ServerStatusInfo } from './protocol'
import { findServerByExtension } from './server-config'

const PLUGIN_NAME = 'lsp-diagnostics'
const STATUS_ID = 'lsp-diagnostics-status'
const MAX_PER_FILE = 20
const DIAG_POLL_INTERVAL = 300
const DIAG_TIMEOUT = 600000

let unsubBridge: (() => void) | null = null
let unsubServerStatus: (() => void) | null = null

function formatConnectedTime(ts: number): string {
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (diff < 60) return `${diff}秒前`
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`
  return `${Math.floor(diff / 86400)}天前`
}

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

    // ── LSP 服务器连接状态指示器 (使用内置 panel 预设) ──
    const servers = context.vue.ref<ServerStatusInfo[]>([])

    const serverListComponent = context.vue.markRaw(context.vue.defineComponent({
      setup() {
        return () => {
          const items = servers.value
          if (items.length === 0) {
            return context.vue.h('div', {
              style: { textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '12px', padding: '20px 14px' }
            }, [
              context.vue.h('div', {}, '暂无 LSP 服务器连接'),
              context.vue.h('div', { style: { marginTop: '4px', fontSize: '11px' } }, '编辑文件后自动启动'),
            ])
          }
          return context.vue.h('div', {}, items.map(s => context.vue.h('div', {
            style: { padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border-color-light)', fontSize: '12px' }
          }, [
            context.vue.h('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-success)', flexShrink: 0 } }),
            context.vue.h('div', { style: { flex: 1, minWidth: 0 } }, [
              context.vue.h('div', { style: { fontWeight: 600, color: 'var(--text-primary)', fontSize: '12px' } }, s.serverId),
              context.vue.h('div', { style: { color: 'var(--text-tertiary)', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '1px' } }, s.binary),
            ]),
            context.vue.h('div', { style: { fontSize: '10px', color: 'var(--text-tertiary)', whiteSpace: 'nowrap', flexShrink: 0 } }, formatConnectedTime(s.connectedAt)),
          ])))
        }
      }
    }))

    const countRef = context.vue.ref(0)
    const codeIcon = context.useIcon('Code')

    const iconComponent = context.vue.markRaw(context.vue.defineComponent({
      setup() {
        return () => {
          const count = countRef.value
          const color = count > 0 ? 'var(--color-primary)' : 'var(--text-tertiary)'
          return context.vue.h('span', {
            style: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '14px', height: '14px', color }
          }, [codeIcon])
        }
      }
    }))

    const updateStatus = () => {
      const list = servers.value
      countRef.value = list.length
      const tooltip = list.length > 0
        ? `LSP 已连接: ${list.map(s => s.serverId).join(', ')}`
        : 'LSP 诊断 (未连接)'

      ; (context.notification.status as unknown as (
        id: string, text: string, options?: Record<string, unknown>
      ) => void)(STATUS_ID, '', {
        type: 'panel',
        title: 'LSP 服务器连接',
        color: '#4fc3f7',
        tooltip,
        panelRender: serverListComponent,
        iconRender: iconComponent,
      })
    }

    // 初始查询已连接的服务器
    bridge.invoke('get-server-status')
      .then((result) => {
        servers.value = result.servers
        updateStatus()
      })
      .catch(() => {})

    // 监听服务器状态变化广播
    unsubServerStatus = bridge.on('server-status-changed', (data: any) => {
      servers.value = data
      updateStatus()
    })

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
        const deadline = Date.now() + DIAG_TIMEOUT
        let fileDiags: DiagnosticEntry[] = []
        while (Date.now() < deadline) {
          await delay(DIAG_POLL_INTERVAL)
          const diagResult = await bridge.invoke('get-diagnostics', {
            serverId: serverConfig.id,
            filePath: fullPath,
          })
          fileDiags = diagResult.diagnostics[fullPath] || []
          if (fileDiags.length > 0) break
        }
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
    if (unsubServerStatus) {
      unsubServerStatus()
      unsubServerStatus = null
    }
    context.notification.removeStatus(STATUS_ID)
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
