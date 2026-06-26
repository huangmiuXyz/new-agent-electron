import { usePlugins } from '@renderer/composables/usePlugins'

const HOOK_TIMEOUT_MS = 2000

export const onUseToolAfter = async <T>(params: {
  toolName: string
  input: unknown
  result: T
  options: Record<string, unknown>
}): Promise<T> => {
  const { pluginLoader } = usePlugins()
  const manager = pluginLoader.getPluginManager()
  const hooks = manager.getHooks('tool:after-use')

  if (hooks.length === 0) return params.result

  let currentResult = params.result
  const timeoutPromise = new Promise<void>((resolve) =>
    setTimeout(() => {
      console.warn(`[onUseToolAfter] 插件 tool:after-use 钩子超过 ${HOOK_TIMEOUT_MS}ms 未完成，已跳过等待`)
      resolve()
    }, HOOK_TIMEOUT_MS)
  )

  for (const hook of hooks) {
    const hookPromise = (async () => {
      try {
        const modified = await hook.handler({
          toolName: params.toolName,
          input: params.input,
          result: currentResult,
          options: params.options
        })
        if (modified !== undefined) {
          currentResult = modified
        }
      } catch (error) {
        console.error(`[tool:after-use] 插件 "${hook.pluginName}" 处理失败:`, error)
      }
    })()

    await Promise.race([hookPromise, timeoutPromise])
  }

  return currentResult
}
