import type { PluginContext } from '@agent-qi/types'

export interface UsageData {
  rolling: UsageEntry | null
  weekly: UsageEntry | null
  monthly: UsageEntry | null
  lastUpdated: number
}

export interface UsageEntry {
  type: string
  percentage: number
  resetsIn: string
  resetInSec: number
  status: string
}

interface CreateStatusRenderOptions {
  context: PluginContext
  usageDataRef: { value: UsageData | null }
  isPanelOpenRef: { value: boolean }
  tooltipRef: { value: string }
  isBusyRef: { value: boolean }
  isConfiguredRef: { value: boolean }
  onRefreshUsage: () => Promise<void>
  onOpenStandaloneWindow: () => void
}

const clampPercent = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) return null
  return Math.max(0, Math.min(100, value))
}

const formatPercent = (value: number | null | undefined) => {
  const normalized = clampPercent(value)
  return normalized === null ? '--' : `${normalized.toFixed(0)}%`
}

const formatRemaining = (value: number | null | undefined) => {
  const normalized = clampPercent(value)
  return normalized === null ? '--' : `${(100 - normalized).toFixed(0)}%`
}

const progressStyle = (value: number | null | undefined) => {
  const normalized = clampPercent(value)
  const used = normalized === null ? 0 : normalized
  const remaining = Math.max(0, 100 - used)
  return {
    width: `${remaining}%`,
    marginLeft: `${used}%`
  }
}

