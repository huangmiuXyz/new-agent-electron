import { PluginManager } from './pluginManager';
import JSZip from 'jszip';

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
      const module = await import(/* @vite-ignore */ `data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

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
   * 卸载插件（仅从内存中移除）
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
   * 完全卸载插件（从内存和文件系统中移除）
   * @param pluginName 插件名称
   * @returns 是否成功卸载
   */
  async uninstallPlugin(pluginName: string): Promise<boolean> {
    const fs = window.api.fs;
    const path = window.api.path;

    if (!fs || !path) {
      throw new Error('File system API not available');
    }

    try {
      // 先从内存中卸载插件
      await this.unloadPlugin(pluginName);

      // 获取插件目录路径
      const pluginsDir = window.api.getPluginsPath();
      const pluginDir = path.join(pluginsDir, pluginName);

      // 检查插件目录是否存在
      if (fs.existsSync(pluginDir)) {
        // 删除插件目录及其所有内容
        fs.rmSync(pluginDir, { recursive: true, force: true });
      }

      return true;
    } catch (error) {
      throw new Error(`Failed to uninstall plugin "${pluginName}": ${error instanceof Error ? error.message : String(error)}`);
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

  /**
   * 刷新插件列表
   * @returns 包含已加载和可用插件的对象
   */
  async refreshPlugins(): Promise<{ loaded: PluginInfo[]; available: PluginInfoData[] }> {
    const loaded = this.getLoadedPlugins();
    const available = await this.getAvailablePlugins();
    return { loaded, available };
  }

  /**
   * 安装插件
   * @param zipFilePath 插件文件路径
   * @returns 安装结果
   */
  async installPlugin(zipFilePath: string): Promise<void> {
    const fs = window.api.fs;
    const path = window.api.path;

    if (!fs || !path) {
      throw new Error('File system API not available');
    }

    // 读取zip文件
    const zipData = fs.readFileSync(zipFilePath);
    const zip = await JSZip.loadAsync(zipData);

    // 检查是否包含info.json
    const infoFile = zip.file('info.json');
    if (!infoFile) {
      throw new Error('插件文件必须包含info.json');
    }

    // 读取info.json获取插件名称
    const infoContent = await infoFile.async('string');
    const info: PluginInfoData = JSON.parse(infoContent);

    if (!info.name) {
      throw new Error('info.json必须包含name字段');
    }

    // 检查是否包含index.js
    const indexFile = zip.file('index.js');
    if (!indexFile) {
      throw new Error('插件文件必须包含index.js');
    }

    // 获取插件目录路径
    const pluginsDir = window.api.getPluginsPath();
    const pluginDir = path.join(pluginsDir, info.name);

    // 如果插件已存在，提示覆盖
    if (fs.existsSync(pluginDir)) {
      const shouldOverwrite = confirm(`插件 "${info.name}" 已存在，是否覆盖？`);
      if (!shouldOverwrite) {
        return;
      }
      // 删除现有插件目录
      fs.rmSync(pluginDir, { recursive: true, force: true });
    }

    // 创建插件目录
    fs.mkdirSync(pluginDir, { recursive: true });

    // 解压文件
    const files = Object.keys(zip.files);
    for (const filename of files) {
      const zipEntry = zip.files[filename];
      if (!zipEntry.dir) {
        const content = await zipEntry.async('arraybuffer');
        const outputPath = path.join(pluginDir, filename);
        fs.writeFileSync(outputPath, Buffer.from(content));
      }
    }
  }

  /**
   * 获取可用插件列表（从文件系统读取）
   * @returns 可用插件数组
   */
  async getAvailablePlugins(): Promise<PluginInfoData[]> {
    try {
      const fs = window.api.fs;
      const path = window.api.path;

      if (!fs || !path) {
        throw new Error('File system API not available');
      }

      // 获取插件目录路径（从userData读取）
      const pluginsDir = window.api.getPluginsPath();

      // 确保插件目录存在
      if (!fs.existsSync(pluginsDir)) {
        fs.mkdirSync(pluginsDir, { recursive: true });
        return [];
      }

      // 读取目录内容
      const files = fs.readdirSync(pluginsDir);

      // 过滤出目录
      const pluginDirs = files.filter((file: string) => {
        const filePath = path.join(pluginsDir, file);
        return fs.statSync(filePath).isDirectory();
      });

      // 生成插件列表
      const pluginList: PluginInfoData[] = [];
      for (const dir of pluginDirs) {
        const infoPath = path.join(pluginsDir, dir, 'info.json');
        if (fs.existsSync(infoPath)) {
          try {
            const infoContent = fs.readFileSync(infoPath, 'utf-8');
            const info: PluginInfoData = JSON.parse(infoContent);
            pluginList.push({
              ...info,
              name: info.name || dir,
              path: dir,
              description: info.description || `${dir} 插件`,
              version: info.version || '1.0.0',
              author: info.author
            });
          } catch (err) {
            console.error(`Failed to read info.json for plugin ${dir}:`, err);
          }
        }
      }

      return pluginList;
    } catch (err) {
      console.error('Failed to fetch available plugins:', err);
      return [];
    }
  }
}
