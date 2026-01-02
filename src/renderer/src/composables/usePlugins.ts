import { getPluginLoader } from '@renderer/services/plugins/pluginLoaderInstance';
import { useSettingsStore } from '@renderer/stores/settings';

export function usePlugins() {

  const plugins = ref<PluginInfo[]>([]);
  const availablePlugins = ref<PluginInfoData[]>([]);
  const loading = ref(false);
  const installing = ref(false);
  const activePluginId = ref('');


  const pluginLoader = getPluginLoader();


  const settingsStore = useSettingsStore();

  /**
   * 开发模式加载插件（从本地目录）
   */
  const loadPluginDev = async (): Promise<void> => {
    try {
      installing.value = true;

      const result = await window.api.showOpenDialog({
        title: '选择插件本地目录',
        properties: ['openDirectory']
      });

      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return;
      }

      const localPath = result.filePaths[0];

      if (pluginLoader) {
        const pluginInfo = await pluginLoader.loadPluginDev(localPath);
        const pluginName = pluginInfo.plugin.name;
        settingsStore.addDevPluginPath(pluginName, localPath);
        await refreshPlugins();
        alert('开发模式插件加载成功，已开启自动重载！');
      }
    } catch (err) {
      console.error('Failed to load dev plugin:', err);
      alert(`开发模式加载失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      installing.value = false;
    }
  };

  /**
   * 安装插件
   */
  const installPlugin = async (): Promise<void> => {
    try {
      installing.value = true;


      const result = await window.api.showOpenDialog({
        title: '选择插件文件',
        filters: [
          { name: '插件文件', extensions: ['qi'] },
          { name: '所有文件', extensions: ['*'] }
        ],
        properties: ['openFile']
      });

      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return;
      }

      const zipFilePath = result.filePaths[0];


      if (pluginLoader) {
        await pluginLoader.installPlugin(zipFilePath);
      }


      await refreshPlugins();
      alert('插件安装成功！');
    } catch (err) {
      console.error('Failed to install plugin:', err);
      alert(`插件安装失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      installing.value = false;
    }
  };

  /**
   * 刷新插件列表
   */
  const refreshPlugins = async (): Promise<void> => {
    loading.value = true;
    try {
      if (pluginLoader) {
        const result = await pluginLoader.refreshPlugins();
        plugins.value = result.loaded;
        availablePlugins.value = result.available;
      }
    } catch (err) {
      console.error('Failed to refresh plugins:', err);
    } finally {
      loading.value = false;
    }
  };

  /**
   * 加载插件
   */
  const loadPlugin = async (pluginPath: string): Promise<void> => {
    try {
      if (pluginLoader) {
        const pluginInfo = await pluginLoader.loadPlugin(pluginPath);
        const pluginName = pluginInfo.plugin.name;
        settingsStore.addLoadedPlugin(pluginName);
        await refreshPlugins();
      }
    } catch (err) {
      console.error('Failed to load plugin:', err);
      throw err;
    }
  };

  /**
   * 卸载插件（仅从内存中移除）
   */
  const unloadPlugin = async (pluginName: string): Promise<void> => {
    try {
      if (pluginLoader) {
        await pluginLoader.unloadPlugin(pluginName);

        settingsStore.removeLoadedPlugin(pluginName);
        settingsStore.removeDevPluginPath(pluginName);
        await refreshPlugins();
      }
    } catch (err) {
      console.error('Failed to unload plugin:', err);
      throw err;
    }
  };

  /**
   * 完全卸载插件（从内存和文件系统中移除）
   */
  const uninstallPlugin = async (pluginName: string): Promise<void> => {
    try {
      if (pluginLoader) {
        await pluginLoader.uninstallPlugin(pluginName);

        settingsStore.removeLoadedPlugin(pluginName);
        settingsStore.removeDevPluginPath(pluginName);
        await refreshPlugins();
      }
    } catch (err) {
      console.error('Failed to uninstall plugin:', err);
      throw err;
    }
  };

  /**
   * 自动加载已保存的插件
   */
  const restorePlugins = async (): Promise<void> => {
    const savedPlugins = settingsStore.loadedPlugins;
    const devPlugins = settingsStore.devPluginPaths;

    if (savedPlugins.length === 0 && Object.keys(devPlugins).length === 0) {
      return;
    }

    console.log('Restoring plugins:', { savedPlugins, devPlugins });

    // 恢复开发模式插件
    for (const [pluginName, localPath] of Object.entries(devPlugins)) {
      try {
        if (pluginLoader && !pluginLoader.isPluginLoaded(pluginName)) {
          await pluginLoader.loadPluginDev(localPath);
          console.log(`Dev plugin "${pluginName}" restored from ${localPath}`);
        }
      } catch (err) {
        console.error(`Failed to restore dev plugin "${pluginName}":`, err);
        settingsStore.removeDevPluginPath(pluginName);
      }
    }

    // 恢复普通插件
    for (const pluginConfig of savedPlugins) {
      const pluginName = pluginConfig.name;
      try {
        if (pluginLoader && !pluginLoader.isPluginLoaded(pluginName)) {
          await pluginLoader.loadPlugin(pluginName);
          console.log(`Plugin "${pluginName}" restored successfully`);
        }
      } catch (err) {
        console.error(`Failed to restore plugin "${pluginName}":`, err);

        settingsStore.removeLoadedPlugin(pluginName);
      }
    }

    await refreshPlugins();
  };

  /**
   * 执行命令
   */
  const executeCommand = async (commandName: string): Promise<void> => {
    try {
      if (pluginLoader) {
        const manager = pluginLoader.getPluginManager();
        await manager.executeCommand(commandName);
      }
    } catch (err) {
      console.error('Failed to execute command:', err);
      throw err;
    }
  };

  /**
   * 触发钩子
   */
  const triggerHook = async (hookName: string, data?: any): Promise<any[]> => {
    try {
      if (pluginLoader) {
        const manager = pluginLoader.getPluginManager();
        return await manager.triggerHook(hookName, data);
      }
      return [];
    } catch (err) {
      console.error(`Failed to trigger hook "${hookName}":`, err);
      return [];
    }
  };

  /**
   * 获取状态文本
   */
  const getStatusText = (status: PluginStatus): string => {
    const statusMap: Record<PluginStatus, string> = {
      unloaded: '未加载',
      loading: '加载中',
      loaded: '已加载',
      unloading: '卸载中',
      error: '错误'
    };
    return statusMap[status] || status;
  };

  /**
   * 获取状态颜色
   */
  const getStatusColor = (status: PluginStatus): string => {
    const colorMap: Record<PluginStatus, string> = {
      unloaded: '#999',
      loading: '#1890ff',
      loaded: '#52c41a',
      unloading: '#faad14',
      error: '#ff4d4f'
    };
    return colorMap[status] || '#999';
  };

  /**
   * 合并所有插件（已加载和可用）
   */
  const allPlugins = computed<PluginItem[]>(() => {
    const loadedNames = new Set(plugins.value.map(p => p.plugin.name));
    const available = availablePlugins.value.filter(p => !loadedNames.has(p.name));
    return [
      ...plugins.value.map(p => ({
        id: p.plugin.name,
        name: p.plugin.name,
        description: p.plugin.description || '',
        version: p.plugin.version || '1.0.0',
        status: p.status,
        type: 'loaded' as const,
        error: p.error,
        plugin: p.plugin,
        isDev: pluginLoader?.isDevMode(p.plugin.name) || false
      })),
      ...available.map(p => ({
        id: p.name,
        name: p.name,
        description: p.description || '',
        version: p.version || '1.0.0',
        status: 'unloaded' as PluginStatus,
        type: 'available' as const,
        path: p.path,
        error: undefined
      }))
    ];
  });

  /**
   * 当前选中的插件
   */
  const activePlugin = computed(() => {
    return allPlugins.value.find(p => p.id === activePluginId.value);
  });

  /**
   * 获取插件的命令列表
   */
  const getPluginCommands = (pluginName: string): any[] => {
    if (!pluginLoader) return [];
    return pluginLoader.getPluginManager().getAllCommands().filter((c: any) => c.pluginName === pluginName);
  };

  /**
   * 获取插件的钩子列表
   */
  const getPluginHooks = (pluginName: string): any[] => {
    if (!pluginLoader) return [];
    const allHooks = pluginLoader.getPluginManager().getAllHooks();
    const pluginHooks: any[] = [];

    for (const [hookName, hooks] of allHooks.entries()) {
      const filtered = hooks.filter((h: any) => h.pluginName === pluginName);
      if (filtered.length > 0) {
        pluginHooks.push({
          name: hookName,
          count: filtered.length
        });
      }
    }

    return pluginHooks;
  };

  /**
   * 获取插件的内置工具列表
   */
  const getPluginBuiltinTools = (pluginName: string): string[] => {
    if (!pluginLoader) return [];
    // 假设 PluginManager 有个方法可以按插件获取工具
    // 根据 PluginManager.ts, 有个 pluginBuiltinTools Map
    // 但是没有公开的 getter，我可能需要加一个或者通过 getBuiltinTools 过滤
    const manager = pluginLoader.getPluginManager();
    // 既然 pluginBuiltinTools 是私有的，我们可以通过查看哪些工具被这个插件注册了来获取
    // 或者我们直接在 PluginManager 中加一个方法
    // 暂时先通过 getBuiltinTools 过滤，但 builtinTools 没有存 pluginName
    // 让我们去 PluginManager.ts 增加一个方法
    return manager.getPluginBuiltinToolNames(pluginName);
  };

  /**
   * 获取插件的提供商列表
   */
  const getPluginProviders = (pluginName: string): any[] => {
    return settingsStore.registeredProviders.filter((p) => p.pluginName === pluginName);
  };

  /**
   * 选择插件
   */
  const selectPlugin = (pluginId: string): void => {
    activePluginId.value = pluginId;
  };

  /**
   * 切换插件通知状态
   */
  const togglePluginNotification = (pluginName: string, disabled: boolean) => {
    settingsStore.togglePluginNotification(pluginName, disabled);
  };

  /**
   * 检查插件通知是否禁用
   */
  const isPluginNotificationDisabled = (pluginName: string): boolean => {
    const plugin = settingsStore.loadedPlugins.find((p) => p.name === pluginName);
    return !!plugin?.notificationsDisabled;
  };

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
    getPluginProviders,
    selectPlugin,
    pluginLoader,
    triggerHook,
    togglePluginNotification,
    isPluginNotificationDisabled
  };
}
