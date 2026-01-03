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
    /** Electron API */
    api: any;
    /** Pinia 实例 */
    pinia: any;
    /** 插件根路径 */
    basePath: string;
    /** 注册命令 */
    registerCommand: (name: string, handler: Function) => void;
    /** 注册钩子 */
    registerHook: (name: string, handler: Function) => void;
    /** 索引数据库存储 */
    localforage: {
      getItem: (key: string) => Promise<any>;
      setItem: (key: string, value: any) => Promise<void>;
      removeItem: (key: string) => Promise<void>;
    }
    /** 获取 store */
    getStore: (storeName: string) => Promise<any>;
    /** 通知接口 */
    notification: {
      info: (content: string, title?: string, duration?: number) => () => void;
      success: (content: string, title?: string, duration?: number) => () => void;
      error: (content: string, title?: string, duration?: number) => () => void;
      warning: (content: string, title?: string, duration?: number) => () => void;
      loading: (content: string, title?: string, duration?: number) => () => void;
      status: (id: string, text: string, options?: {
        icon?: string;
        html?: string;
        color?: string;
        tooltip?: string;
        pluginName?: string;
      }) => void;
      removeStatus: (id: string) => void;
    };
    /** 注册内置工具 */
    registerBuiltinTool: (name: string, tool: Tool) => void;
    /** 注销内置工具 */
    unregisterBuiltinTool: (name: string) => boolean;
    /** 注册提供商到当前插件 */
    registerProvider: (providerId: string, options?: {
      name?: string;
      form?: any;
      models?: Model[];
    }) => void;
    /** 获取 useForm 工具 */
    useForm: any;
    useTable: any;
    components: Record<string, any>;
    /** 从当前插件注销提供商 */
    unregisterProvider: (providerId: string) => void;
    /** 获取当前插件已注册的提供商 */
    getRegisteredProviders: () => any[];
  }

  /**
   * 插件上下文创建选项
   */
  interface PluginContextOptions {
    /** 注册内置工具的方法 */
    registerBuiltinTools?: (register: (name: string, tool: Tool) => void) => void;
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
   * 插件信息数据（从 info.json 读取）
   */
  interface PluginInfoData {
    /** 插件名称 */
    name: string;
    /** 插件路径 */
    path: string;
    /** 插件描述 */
    description?: string;
    /** 插件版本 */
    version?: string;
    /** 插件作者 */
    author?: string;
    /** 其他属性 */
    [key: string]: any;
  }

  interface PluginItem {
    id: string;
    name: string;
    description: string;
    version: string;
    status: PluginStatus;
    type: 'loaded' | 'available';
    isDev?: boolean;
    error?: string;
    path?: string;
    plugin?: any;
  }
  type PluginStatus = 'unloaded' | 'loading' | 'loaded' | 'unloading' | 'error';


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
