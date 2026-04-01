import { usePlugins } from '@renderer/composables/usePlugins'

export const onUseAIBefore = async (params: {
  model?: string
  providerType: providerType
  apiKey: string
  baseURL: string
}) => {
  const { pluginLoader } = usePlugins()
  const manager = pluginLoader.getPluginManager()
  const hooks = manager.getHooks('ai:before-use')

  if (hooks.length === 0) {
    return
  }

  // Execute hooks in parallel since they are independent
  await manager.triggerHookParallel('ai:before-use', params)
}
