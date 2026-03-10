import type { PluginContext } from '@agent-qi/types'
import {
  CODEX_PROVIDER_LOGO_URL,
  DEFAULT_CONFIG,
  type CodexProxyPluginConfig,
  type CodexProxyUsageWindow
} from './constants'

interface CreateAccountStatusRenderOptions {
  context: PluginContext
  runtimeConfig: CodexProxyPluginConfig
  isStatusPanelOpen: boolean
  tooltip: string
  onPanelOpenChange: (open: boolean) => void
  onSwitchAccount: (accountId: string) => Promise<void>
  onRefreshUsage: () => Promise<void>
  onSaveCurrentLogin: () => Promise<void>
  onWriteBackAuth: () => Promise<void>
  onRemoveCurrentAccount: () => Promise<void>
}

const getAccountLabel = (email: string, accountId: string) => email || accountId

const clampPercent = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) return null
  return Math.max(0, Math.min(100, value))
}

const formatPercent = (value: number | null | undefined) => {
  const normalized = clampPercent(value)
  return normalized === null ? '--' : `${normalized.toFixed(0)}%`
}

const formatRemaining = (window: CodexProxyUsageWindow | null | undefined) => {
  if (!window) return '--'
  return formatPercent(100 - window.usedPercent)
}

const progressWidth = (value: number | null | undefined) => {
  const normalized = clampPercent(value)
  return normalized === null ? '0%' : `${normalized}%`
}

const formatResetAt = (epochSeconds: number | null | undefined) => {
  if (!epochSeconds) return '--'
  const diff = epochSeconds - Math.floor(Date.now() / 1000)
  if (diff <= 0) return '已重置'

  const days = Math.floor(diff / 86400)
  const hours = Math.floor((diff % 86400) / 3600)
  const minutes = Math.floor((diff % 3600) / 60)
  const seconds = diff % 60

  if (days > 0) {
    return `${days}天${hours}小时后`
  }

  if (hours > 0) {
    return `${hours}小时${minutes}分后`
  }

  if (minutes > 0) {
    return `${minutes}分${seconds}秒后`
  }

  return `${seconds}秒后`
}

