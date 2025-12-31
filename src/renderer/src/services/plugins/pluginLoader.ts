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

    const pluginsPath = window.api.getPluginsPath();
    const pluginDir = path.join(pluginsPath, pluginName);


    const possiblePaths = [
      path.join(pluginDir, 'index.js'),
      path.join(pluginDir, 'dist', 'index.js'),
      path.join(pluginDir, 'build', 'index.js')
    ];

    const fs = window.api.fs;
    if (!fs) {
      throw new Error('File system API not available');
    }


    for (const entryPath of possiblePaths) {
      if (fs.existsSync(entryPath)) {
        return `file://${entryPath}`;
      }
    }


    throw new Error(
      `Plugin entry file not found. Tried: ${possiblePaths.join(', ')}`
    );
  }

  /**
   * 动态加载插件
   * @param pluginName 插件名称（不包含扩展名）
   * @returns 插件信息
   */
  async loadPlugin(pluginName: string): Promise<PluginInfo> {
    try {

      const pluginUrl = `${this.resolvePluginUrl(pluginName)}?t=${Date.now()}`;


      const response = await fetch(pluginUrl);

      if (!response.ok) {
        throw new Error(`Failed to fetch plugin: ${response.status} ${response.statusText}`);
      }
      const code = await response.text();
      const pluginGlobalName = 'plugin';
      const wrappedCode = `
          ${code}
          return ${pluginGlobalName};
        `;
      const getPlugin = new Function(wrappedCode);
      const plugin = getPlugin();


      if (!plugin || typeof plugin !== 'object') {
        throw new Error('Invalid plugin: plugin must be an object');
      }

      if (!plugin.name || typeof plugin.install !== 'function') {
        throw new Error('Invalid plugin: must have name and install function');
      }


      if (this.loadedPlugins.has(plugin.name)) {
        throw new Error(`Plugin "${plugin.name}" is already loaded`);
      }


      const pluginInfo: PluginInfo = {
        plugin,
        status: 'loading' as PluginStatus,
      };

      this.loadedPlugins.set(plugin.name, pluginInfo);

      try {

        const context = this.pluginManager.createContext(plugin.name);
        await plugin.install(context);


        pluginInfo.status = 'loaded' as PluginStatus;
        pluginInfo.loadTime = Date.now();


        this.pluginManager.registerPlugin(plugin);

        return pluginInfo;
      } catch (error) {

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

      pluginInfo.status = 'unloading' as PluginStatus;


      if (pluginInfo.plugin.uninstall) {
        const context = this.pluginManager.createContext(pluginName);
        await pluginInfo.plugin.uninstall(context);
      }


      this.pluginManager.unregisterPlugin(pluginName);


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

      await this.unloadPlugin(pluginName);


      const pluginsDir = window.api.getPluginsPath();
      const pluginDir = path.join(pluginsDir, pluginName);


      if (fs.existsSync(pluginDir)) {

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
   * 获取所有内置工具
   * @returns 内置工具映射
   */
  getBuiltinTools(): Map<string, any> {
    return this.pluginManager.getBuiltinTools();
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


    const zipData = fs.readFileSync(zipFilePath);
    const zip = await JSZip.loadAsync(zipData);


    const infoFile = zip.file('info.json');
    if (!infoFile) {
      throw new Error('插件文件必须包含info.json');
    }


    const infoContent = await infoFile.async('string');
    const info: PluginInfoData = JSON.parse(infoContent);

    if (!info.name) {
      throw new Error('info.json必须包含name字段');
    }


    const indexFile = zip.file('index.js');
    if (!indexFile) {
      throw new Error('插件文件必须包含index.js');
    }


    const pluginsDir = window.api.getPluginsPath();
    const pluginDir = path.join(pluginsDir, info.name);


    if (fs.existsSync(pluginDir)) {
      const shouldOverwrite = confirm(`插件 "${info.name}" 已存在，是否覆盖？`);
      if (!shouldOverwrite) {
        return;
      }

      fs.rmSync(pluginDir, { recursive: true, force: true });
    }


    fs.mkdirSync(pluginDir, { recursive: true });


    const files = Object.keys(zip.files);
    for (const filename of files) {
      const zipEntry = zip.files[filename];
      if (!zipEntry.dir) {
        const content = await zipEntry.async('uint8array');
        const outputPath = path.join(pluginDir, filename);
        fs.writeFileSync(outputPath, content);
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


      const pluginsDir = window.api.getPluginsPath();


      if (!fs.existsSync(pluginsDir)) {
        fs.mkdirSync(pluginsDir, { recursive: true });
        return [];
      }


      const files = fs.readdirSync(pluginsDir);


      const pluginDirs = files.filter((file: string) => {
        const filePath = path.join(pluginsDir, file);
        try {
          const stat = fs.statSync(filePath);
          return (stat.mode & 0o170000) === 0o040000;
        } catch {
          return false;
        }
      });


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
