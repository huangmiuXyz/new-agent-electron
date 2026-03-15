import { getPluginLoader } from '@renderer/services/plugins/pluginLoaderInstance'
import { useSettingsStore } from '@renderer/stores/settings'

export function usePlugins() {
  const plugins = ref<PluginInfo[]>([])
  const availablePlugins = ref<PluginInfoData[]>([])
  const loading = ref(false)
  const installing = ref(false)
  const activePluginId = ref('')

  const pluginLoader = getPluginLoader()
  const settingsStore = useSettingsStore()

  const pickPluginFile = async (): Promise<File | null> => {
    return await new Promise<File | null>((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.qi,.zip,application/zip,application/octet-stream,*/*'
      input.style.display = 'none'
      input.onchange = () => resolve(input.files?.[0] || null)
      document.body.appendChild(input)
      input.click()
      setTimeout(() => {
        document.body.removeChild(input)
      }, 0)
    })
  }

  const loadPluginDev = async (): Promise<void> => {
    try {
      installing.value = true

      if (!window.api?.showOpenDialog || !window.api?.path) {
        throw new Error('Dev plugin loading is not supported in the current environment')
      }

      const result = await window.api.showOpenDialog({
        title: 'Select plugin directory',
        properties: ['openDirectory']
      })

      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return
      }

      const localPath = result.filePaths[0]
      const pluginId = window.api.path.basename(localPath)

      await pluginLoader.loadPluginDev(localPath)
      settingsStore.addDevPluginPath(pluginId, localPath)
      await refreshPlugins()
      messageApi.success('Dev plugin loaded successfully')
    } catch (err) {
      console.error('Failed to load dev plugin:', err)
      messageApi.error(`Failed to load dev plugin: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      installing.value = false
    }
  }

  const installPlugin = async (): Promise<void> => {
    try {
      installing.value = true

      if (window.api?.showOpenDialog) {
        const result = await window.api.showOpenDialog({
          title: 'Select plugin package',
          filters: [
            { name: 'Plugin Package', extensions: ['qi', 'zip'] },
            { name: 'All Files', extensions: ['*'] }
          ],
          properties: ['openFile']
        })

        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
          return
        }

        await pluginLoader.installPlugin(result.filePaths[0])
      } else {
        const file = await pickPluginFile()
        if (!file) {
          return
        }
        await pluginLoader.installPlugin(file)
      }

      await refreshPlugins()
      messageApi.success('Plugin installed successfully')
    } catch (err) {
      console.error('Failed to install plugin:', err)
      messageApi.error(`Failed to install plugin: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      installing.value = false
    }
  }

  const refreshPlugins = async (): Promise<void> => {
    loading.value = true
    try {
      const result = await pluginLoader.refreshPlugins()
      plugins.value = result.loaded
      availablePlugins.value = result.available
    } catch (err) {
      console.error('Failed to refresh plugins:', err)
    } finally {
      loading.value = false
    }
  }

  const loadPlugin = async (pluginPath: string): Promise<void> => {
    try {
      const pluginInfo = await pluginLoader.loadPlugin(pluginPath)
      settingsStore.addLoadedPlugin(pluginInfo.plugin.name)
      await refreshPlugins()
    } catch (err) {
      console.error('Failed to load plugin:', err)
      throw err
    }
  }

  const unloadPlugin = async (pluginName: string): Promise<void> => {
    try {
      await pluginLoader.unloadPlugin(pluginName)
    } catch (err) {
      console.error('Failed to unload plugin:', err)
    } finally {
      settingsStore.removeLoadedPlugin(pluginName)
      settingsStore.removeDevPluginPath(pluginName)
      await refreshPlugins()
    }
  }

  const uninstallPlugin = async (pluginName: string): Promise<void> => {
    try {
      await pluginLoader.uninstallPlugin(pluginName)
    } catch (err) {
      console.error('Failed to uninstall plugin:', err)
    } finally {
      settingsStore.removeLoadedPlugin(pluginName)
      settingsStore.removeDevPluginPath(pluginName)
      await refreshPlugins()
    }
  }

  const restorePlugins = async (): Promise<void> => {
    const savedPlugins = settingsStore.loadedPlugins
    const devPlugins = settingsStore.devPluginPaths

    if (savedPlugins.length === 0 && Object.keys(devPlugins).length === 0) {
      return
    }

    for (const [pluginName, localPath] of Object.entries(devPlugins)) {
      try {
        if (!pluginLoader.isPluginLoaded(pluginName)) {
          await pluginLoader.loadPluginDev(localPath)
        }
      } catch (err) {
        console.error(`Failed to restore dev plugin "${pluginName}":`, err)
        settingsStore.removeDevPluginPath(pluginName)
      }
    }

    for (const pluginConfig of savedPlugins) {
      const pluginName = pluginConfig.name
      try {
        if (!pluginLoader.isPluginLoaded(pluginName)) {
          await pluginLoader.loadPlugin(pluginName)
        }
      } catch (err) {
        console.error(`Failed to restore plugin "${pluginName}":`, err)
        settingsStore.removeLoadedPlugin(pluginName)
      }
    }

    await refreshPlugins()
  }

  const executeCommand = async (commandName: string): Promise<void> => {
    try {
      await pluginLoader.getPluginManager().executeCommand(commandName)
    } catch (err) {
      console.error('Failed to execute command:', err)
      throw err
    }
  }

  const triggerHook = async (hookName: string, data?: any): Promise<any[]> => {
    try {
      return await pluginLoader.getPluginManager().triggerHook(hookName, data)
    } catch (err) {
      console.error(`Failed to trigger hook "${hookName}":`, err)
      return []
    }
  }

  const getStatusText = (status: PluginStatus): string => {
    const statusMap: Record<PluginStatus, string> = {
      unloaded: 'Unloaded',
      loading: 'Loading',
      loaded: 'Loaded',
      unloading: 'Unloading',
      error: 'Error'
    }
    return statusMap[status] || status
  }

  const getStatusColor = (status: PluginStatus): string => {
    const colorMap: Record<PluginStatus, string> = {
      unloaded: '#999',
      loading: '#1890ff',
      loaded: '#52c41a',
      unloading: '#faad14',
      error: '#ff4d4f'
    }
    return colorMap[status] || '#999'
  }

  const allPlugins = computed<PluginItem[]>(() => {
    const loadedIds = new Set(plugins.value.map((p) => (p.plugin as any).id || p.plugin.name))
    const available = availablePlugins.value.filter((p) => !loadedIds.has((p.path || p.name) as string))

    return [
      ...plugins.value.map((p) => {
        const pluginId = (p.plugin as any).id || p.plugin.name
        const metadata = availablePlugins.value.find(
          (ap) => (ap.path || ap.name) === pluginId || ap.name === p.plugin.name
        )

        return {
          id: pluginId,
          name: p.plugin.name,
          description: p.plugin.description || metadata?.description || '',
          version: p.plugin.version || metadata?.version || '1.0.0',
          status: p.status,
          type: 'loaded' as const,
          error: p.error,
          plugin: p.plugin,
          updatedAt: p.plugin.updatedAt || metadata?.updatedAt,
          isDev: pluginLoader.isDevMode(pluginId),
          readme: p.plugin.readme || metadata?.readme
        }
      }),
      ...available.map((p) => ({
        id: (p.path || p.name) as string,
        name: p.name,
        description: p.description || '',
        version: p.version || '1.0.0',
        status: 'unloaded' as PluginStatus,
        type: 'available' as const,
        path: p.path,
        error: undefined,
        updatedAt: p.updatedAt,
        readme: p.readme
      }))
    ]
  })

  const activePlugin = computed(() => {
    return allPlugins.value.find((p) => p.id === activePluginId.value)
  })

  const getPluginCommands = (pluginName: string): any[] => {
    return pluginLoader.getPluginManager().getAllCommands().filter((c: any) => c.pluginName === pluginName)
  }

  const getPluginHooks = (pluginName: string): string[] => {
    const allHooks = pluginLoader.getPluginManager().getAllHooks()
    const pluginHooks: string[] = []

    for (const [hookName, hooks] of allHooks.entries()) {
      if (hooks.some((hook: any) => hook.pluginName === pluginName)) {
        pluginHooks.push(hookName)
      }
    }

    return pluginHooks
  }

  const getPluginBuiltinTools = (pluginName: string): string[] => {
    return pluginLoader.getPluginManager().getPluginBuiltinToolNames(pluginName)
  }

  const getPluginRegistries = (pluginName: string): string[] => {
    return pluginLoader.getPluginManager().getPluginRegistries(pluginName)
  }

  const getPluginProviders = (pluginName: string): any[] => {
    return settingsStore.registeredProviders.filter((p) => p.pluginName === pluginName)
  }

  const selectPlugin = (pluginId: string): void => {
    activePluginId.value = pluginId
  }

  const togglePluginNotification = (pluginName: string, disabled: boolean) => {
    settingsStore.togglePluginNotification(pluginName, disabled)
  }

  const isPluginNotificationDisabled = (pluginName: string): boolean => {
    const plugin = settingsStore.loadedPlugins.find((p) => p.name === pluginName)
    return !!plugin?.notificationsDisabled
  }

  const clearPluginData = async (pluginName: string): Promise<void> => {
    const { confirm, remove } = useModal()
    const confirmed = await confirm({
      title: 'Clear plugin data',
      content: `Clear cached data for "${pluginName}"?`
    })

    if (!confirmed) {
      return
    }

    try {
      loading.value = true
      await triggerHook('plugin.clearData', { pluginName })

      const localforage = (await import('localforage')).default
      await localforage.dropInstance({
        name: pluginName
      })

      messageApi.success('Plugin data cleared')
      await refreshPlugins()
    } catch (err) {
      console.error('Failed to clear plugin data:', err)
      messageApi.error(`Failed to clear plugin data: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      loading.value = false
      remove()
    }
  }

  return {
    plugins,
    availablePlugins,
    allPlugins,
    loading,
    installing,
    activePluginId,
    activePlugin,
    installPlugin,
    loadPluginDev,
    refreshPlugins,
    loadPlugin,
    unloadPlugin,
    uninstallPlugin,
    restorePlugins,
    executeCommand,
    getStatusText,
    getStatusColor,
    getPluginCommands,
    getPluginHooks,
    getPluginBuiltinTools,
    getPluginRegistries,
    getPluginProviders,
    selectPlugin,
    pluginLoader,
    triggerHook,
    togglePluginNotification,
    isPluginNotificationDisabled,
    clearPluginData
  }
}
