import { usePlugins } from '@renderer/composables/usePlugins'

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

  for (const hook of hooks) {
    try {
      const modified = await manager.runHook(hook, 'tool:after-use', {
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
  }

  return currentResult
}
