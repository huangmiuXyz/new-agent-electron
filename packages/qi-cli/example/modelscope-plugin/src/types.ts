export interface Plugin {
  name: string;
  version?: string;
  description?: string;
  author?: string;
  install: (context: PluginContext) => void | Promise<void>;
  uninstall?: (context: PluginContext) => void | Promise<void>;
  updatedAt?: string;
}

export interface PluginContext {
  app: any;
  api: any;
  pinia: any;
  vue: any;
  getPluginsDataPath: () => string;
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
      command?: string;
    }) => void;
    removeStatus: (id: string) => void;
  };
  /** 使用表单 */
  useForm: (options: any) => any;
  /** 使用表格 */
  useTable: (options: any) => any;
  /** 使用下载 */
  useDownload: (options: any) => any;
  /** 使用图标 */
  useIcon: (name: string) => any;
  /** 使用对话框 */
  useModal: () => any;
  /** 本地存储 */
  localforage: any;
  /** 插件根路径 */
  basePath?: string;
  /** 注册内置工具 */
  registerBuiltinTool: (name: string, tool: any) => void;
  /** 注销内置工具 */
  unregisterBuiltinTool: (name: string) => boolean;
  /** 组件库 */
  components: Record<string, any>;
  /** 注册提供商工厂到全局注册表 */
  registerRegistry: (name: string, factory: any) => void;
  /** 注册提供商到当前插件 */
  registerProvider: (
    providerId: string,
    options?: { name?: string; form?: any; models?: any[] }
  ) => void;
  /** 注销提供商 */
  unregisterProvider: (providerId: string) => void;
}

export interface ModelVoice {
  id: string;
  name: string;
}

export interface Model {
  id: string;
  name: string;
  category: 'text' | 'image' | 'speech';
  voices?: ModelVoice[];
  [key: string]: any;
}
