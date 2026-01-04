/**
 * 插件接口定义
 * 所有插件必须实现此接口
 */
export interface Plugin {
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
export interface PluginContext {
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
      render?: any;
      color?: string;
      tooltip?: string;
      pluginName?: string;
    }) => void;
    removeStatus: (id: string) => void;
  };
  localforage: {
    getItem: (key: string) => Promise<any>;
    setItem: (key: string, value: any) => Promise<void>;
    removeItem: (key: string) => Promise<void>;
  }
  /** 注册内置工具 */
  registerBuiltinTool: (name: string, tool: any) => void;
  /** 注销内置工具 */
  unregisterBuiltinTool: (name: string) => boolean;
  /** 注册提供商到当前插件 */
  registerProvider: (providerId: string, options?: {
    name?: string;
    form?: any;
    models?: any[];
  }) => void;
  /** 获取 useForm 工具 */
  useForm: any;
  useTable: any
  vue: any
  components: {
    Button: any
    Switch: any
  }
  /** 从当前插件注销提供商 */
  unregisterProvider: (providerId: string) => void;
  /** 获取当前插件已注册的提供商 */
  getRegisteredProviders: () => any[];
}
