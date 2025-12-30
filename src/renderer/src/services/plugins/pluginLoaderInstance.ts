import type { PluginLoader } from './pluginLoader'

/**
 * 插件加载器全局实例
 * 使用 ref 包装，使其在 Vue 3 的 Composition API 中可响应式访问
 */
export const pluginLoaderRef = ref<PluginLoader | null>(null)

/**
 * 设置插件加载器实例
 * @param loader 插件加载器实例
 */
export function setPluginLoader(loader: PluginLoader): void {
    pluginLoaderRef.value = loader
}

/**
 * 获取插件加载器实例
 * @returns 插件加载器实例
 */
export function getPluginLoader(): PluginLoader {
    if (!pluginLoaderRef.value) {
        throw new Error('PluginLoader instance not initialized. Please call setPluginLoader first.')
    }
    return pluginLoaderRef.value as PluginLoader
}
