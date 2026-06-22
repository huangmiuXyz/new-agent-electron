import { usePlugins } from '@renderer/composables/usePlugins'

// 插件 ai:before-use 钩子的最大等待时间。超时后继续发送请求，不再阻塞主链路。
// 之前是无限 await，任一插件卡住都会导致「点击发送 → 首 token」长时间无响应。
const HOOK_TIMEOUT_MS = 2000

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

  // Execute hooks in parallel since they are independent.
  // 加超时兜底：插件不应阻塞发送主链路，超时后让插件自己在后台完成。
  const timeoutPromise = new Promise<void>((resolve) =>
    setTimeout(() => {
      console.warn(`[onUseAIBefore] 插件 ai:before-use 钩子超过 ${HOOK_TIMEOUT_MS}ms 未完成，已跳过等待`)
      resolve()
    }, HOOK_TIMEOUT_MS)
  )
  await Promise.race([
    manager.triggerHookParallel('ai:before-use', params),
    timeoutPromise
  ])
}