const formatElapsed = (epochSeconds: number | null | undefined) => {
  if (!epochSeconds) return '未刷新'
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - epochSeconds)
  if (diff < 10) return '刚刚'
  if (diff < 60) return `${diff}秒前`
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`
  return `${Math.floor(diff / 86400)}天前`
}

export const createStatusRender = (
  options: CreateStatusRenderOptions
): unknown => {
  const {
    context,
    usageDataRef,
    isPanelOpenRef,
    tooltipRef,
    isBusyRef,
    isConfiguredRef,
    onRefreshUsage,
    onOpenStandaloneWindow
  } = options

  return context.vue.markRaw(
    context.vue.defineComponent({
      setup() {
        const Button = context.components?.Button as any
        if (!Button) return () => null

        const isOpen = isPanelOpenRef
        const isBusy = isBusyRef

        const closePanel = () => {
          if (!isOpen.value) return
          isOpen.value = false
        }

        const onOutsidePointer = (event: Event) => {
          if (!isOpen.value) return
          const targetEl = event.target as HTMLElement | null
          if (targetEl?.closest?.('.ocgo-status-wrap')) return
          if (targetEl?.closest?.('.modal-overlay')) return
          closePanel()
        }

        const onKeydown = (event: KeyboardEvent) => {
          if (event.key === 'Escape') closePanel()
        }

        context.vue.onMounted(() => {
          window.addEventListener('pointerdown', onOutsidePointer, true)
          window.addEventListener('click', onOutsidePointer, true)
          document.addEventListener('keydown', onKeydown)
        })

        context.vue.onUnmounted(() => {
          window.removeEventListener('pointerdown', onOutsidePointer, true)
          window.removeEventListener('click', onOutsidePointer, true)
          document.removeEventListener('keydown', onKeydown)
        })

        const toggleOpen = (event: MouseEvent) => {
          event.stopPropagation()
          isOpen.value = !isOpen.value
        }

        const handleRefresh = async (event: MouseEvent) => {
          event.stopPropagation()
          if (isBusy.value) return
          await onRefreshUsage()
        }

        const handleOpenWindow = (event: MouseEvent) => {
          event.stopPropagation()
          onOpenStandaloneWindow()
        }

        const renderUsageBlock = (
          label: string,
          entry: UsageEntry | null,
          icon?: string
        ) => {
          const usedPercent = entry?.percentage
          return (
            <div class="ocgo-usage-block">
              <div class="ocgo-usage-row">
                <span class="ocgo-usage-label">
                  {icon ? <span style="margin-right:4px">{context.useIcon(icon)}</span> : null}
                  {label}
                </span>
                <span>
                  {formatPercent(usedPercent)} / {formatRemaining(usedPercent)}
                </span>
              </div>
              <div class="ocgo-usage-progress" aria-hidden="true">
                <div
                  class="ocgo-usage-progress-bar"
                  style={progressStyle(usedPercent)}
                />
              </div>
              <div class="ocgo-usage-row">
                <span class="ocgo-usage-label">重置</span>
                <span>{entry?.resetsIn || '--'}</span>
              </div>
            </div>
          )
        }

        return () => {
          const tooltip = tooltipRef.value
          const usage = usageDataRef.value
          const updatedText = usage
            ? formatElapsed(Math.floor(usage.lastUpdated / 1000))
            : '未刷新'
          const summaryText = usage
            ? `Go: ${formatPercent(usage.rolling?.percentage)}`
            : isConfiguredRef.value
              ? 'Go: ...'
              : 'Go: 未配置'

          return (
            <div class="ocgo-status-wrap" onClick={toggleOpen} title={tooltip}>
              <style>{`
                .ocgo-status-wrap {
                  position: relative;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  width: 100%;
                  height: 100%;
                  cursor: pointer;
                  gap: 4px;
                }
                .ocgo-status-wrap:hover {
                  background: var(--bg-hover);
                }
                .ocgo-status-icon {
                  font-size: 13px;
                  color: var(--text-secondary);
                }
                .ocgo-status-text {
                  font-size: 12px;
                  color: var(--text-primary);
                }
                .ocgo-status-panel {
                  position: absolute;
                  bottom: 100%;
                  left: 0;
                  transform: translateY(-8px);
                  background: var(--bg-card);
                  color: var(--text-primary);
                  border: 1px solid var(--border-subtle);
                  border-radius: 8px;
                  padding: 10px;
                  min-width: 280px;
                  max-width: 360px;
                  visibility: hidden;
                  opacity: 0;
                  transition: all 0.2s ease;
                  box-shadow: var(--shadow-xl);
                  z-index: 10000;
                }
                .ocgo-status-panel.open {
                  visibility: visible;
                  opacity: 1;
                  transform: translateY(-12px);
                }
                .ocgo-status-top {
                  display: flex;
                  align-items: flex-start;
                  justify-content: space-between;
                  gap: 10px;
                  margin-bottom: 8px;
                }
                .ocgo-status-title {
                  font-size: 12px;
                  font-weight: 600;
                }
                .ocgo-status-sub {
                  font-size: 12px;
                  color: var(--text-secondary);
                }
                .ocgo-usage-card {
                  margin-bottom: 8px;
                  padding: 8px;
                  border-radius: 8px;
                  background: var(--bg-hover);
                }
                .ocgo-usage-head {
                  display: flex;
                  align-items: center;
                  justify-content: space-between;
                  gap: 8px;
                  margin-bottom: 6px;
                  font-size: 12px;
                  font-weight: 600;
                }
                .ocgo-usage-meta {
                  display: grid;
                  gap: 4px;
                  font-size: 12px;
                }
                .ocgo-usage-block {
                  display: grid;
                  gap: 4px;
                  margin-top: 4px;
                }
                .ocgo-usage-row {
                  display: flex;
                  justify-content: space-between;
                  gap: 8px;
                }
                .ocgo-usage-progress {
                  position: relative;
                  height: 8px;
                  overflow: hidden;
                  border-radius: 999px;
                  background: rgba(127, 127, 127, 0.18);
                }
                .ocgo-usage-progress-bar {
                  height: 100%;
                  border-radius: inherit;
                  background: linear-gradient(90deg, #1f7ae0 0%, #41b3ff 100%);
                }
                .ocgo-usage-label {
                  color: var(--text-secondary);
                }
                .ocgo-usage-hint {
                  margin-top: 6px;
                  font-size: 12px;
                  color: var(--text-secondary);
                  word-break: break-word;
                }
                .ocgo-config-warn {
                  font-size: 12px;
                  color: var(--color-warning, #e8a838);
                  padding: 6px 0;
                }
              `}</style>
              <span class="ocgo-status-icon">{context.useIcon('Cpu')}</span>
              <span class="ocgo-status-text">{summaryText}</span>
              <div
                class={['ocgo-status-panel', isOpen.value ? 'open' : '']}
                onClick={(event: MouseEvent) => event.stopPropagation()}
              >
                <div class="ocgo-status-top">
                  <div>
                    <div class="ocgo-status-title">OpenCode Go 用量</div>
                    <div class="ocgo-status-sub">
                      {isConfiguredRef.value ? '已连接' : '未配置 Workspace ID / Cookie'}
                    </div>
                  </div>
                  <div style="display:flex;gap:6px">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={isBusy.value || !isConfiguredRef.value}
                      onClick={handleRefresh}
                    >
                      刷新
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleOpenWindow}
                      title="在独立窗口中打开"
                    >
                      独立窗口
                    </Button>
                  </div>
                </div>
                {!isConfiguredRef.value ? (
                  <div class="ocgo-config-warn">
                    请在插件设置中填写 Workspace ID 和 Auth Cookie。
                  </div>
                ) : (
                  <div class="ocgo-usage-card">
                    <div class="ocgo-usage-head">
                      <span>额度 / 用量</span>
                    </div>
                    <div class="ocgo-usage-meta">
                      {renderUsageBlock('5 小时 (Rolling)', usage?.rolling ?? null)}
                      {renderUsageBlock('1 周 (Weekly)', usage?.weekly ?? null)}
                      {renderUsageBlock('1 月 (Monthly)', usage?.monthly ?? null)}
                      <div class="ocgo-usage-row">
                        <span class="ocgo-usage-label">最近刷新</span>
                        <span>{updatedText}</span>
                      </div>
                    </div>
                    {isBusy.value ? (
                      <div class="ocgo-usage-hint">正在刷新…</div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          )
        }
      }
    })
  )
}
