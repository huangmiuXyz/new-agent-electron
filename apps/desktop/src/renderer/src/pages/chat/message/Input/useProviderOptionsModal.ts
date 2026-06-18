import { createRegistry } from '@renderer/services/chatService/registry'
import { useSettingsStore } from '@renderer/stores/settings'
import { storeToRefs } from 'pinia'
import { type ComputedRef } from 'vue'
import { z } from 'zod'

export const useProviderOptionsModal = (options: {
  chatProviderId: ComputedRef<string>
  currentChatProvider: ComputedRef<any>
}) => {
  const settingsStore = useSettingsStore()
  const { providerOptions: allProviderOptions } = storeToRefs(settingsStore)
  const { updateProviderOptions } = settingsStore
  const modal = useModal()

  const openProviderOptionsModal = () => {
    const schema = (() => {
      try {
        const registry = createRegistry({
          apiKey: options.currentChatProvider.value?.apiKey || '',
          baseURL: options.currentChatProvider.value?.baseUrl || '',
          name: options.chatProviderId.value
        })
        const provider = registry.getProvider(options.currentChatProvider.value?.providerType || '')
        return provider?.chatCallOptionsSchema || null
      } catch (e) {
        console.warn('Failed to get chat options schema:', e)
        return null
      }
    })()

    if (!schema) {
      modal.confirm({
        title: '参数设置',
        content: '当前提供商不支持参数配置',
        showCancel: false,
        confirmText: '确定'
      })
      return
    }

    const [FormComponent, formActions] = useForm<Record<string, any>>({
      schemas: schema as z.ZodObject<any>,
      initialData: allProviderOptions.value[options.chatProviderId.value] || {},
      size: 'sm',
      onSubmit: (data) => {
        if (options.chatProviderId.value) {
          updateProviderOptions(options.chatProviderId.value, data)
        }
        modal.remove()
      }
    })

    modal.confirm({
      title: '参数设置',
      width: '50%',
      content: FormComponent,
      confirmText: '应用',
      cancelText: '取消',
      onOk: () => {
        formActions.submit()
      }
    })
  }

  return {
    openProviderOptionsModal
  }
}
