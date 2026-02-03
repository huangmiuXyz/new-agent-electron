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
  api: {
    fs: any;
    path: any;
    os: any;
    exec: (command: string, callback: (error: Error | null, stdout: string, stderr: string) => void) => void;
  };
  pinia: any;
  vue: any;
  localforage: {
    getItem: (key: string) => Promise<any>;
    setItem: (key: string, value: any) => Promise<void>;
    removeItem: (key: string) => Promise<void>;
  };
  getPluginsDataPath: () => string;
  /** 注册内置工具 */
  registerBuiltinTool: (name: string, tool: any) => void;
  /** 注销内置工具 */
  unregisterBuiltinTool: (name: string) => boolean;
  /** 注册提供商工厂到全局注册表 */
  registerRegistry: (name: string, factory: (options: any) => any) => void;
  /** 注册提供商到当前插件 */
  registerProvider: (
    providerId: string,
    options?: { name?: string; providerType?: string; form?: any; models?: Model[] }
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
  category: 'text' | 'image' | 'speech' | 'tts';
  voices?: ModelVoice[];
  [key: string]: any;
}
