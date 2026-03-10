import type { PluginContext } from '@agent-qi/types'
import {
  CODEX_PROVIDER_LOGO_URL,
  DEFAULT_CONFIG,
  type CodexProxyPluginConfig
} from './constants'

interface CreateAccountStatusRenderOptions {
  context: PluginContext
  runtimeConfig: CodexProxyPluginConfig
  isStatusPanelOpen: boolean
  tooltip: string
  onPanelOpenChange: (open: boolean) => void
  onSwitchAccount: (accountId: string) => Promise<void>
  onSaveCurrentLogin: () => Promise<void>
  onWriteBackAuth: () => Promise<void>
  onRemoveCurrentAccount: () => Promise<void>
}

const getAccountLabel = (email: string, accountId: string) => email || accountId

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
