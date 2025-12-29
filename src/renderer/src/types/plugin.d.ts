declare global {
  /**
   * 插件接口定义
   * 所有插件必须实现此接口
   */
  interface Plugin {
    /** 插件名称，必须唯一 */
    name: string;
    /** 插件版本 */
    version?: string;
    /** 插件描述 */
    description?: string;
    /** 插件安装函数，在插件加载时调用 */
    install: (context: PluginContext) => void | Promise<void>;
    /** 插件卸载函数，在插件卸载时调用 */
    uninstall?: (context: PluginContext) => void | Promise<void>;
  }

  /**
   * 插件上下文
   * 提供给插件的应用上下文和 API
   */
  interface PluginContext {
    /** 应用实例 */
    app: any;
    /** Pinia 实例 */
    pinia: any;
    /** 注册命令 */
    registerCommand: (name: string, handler: Function) => void;
    /** 注册钩子 */
    registerHook: (name: string, handler: Function) => void;
    /** 获取 store */
    getStore: (storeName: string) => Promise<any>;
  }

  /**
   * 插件状态
   */
  enum PluginStatus {
    /** 未加载 */
    Unloaded = 'unloaded',
    /** 加载中 */
    Loading = 'loading',
    /** 已加载 */
    Loaded = 'loaded',
    /** 卸载中 */
    Unloading = 'unloading',
    /** 错误 */
    Error = 'error',
  }

  /**
   * 插件信息
   */
  interface PluginInfo {
    /** 插件实例 */
    plugin: Plugin;
    /** 插件状态 */
    status: PluginStatus;
    /** 加载时间 */
    loadTime?: number;
    /** 错误信息 */
    error?: string;
  }

  /**
   * 命令定义
   */
  interface Command {
    /** 命令名称 */
    name: string;
    /** 命令处理器 */
    handler: Function;
    /** 命令所属插件 */
    pluginName: string;
  }

  /**
   * 钩子定义
   */
  interface Hook {
    /** 钩子名称 */
    name: string;
    /** 钩子处理器 */
    handler: Function;
    /** 钩子所属插件 */
    pluginName: string;
  }
}
export { }
