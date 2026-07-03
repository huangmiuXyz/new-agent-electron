import type { PluginContext } from '@agent-qi/types'
import type { ServerStatusInfo } from './protocol'

interface CreateLspStatusRenderOptions {
  context: PluginContext
  serversRef: { value: ServerStatusInfo[] }
  isPanelOpenRef: { value: boolean }
  tooltipRef: { value: string }
}

function formatConnectedTime(ts: number): string {
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (diff < 60) return `${diff}秒前`
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`
  return `${Math.floor(diff / 86400)}天前`
}

export const createLspStatusRender = (
  options: CreateLspStatusRenderOptions
): unknown => {
  const {
    context,
    serversRef,
    isPanelOpenRef,
    tooltipRef,
  } = options

  return context.vue.markRaw(
    context.vue.defineComponent({
      setup() {
        const isOpen = isPanelOpenRef
        const servers = serversRef

        const closePanel = () => {
          if (!isOpen.value) return
          isOpen.value = false
        }

        const onOutsidePointer = (event: Event) => {
          if (!isOpen.value) return
          const targetEl = event.target as HTMLElement | null
          if (targetEl?.closest?.('.lsp-status-wrap')) return
          closePanel()
        }

        const onKeydown = (event: KeyboardEvent) => {
          if (event.key === 'Escape') closePanel()
        }

        context.vue.onMounted(() => {
          window.addEventListener('pointerdown', onOutsidePointer, true)
          document.addEventListener('keydown', onKeydown)
        })

        context.vue.onUnmounted(() => {
          window.removeEventListener('pointerdown', onOutsidePointer, true)
          document.removeEventListener('keydown', onKeydown)
        })

        const toggleOpen = (event: MouseEvent) => {
          event.stopPropagation()
          isOpen.value = !isOpen.value
        }

        const formatCount = (n: number) => n > 0 ? `${n}` : '0'

        return () => {
          const list = servers.value
          const count = list.length

          return (
            <div class="lsp-status-wrap" style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
              <div
                class="lsp-status-btn"
                role="button"
                tabindex="0"
                title={tooltipRef.value}
                onClick={toggleOpen}
                onKeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') toggleOpen(e as any) }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 6px',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  fontSize: '12px',
                  color: count > 0 ? 'var(--vp-c-brand-1, #4fc3f7)' : 'var(--vp-c-text-2, #888)',
                }}
              >
                <span style={{ fontSize: '14px', lineHeight: 1 }}>⚡</span>
                <span style={{ fontSize: '11px', fontWeight: 600 }}>LSP</span>
                {count > 0 && (
                  <span style={{
                    background: 'var(--vp-c-brand-1, #4fc3f7)',
                    color: '#fff',
                    borderRadius: '10px',
                    padding: '0 5px',
                    fontSize: '10px',
                    lineHeight: '16px',
                    fontWeight: 700,
                    minWidth: '16px',
                    textAlign: 'center',
                  }}>
                    {formatCount(count)}
                  </span>
                )}
              </div>

              {isOpen.value && (
                <div
                  class="lsp-status-panel"
                  style={{
                    position: 'fixed',
                    right: '20px',
                    bottom: '40px',
                    width: '320px',
                    maxHeight: '360px',
                    background: 'var(--vp-c-bg-elv, #1e1e1e)',
                    border: '1px solid var(--vp-c-border, #333)',
                    borderRadius: '8px',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    zIndex: 9999,
                  }}
                  onClick={(e: MouseEvent) => e.stopPropagation()}
                >
                  <div style={{
                    padding: '10px 14px',
                    borderBottom: '1px solid var(--vp-c-border, #333)',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--vp-c-text-1, #ddd)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}>
                    <span>⚡</span>
                    <span>LSP 服务器连接</span>
                    <span style={{
                      marginLeft: 'auto',
                      fontSize: '11px',
                      fontWeight: 400,
                      color: 'var(--vp-c-text-2, #888)',
                    }}>
                      {count === 0 ? '未连接' : `${count} 个活跃`}
                    </span>
                  </div>

                  <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: count > 0 ? '4px 0' : '20px 14px',
                  }}>
                    {count === 0 ? (
                      <div style={{
                        textAlign: 'center',
                        color: 'var(--vp-c-text-3, #666)',
                        fontSize: '12px',
                      }}>
                        暂无 LSP 服务器连接
                        <div style={{ marginTop: '4px', fontSize: '11px' }}>
                          编辑文件后自动启动
                        </div>
                      </div>
                    ) : (
                      list.map((s) => (
                        <div
                          key={s.serverId}
                          style={{
                            padding: '8px 14px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            borderBottom: '1px solid var(--vp-c-border, #333)',
                            fontSize: '12px',
                          }}
                        >
                          <span style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: 'var(--vp-c-green-1, #4caf50)',
                            flexShrink: 0,
                          }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontWeight: 600,
                              color: 'var(--vp-c-text-1, #ddd)',
                              fontSize: '12px',
                            }}>
                              {s.serverId}
                            </div>
                            <div style={{
                              color: 'var(--vp-c-text-3, #666)',
                              fontSize: '11px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              marginTop: '1px',
                            }}>
                              {s.binary}
                            </div>
                          </div>
                          <div style={{
                            fontSize: '10px',
                            color: 'var(--vp-c-text-3, #666)',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}>
                            {formatConnectedTime(s.connectedAt)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        }
      }
    })
  )
}
