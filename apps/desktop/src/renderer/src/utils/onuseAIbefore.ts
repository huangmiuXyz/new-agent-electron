import { usePlugins } from '@renderer/composables/usePlugins'

export const onUseAIBefore = async (params: {
  model?: string
  providerType: providerType
  apiKey: string
  baseURL: string
}) => {
  const { triggerHook } = usePlugins()
  await triggerHook('ai:before-use', params)
}
