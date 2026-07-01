import { usePlugins } from '@renderer/composables/usePlugins'

export const onUseAIBefore = async (params: {
  model?: string
  providerType: providerType
  apiKey: string
  baseURL: string
}) => {
  const _t1 = createTimeLog('onUseAIBefore-pluginHooks')
  const { pluginLoader } = usePlugins()
  const manager = pluginLoader.getPluginManager()
  const hooks = manager.getHooks('ai:before-use')

  if (hooks.length === 0) {
    syncTimeLog(_t1, 'onUseAIBefore-pluginHooks')
    return
  }

  await manager.triggerHookParallel('ai:before-use', params)
  syncTimeLog(_t1, 'onUseAIBefore-pluginHooks')
}
