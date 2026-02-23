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
  components: any;
  basePath?: string;
  getPluginsDataPath: () => string;
  getStore: (name: string) => Promise<any>;
  notification: {
    status: (id: string, title: string, options: any) => void;
    removeStatus: (id: string) => void;
    error?: (content: string, title?: string, duration?: number) => void;
    success?: (content: string, title?: string, duration?: number) => void;
  };
  localforage: {
    getItem: (key: string) => Promise<any>;
    setItem: (key: string, value: any) => Promise<void>;
  };
  useForm: any;
  registerRegistry: (name: string, factory: any, options?: { hide?: boolean }) => void;
  unregisterRegistry?: (name: string) => void;
  registerProvider: (
    providerId: string,
    options?: {
      name?: string;
      providerType?: string;
      form?: any;
      models?: any[];
      hide?: boolean;
    }
  ) => void;
  unregisterProvider: (providerId: string) => void;
}