const formatElapsed = (epochSeconds: number | null | undefined) => {
  if (!epochSeconds) return '--'
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - epochSeconds)
  if (diff < 10) return '刚刚'
  if (diff < 60) return `${diff}秒前`
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`
  return `${Math.floor(diff / 86400)}天前`
}

const formatBalance = (
  usage: CodexProxyPluginConfig['usage'],
  usageError: string
) => {
  if (usage?.credits?.unlimited) return '无限'
  if (usage?.credits?.balance) return usage.credits.balance
  if (usageError) return '读取失败'
  return '--'
}

export const createAccountStatusRender = (
  options: CreateAccountStatusRenderOptions
): unknown => {
  const {
    context,
    runtimeConfig: config,
    isStatusPanelOpen: defaultOpen,
    tooltip,
    onPanelOpenChange,
    onSwitchAccount,
    onRefreshUsage,
    onSaveCurrentLogin,
    onWriteBackAuth,
    onRemoveCurrentAccount
  } = options

  return context.vue.markRaw(
    context.vue.defineComponent({
      setup() {
        const Button = context.components?.Button as any
        const Select = context.components?.Select as any
        if (!Button || !Select) return () => null

        const isOpen = context.vue.ref(defaultOpen)
        const selectedAccountId = context.vue.ref(config.activeAccountId || '')
        const isBusy = context.vue.ref(false)

        const closePanel = () => {
          if (!isOpen.value) return
          isOpen.value = false
          onPanelOpenChange(false)
        }

        const onOutsidePointer = (event: Event) => {
          if (!isOpen.value) return
          const targetEl = event.target as HTMLElement | null
          if (targetEl?.closest?.('.codex-status-wrap')) return
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

        const withBusy = async (fn: () => Promise<void>) => {
          if (isBusy.value) return
          isBusy.value = true
          try {
            await fn()
          } catch (error) {
            context.notification.error(
              error instanceof Error ? error.message : String(error),
              'Codex 代理'
            )
          } finally {
            isBusy.value = false
          }
        }

        const toggleOpen = (event: MouseEvent) => {
          event.stopPropagation()
          isOpen.value = !isOpen.value
          onPanelOpenChange(isOpen.value)
        }

        const handleSwitch = async (value: string | number) => {
          const nextId = String(value || '')
          selectedAccountId.value = nextId
          await withBusy(async () => {
            await onSwitchAccount(nextId)
          })
        }

        const handleSave = async (event: MouseEvent) => {
          event.stopPropagation()
          await withBusy(async () => {
            await onSaveCurrentLogin()
            selectedAccountId.value = config.activeAccountId || ''
          })
        }

        const handleRefreshUsage = async (event: MouseEvent) => {
          event.stopPropagation()
          await withBusy(async () => {
            await onRefreshUsage()
          })
        }

        const handleWriteBack = async (event: MouseEvent) => {
          event.stopPropagation()
          await withBusy(async () => {
            await onWriteBackAuth()
          })
        }

        const handleRemove = async (event: MouseEvent) => {
          event.stopPropagation()
          await withBusy(async () => {
            await onRemoveCurrentAccount()
            selectedAccountId.value = config.activeAccountId || ''
          })
        }

        return () => {
          const activeAccount = config.accounts.find(
            (item) => item.id === config.activeAccountId
          )
          const statusText =
            activeAccount?.email ||
            activeAccount?.accountId ||
            config.status ||
            DEFAULT_CONFIG.status
          const usage = config.usage
          const usageError = config.usageError
          const usageUpdatedText = usage?.fetchedAt
            ? formatElapsed(usage.fetchedAt)
            : '未刷新'
          const balanceText = formatBalance(usage, usageError)

          return (
            <div class="codex-status-wrap" onClick={toggleOpen} title={tooltip}>
              <style>{`
                .codex-status-wrap {
                  position: relative;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  width: 100%;
                  height: 100%;
                  cursor: pointer;
                }
                .codex-status-wrap:hover {
                  background: var(--bg-hover);
                }
                .codex-status-icon {
                  width: 16px;
                  height: 16px;
                  border-radius: 4px;
                }
                .codex-status-panel {
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
                .codex-status-panel.open {
                  visibility: visible;
                  opacity: 1;
                  transform: translateY(-12px);
                }
                .codex-status-title {
                  font-size: 12px;
                  font-weight: 600;
                  margin-bottom: 6px;
                }
                .codex-status-sub {
                  font-size: 12px;
                  color: var(--text-secondary);
                  margin-bottom: 8px;
                  word-break: break-all;
                }
                .codex-status-select-wrap {
                  margin-bottom: 8px;
                }
                .codex-status-actions {
                  display: grid;
                  grid-template-columns: repeat(2, minmax(0, 1fr));
                  gap: 6px;
                }
                .codex-usage-card {
                  margin-bottom: 8px;
                  padding: 8px;
                  border-radius: 8px;
                  background: var(--bg-hover);
                }
                .codex-usage-head {
                  display: flex;
                  align-items: center;
                  justify-content: space-between;
                  gap: 8px;
                  margin-bottom: 6px;
                  font-size: 12px;
                  font-weight: 600;
                }
                .codex-usage-meta {
                  display: grid;
                  gap: 4px;
                  font-size: 12px;
                }
                .codex-usage-block {
                  display: grid;
                  gap: 4px;
                  margin-top: 4px;
                }
                .codex-usage-row {
                  display: flex;
                  justify-content: space-between;
                  gap: 8px;
                }
                .codex-usage-progress {
                  position: relative;
                  height: 8px;
                  overflow: hidden;
                  border-radius: 999px;
                  background: rgba(127, 127, 127, 0.18);
                }
                .codex-usage-progress-bar {
                  height: 100%;
                  border-radius: inherit;
                  background: linear-gradient(90deg, #1f7ae0 0%, #41b3ff 100%);
                }
                .codex-usage-label {
                  color: var(--text-secondary);
                }
                .codex-usage-error {
                  margin-top: 6px;
                  font-size: 12px;
                  color: var(--color-danger, #d94b4b);
                  word-break: break-word;
                }
                .codex-status-btn.wide {
                  grid-column: 1 / -1;
                }
              `}</style>
              <img class="codex-status-icon" src={CODEX_PROVIDER_LOGO_URL} alt="Codex" />
              <div
                class={['codex-status-panel', isOpen.value ? 'open' : '']}
                onClick={(event: MouseEvent) => event.stopPropagation()}
              >
                <div class="codex-status-title">Codex 账号</div>
                <div class="codex-status-sub">当前：{statusText}</div>
                <div class="codex-usage-card">
                  <div class="codex-usage-head">
                    <span>额度 / 用量</span>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={isBusy.value || !config.activeAccountId}
                      onClick={handleRefreshUsage}
                    >
                      刷新
                    </Button>
                  </div>
                  <div class="codex-usage-meta">
                    <div class="codex-usage-row">
                      <span class="codex-usage-label">套餐</span>
                      <span>{usage?.planType || activeAccount?.planType || '--'}</span>
                    </div>
                    <div class="codex-usage-row">
                      <span class="codex-usage-label">Credits</span>
                      <span>{balanceText}</span>
                    </div>
                    <div class="codex-usage-block">
                      <div class="codex-usage-row">
                        <span class="codex-usage-label">5 小时</span>
                        <span>
                          {formatPercent(usage?.fiveHour?.usedPercent)} /{' '}
                          {formatRemaining(usage?.fiveHour)}
                        </span>
                      </div>
                      <div class="codex-usage-progress" aria-hidden="true">
                        <div
                          class="codex-usage-progress-bar"
                          style={{ width: progressWidth(usage?.fiveHour?.usedPercent) }}
                        />
                      </div>
                      <div class="codex-usage-row">
                        <span class="codex-usage-label">5 小时重置</span>
                        <span>{formatResetAt(usage?.fiveHour?.resetAt)}</span>
                      </div>
                    </div>
                    <div class="codex-usage-block">
                      <div class="codex-usage-row">
                        <span class="codex-usage-label">1 周</span>
                        <span>
                          {formatPercent(usage?.oneWeek?.usedPercent)} /{' '}
                          {formatRemaining(usage?.oneWeek)}
                        </span>
                      </div>
                      <div class="codex-usage-progress" aria-hidden="true">
                        <div
                          class="codex-usage-progress-bar"
                          style={{ width: progressWidth(usage?.oneWeek?.usedPercent) }}
                        />
                      </div>
                      <div class="codex-usage-row">
                        <span class="codex-usage-label">1 周重置</span>
                        <span>{formatResetAt(usage?.oneWeek?.resetAt)}</span>
                      </div>
                    </div>
                    <div class="codex-usage-row">
                      <span class="codex-usage-label">最近刷新</span>
                      <span>{usageUpdatedText}</span>
                    </div>
                  </div>
                  {usageError ? (
                    <div class="codex-usage-error" title={usageError}>
                      {usageError}
                    </div>
                  ) : null}
                </div>
                <div class="codex-status-select-wrap">
                  <Select
                    size="sm"
                    modelValue={selectedAccountId.value}
                    disabled={isBusy.value || config.accounts.length === 0}
                    options={
                      config.accounts.length
                        ? config.accounts.map((account) => ({
                            label: getAccountLabel(account.email, account.accountId),
                            value: account.id
                          }))
                        : [{ label: '暂无账号，请先保存当前登录', value: '' }]
                    }
                    clearable={false}
                    onUpdate:modelValue={handleSwitch}
                  />
                </div>
                <div class="codex-status-actions">
                  <Button
                    type="button"
                    size="sm"
                    disabled={isBusy.value}
                    onClick={handleSave}
                  >
                    保存当前登录
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={isBusy.value || !config.activeAccountId}
                    onClick={handleWriteBack}
                  >
                    写回 auth.json
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    danger
                    class="codex-status-btn wide"
                    disabled={isBusy.value || !config.activeAccountId}
                    onClick={handleRemove}
                  >
                    移除当前账号
                  </Button>
                </div>
              </div>
            </div>
          )
        }
      }
    })
  )
}
