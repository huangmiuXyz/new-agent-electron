import type { PluginLoader } from './pluginLoader'

export const pluginLoaderRef = ref<PluginLoader | null>(null)

export function setPluginLoader(loader: PluginLoader): void {
    pluginLoaderRef.value = loader
}

export function getPluginLoader(): PluginLoader {
    if (!pluginLoaderRef.value) {
        throw new Error('PluginLoader instance not initialized. Please call setPluginLoader first.')
    }
    return pluginLoaderRef.value as PluginLoader
}
