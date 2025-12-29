import { PluginManager } from './pluginManager';

/**
 * 插件加载器
 * 负责插件的动态加载、卸载和生命周期管理
 */
export class PluginLoader {
  private pluginManager: PluginManager;
  private loadedPlugins: Map<string, PluginInfo> = new Map();

  constructor(app: any, pinia?: any) {
    this.pluginManager = new PluginManager(app, pinia);
  }

  /**
   * 解析插件 URL
   * @param pluginName 插件名称（不包含扩展名）
   * @returns 插件文件的 URL（仅支持 file:// 协议）
   */
  private resolvePluginUrl(pluginName: string): string {
    const path = window.api.path;

    if (!path) {
      throw new Error('Path API not available');
    }

    const pluginFileName = `${pluginName}.js`;
    const pluginsPath = window.api.getPluginsPath();
    const pluginFullPath = path.join(pluginsPath, pluginFileName);

    return `file://${pluginFullPath}`;
  }

  /**
   * 动态加载插件
   * @param pluginName 插件名称（不包含扩展名）
   * @returns 插件信息
   */
  async loadPlugin(pluginName: string): Promise<PluginInfo> {
    try {
      // 解析插件 URL
      const pluginUrl = this.resolvePluginUrl(pluginName);

      // 使用 fetch 获取插件代码
      const response = await fetch(pluginUrl);

      if (!response.ok) {
        throw new Error(`Failed to fetch plugin: ${response.status} ${response.statusText}`);
      }

      const code = await response.text();

      // 使用动态导入执行插件代码（插件应为预编译的 JavaScript）
      const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

      // 获取插件实例（支持 default 导出和命名导出）
      const plugin: Plugin = module.default || module.plugin || module;

      // 验证插件接口
      if (!plugin.name || typeof plugin.install !== 'function') {
        throw new Error('Invalid plugin: must have name and install function');
      }

      // 检查插件是否已加载
      if (this.loadedPlugins.has(plugin.name)) {
        throw new Error(`Plugin "${plugin.name}" is already loaded`);
      }

      // 创建插件信息
      const pluginInfo: PluginInfo = {
        plugin,
        status: 'loading' as PluginStatus,
      };

      this.loadedPlugins.set(plugin.name, pluginInfo);

      try {
        // 调用插件的 install 方法
        const context = this.pluginManager.createContext(plugin.name);
        await plugin.install(context);

        // 更新插件状态
        pluginInfo.status = 'loaded' as PluginStatus;
        pluginInfo.loadTime = Date.now();

        // 注册到插件管理器
        this.pluginManager.registerPlugin(plugin);

        return pluginInfo;
      } catch (error) {
        // 安装失败，清理状态
        this.loadedPlugins.delete(plugin.name);
        pluginInfo.status = 'error' as PluginStatus;
        pluginInfo.error = error instanceof Error ? error.message : String(error);
        throw error;
      }
    } catch (error) {
      throw new Error(`Failed to load plugin "${pluginName}": ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 卸载插件
   * @param pluginName 插件名称
   * @returns 是否成功卸载
   */
  async unloadPlugin(pluginName: string): Promise<boolean> {
    const pluginInfo = this.loadedPlugins.get(pluginName);

    if (!pluginInfo) {
      throw new Error(`Plugin "${pluginName}" is not loaded`);
    }

    if (pluginInfo.status === 'unloading') {
      throw new Error(`Plugin "${pluginName}" is already being unloaded`);
    }

    try {
      // 更新状态为卸载中
      pluginInfo.status = 'unloading' as PluginStatus;

      // 调用插件的 uninstall 方法（如果存在）
      if (pluginInfo.plugin.uninstall) {
        const context = this.pluginManager.createContext(pluginName);
        await pluginInfo.plugin.uninstall(context);
      }

      // 从插件管理器中移除
      this.pluginManager.unregisterPlugin(pluginName);

      // 从已加载列表中移除
      this.loadedPlugins.delete(pluginName);

      return true;
    } catch (error) {
      pluginInfo.status = 'error' as PluginStatus;
      pluginInfo.error = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to unload plugin "${pluginName}": ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 获取已加载的插件列表
   * @returns 插件信息数组
   */
  getLoadedPlugins(): PluginInfo[] {
    return Array.from(this.loadedPlugins.values());
  }

  /**
   * 获取指定插件的信息
   * @param pluginName 插件名称
   * @returns 插件信息，如果不存在则返回 undefined
   */
  getPluginInfo(pluginName: string): PluginInfo | undefined {
    return this.loadedPlugins.get(pluginName);
  }

  /**
   * 检查插件是否已加载
   * @param pluginName 插件名称
   * @returns 是否已加载
   */
  isPluginLoaded(pluginName: string): boolean {
    return this.loadedPlugins.has(pluginName);
  }

  /**
   * 获取插件管理器实例
   * @returns 插件管理器
   */
  getPluginManager(): PluginManager {
    return this.pluginManager;
  }

  /**
   * 重新加载插件
   * @param pluginName 插件名称（不包含 .ts 扩展名）
   * @returns 插件信息
   */
  async reloadPlugin(pluginName: string): Promise<PluginInfo> {
    if (this.isPluginLoaded(pluginName)) {
      await this.unloadPlugin(pluginName);
    }
    return await this.loadPlugin(pluginName);
  }

  /**
   * 卸载所有插件
   * @returns 卸载的插件数量
   */
  async unloadAllPlugins(): Promise<number> {
    const pluginNames = Array.from(this.loadedPlugins.keys());
    let count = 0;

    for (const pluginName of pluginNames) {
      try {
        await this.unloadPlugin(pluginName);
        count++;
      } catch (error) {
        console.error(`Failed to unload plugin "${pluginName}":`, error);
      }
    }

    return count;
  }
}
