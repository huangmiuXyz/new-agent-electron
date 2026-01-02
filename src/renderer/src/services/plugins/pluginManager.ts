import { useForm } from '@renderer/composables/useForm';
import localforage from 'localforage'
/**
 * 插件管理器
 * 负责维护插件注册表、命令系统和钩子系统
 */
export class PluginManager {
  private app: any;
  private pinia: any;
  private plugins: Map<string, Plugin> = new Map();
  private commands: Map<string, Command> = new Map();
  private hooks: Map<string, Hook[]> = new Map();
  private builtinTools: Map<string, any> = new Map();
  /** 跟踪每个插件注册的内置工具名称 */
  private pluginBuiltinTools: Map<string, Set<string>> = new Map();

  constructor(app: any, pinia?: any) {
    this.app = app;
    this.pinia = pinia;
  }

  /**
   * 注册插件
   * @param plugin 插件实例
   */
  registerPlugin(plugin: Plugin): void {
    this.plugins.set(plugin.name, plugin);
  }

  /**
   * 注销插件
   * @param pluginName 插件名称
   */
  unregisterPlugin(pluginName: string): void {

    this.plugins.delete(pluginName);


    for (const [commandName, command] of this.commands.entries()) {
      if (command.pluginName === pluginName) {
        this.commands.delete(commandName);
      }
    }


    for (const [hookName, hooks] of this.hooks.entries()) {
      const filteredHooks = hooks.filter(hook => hook.pluginName !== pluginName);
      if (filteredHooks.length === 0) {
        this.hooks.delete(hookName);
      } else {
        this.hooks.set(hookName, filteredHooks);
      }
    }


    const toolNames = this.pluginBuiltinTools.get(pluginName);
    if (toolNames) {
      for (const toolName of toolNames) {
        this.builtinTools.delete(toolName);
      }
      this.pluginBuiltinTools.delete(pluginName);
    }

    // 注销该插件注册的所有提供商
    const settingsStore = useSettingsStore(this.pinia);
    const registeredProviders = settingsStore.registeredProviders.filter(
      (p) => p.pluginName === pluginName
    );

    for (const provider of registeredProviders) {
      const providerId = provider.providerId;
      settingsStore.removeRegisteredProvider(provider.id);

      // 同时从主提供商列表中移除（如果该提供商是由插件注册的）
      const providerIndex = settingsStore.providers.findIndex((p) => p.id === providerId);
      if (providerIndex !== -1) {
        // 检查是否有其他插件也注册了这个提供商
        const otherPluginRegistered = settingsStore.registeredProviders.some(
          (p) => p.providerId === providerId && p.pluginName !== pluginName
        );
        if (!otherPluginRegistered) {
          settingsStore.providers.splice(providerIndex, 1);

          // 清理默认模型设置
          const dm = settingsStore.defaultModels;
          if (dm.speechProviderId === providerId) {
            settingsStore.updateDefaultModels({ speechProviderId: '', speechModelId: '' });
          }
          if (dm.titleGenerationProviderId === providerId) {
            settingsStore.updateDefaultModels({
              titleGenerationProviderId: '',
              titleGenerationModelId: ''
            });
          }
          if (dm.translationProviderId === providerId) {
            settingsStore.updateDefaultModels({
              translationProviderId: '',
              translationModelId: ''
            });
          }
          if (dm.searchProviderId === providerId) {
            settingsStore.updateDefaultModels({
              searchProviderId: '',
              searchModelId: ''
            });
          }

          // 如果是当前选中的提供商，切换
          if (settingsStore.selectedProviderId === providerId) {
            if (settingsStore.providers.length > 0) {
              settingsStore.selectedProviderId = settingsStore.providers[0].id;
              if (settingsStore.providers[0].models?.length > 0) {
                settingsStore.selectedModelId = settingsStore.providers[0].models[0].id;
              }
            }
          }
        }
      }
    }
  }

  /**
   * 创建插件上下文
   * @param pluginName 插件名称
   * @param basePath 插件根路径
   * @returns 插件上下文
   */
  createContext(pluginName: string, basePath: string): PluginContext {
    return {
      app: this.app,
      api: window.api,
      pinia: this.pinia,
      basePath,
      useForm,
      registerCommand: (name: string, handler: Function) => {
        this.registerCommand(pluginName, name, handler);
      },
      localforage: localforage.createInstance({
        name: pluginName
      }),
      registerHook: (name: string, handler: Function) => {
        this.registerHook(pluginName, name, handler);
      },
      getStore: async (storeName: string) => {
        return await this.getStore(storeName);
      },
      notification: {
        info: (content: string, title?: string, duration?: number) => {
          const settingsStore = useSettingsStore(this.pinia);
          const pluginConfig = settingsStore.loadedPlugins.find(p => p.name === pluginName);
          if (pluginConfig?.notificationsDisabled) return () => { };
          return notificationApi.info(content, title, duration);
        },
        success: (content: string, title?: string, duration?: number) => {
          const settingsStore = useSettingsStore(this.pinia);
          const pluginConfig = settingsStore.loadedPlugins.find(p => p.name === pluginName);
          if (pluginConfig?.notificationsDisabled) return () => { };
          return notificationApi.success(content, title, duration);
        },
        error: (content: string, title?: string, duration?: number) => {
          const settingsStore = useSettingsStore(this.pinia);
          const pluginConfig = settingsStore.loadedPlugins.find(p => p.name === pluginName);
          if (pluginConfig?.notificationsDisabled) return () => { };
          return notificationApi.error(content, title, duration);
        },
        warning: (content: string, title?: string, duration?: number) => {
          const settingsStore = useSettingsStore(this.pinia);
          const pluginConfig = settingsStore.loadedPlugins.find(p => p.name === pluginName);
          if (pluginConfig?.notificationsDisabled) return () => { };
          return notificationApi.warning(content, title, duration);
        },
        loading: (content: string, title?: string, duration?: number) => {
          const settingsStore = useSettingsStore(this.pinia);
          const pluginConfig = settingsStore.loadedPlugins.find(p => p.name === pluginName);
          if (pluginConfig?.notificationsDisabled) return () => { };
          return notificationApi.loading(content, title, duration);
        },
        status: (id: string, text: string, options?: any) => {
          notificationApi.status(id, text, options);
        },
        removeStatus: (id: string) => {
          notificationApi.removeStatus(id);
        }
      },
      registerBuiltinTool: (name: string, tool: any) => {
        this.builtinTools.set(name, markRaw(tool));

        if (!this.pluginBuiltinTools.has(pluginName)) {
          this.pluginBuiltinTools.set(pluginName, new Set());
        }
        this.pluginBuiltinTools.get(pluginName)!.add(name);
      },
      unregisterBuiltinTool: (name: string) => {
        return this.unregisterBuiltinTool(pluginName, name);
      },
      /**
       * 注册提供商到当前插件
       */
      registerProvider: (
        providerId: string,
        options?: { name?: string; form?: any; models?: Model[] }
      ) => {
        const settingsStore = useSettingsStore(this.pinia);

        const exists = settingsStore.registeredProviders.find(
          (p) => p.providerId === providerId && p.pluginName === pluginName
        );

        const form = options?.form ? markRaw(options.form) : undefined;

        if (!exists) {
          settingsStore.addRegisteredProvider({
            id: providerId,
            name: options?.name || `${pluginName}`,
            providerId,
            pluginName,
            form,
            models: options?.models
          });
        } else {
          const index = settingsStore.registeredProviders.findIndex(
            (p) => p.providerId === providerId && p.pluginName === pluginName
          );
          if (index !== -1) {
            const updatedProviders = [...settingsStore.registeredProviders];
            updatedProviders[index] = {
              ...exists,
              form: form || exists.form,
              models: options?.models || exists.models,
              name: options?.name || exists.name
            };
            settingsStore.registeredProviders = updatedProviders;
          }
        }
      },
      unregisterProvider: (providerId: string) => {
        const settingsStore = useSettingsStore(this.pinia);
        const registered = settingsStore.registeredProviders.find(
          (p) => p.providerId === providerId && p.pluginName === pluginName
        );
        if (registered) {
          settingsStore.removeRegisteredProvider(registered.id);

          // 同时从主提供商列表中移除（如果该提供商是由插件注册的）
          const providerIndex = settingsStore.providers.findIndex((p) => p.id === providerId);
          if (providerIndex !== -1) {
            // 检查是否有其他插件也注册了这个提供商（理论上不应该，但为了安全）
            const otherPluginRegistered = settingsStore.registeredProviders.some(
              (p) => p.providerId === providerId && p.pluginName !== pluginName
            );
            if (!otherPluginRegistered) {
              settingsStore.providers.splice(providerIndex, 1);

              // 如果该提供商被设为默认模型，需要清理
              const dm = settingsStore.defaultModels;
              if (dm.speechProviderId === providerId) {
                settingsStore.updateDefaultModels({ speechProviderId: '', speechModelId: '' });
              }
              if (dm.titleGenerationProviderId === providerId) {
                settingsStore.updateDefaultModels({
                  titleGenerationProviderId: '',
                  titleGenerationModelId: ''
                });
              }
              if (dm.translationProviderId === providerId) {
                settingsStore.updateDefaultModels({
                  translationProviderId: '',
                  translationModelId: ''
                });
              }
              if (dm.searchProviderId === providerId) {
                settingsStore.updateDefaultModels({
                  searchProviderId: '',
                  searchModelId: ''
                });
              }

              // 如果是当前选中的提供商，切换到第一个
              if (settingsStore.selectedProviderId === providerId) {
                if (settingsStore.providers.length > 0) {
                  settingsStore.selectedProviderId = settingsStore.providers[0].id;
                  if (settingsStore.providers[0].models?.length > 0) {
                    settingsStore.selectedModelId = settingsStore.providers[0].models[0].id;
                  }
                }
              }
            }
          }
        }
      },
      /**
       * 获取当前插件已注册的提供商
       */
      getRegisteredProviders: () => {
        const settingsStore = useSettingsStore(this.pinia);
        return settingsStore.registeredProviders.filter((p) => p.pluginName === pluginName);
      }
    };
  }

  /**
   * 获取 store
   * @param storeName store 名称
   * @returns store 实例
   */
  async getStore(storeName: string): Promise<any> {
    if (!this.pinia) {
      throw new Error('Pinia instance not available');
    }


    const storeMap: Record<string, () => Promise<any>> = {
      notes: async () => {
        return useNotesStore(this.pinia);
      },
      chats: async () => {
        return useChatsStores(this.pinia);
      },
      settings: async () => {
        return useSettingsStore(this.pinia);
      },
      knowledge: async () => {
        return useKnowledgeStore(this.pinia);
      },
      agent: async () => {
        return useAgentStore(this.pinia);
      },
    };

    const storeGetter = storeMap[storeName];
    if (!storeGetter) {
      throw new Error(`Store "${storeName}" not found`);
    }

    return await storeGetter();
  }

  /**
   * 注册命令
   * @param pluginName 插件名称
   * @param name 命令名称
   * @param handler 命令处理器
   */
  registerCommand(pluginName: string, name: string, handler: Function): void {

    if (this.commands.has(name)) {
      throw new Error(`Command "${name}" is already registered`);
    }

    const command: Command = {
      name,
      handler,
      pluginName,
    };

    this.commands.set(name, command);
  }

  /**
   * 注销命令
   * @param name 命令名称
   * @returns 是否成功注销
   */
  unregisterCommand(name: string): boolean {
    return this.commands.delete(name);
  }

  /**
   * 执行命令
   * @param name 命令名称
   * @param args 命令参数
   * @returns 命令执行结果
   */
  async executeCommand(name: string, ...args: any[]): Promise<any> {
    const command = this.commands.get(name);

    if (!command) {
      throw new Error(`Command "${name}" not found`);
    }

    try {
      const result = await command.handler(...args);
      return result;
    } catch (error) {
      throw new Error(`Failed to execute command "${name}": ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 获取命令
   * @param name 命令名称
   * @returns 命令定义
   */
  getCommand(name: string): Command | undefined {
    return this.commands.get(name);
  }

  /**
   * 获取所有命令
   * @returns 命令数组
   */
  getAllCommands(): Command[] {
    return Array.from(this.commands.values());
  }

  /**
   * 检查命令是否存在
   * @param name 命令名称
   * @returns 是否存在
   */
  hasCommand(name: string): boolean {
    return this.commands.has(name);
  }

  /**
   * 注册钩子
   * @param pluginName 插件名称
   * @param name 钩子名称
   * @param handler 钩子处理器
   */
  registerHook(pluginName: string, name: string, handler: Function): void {
    const hook: Hook = {
      name,
      handler,
      pluginName,
    };

    if (!this.hooks.has(name)) {
      this.hooks.set(name, []);
    }

    this.hooks.get(name)!.push(hook);
  }

  /**
   * 注销钩子
   * @param name 钩子名称
   * @param handler 钩子处理器（可选，如果不提供则移除所有同名钩子）
   * @returns 是否成功注销
   */
  unregisterHook(name: string, handler?: Function): boolean {
    if (!this.hooks.has(name)) {
      return false;
    }

    if (!handler) {

      return this.hooks.delete(name);
    }


    const hooks = this.hooks.get(name)!;
    const filteredHooks = hooks.filter(hook => hook.handler !== handler);

    if (filteredHooks.length === 0) {
      return this.hooks.delete(name);
    }

    this.hooks.set(name, filteredHooks);
    return true;
  }

  /**
   * 触发钩子
   * @param name 钩子名称
   * @param data 钩子数据
   * @returns 钩子执行结果数组
   */
  async triggerHook(name: string, data?: any): Promise<any[]> {
    const hooks = this.hooks.get(name);

    if (!hooks || hooks.length === 0) {
      return [];
    }

    const results: any[] = [];

    for (const hook of hooks) {
      try {
        const result = await hook.handler(data);
        results.push(result);
      } catch (error) {
        console.error(`Hook "${name}" failed:`, error);
        results.push(null);
      }
    }

    return results;
  }

  /**
   * 获取钩子
   * @param name 钩子名称
   * @returns 钩子数组
   */
  getHooks(name: string): Hook[] {
    return this.hooks.get(name) || [];
  }

  /**
   * 获取所有钩子
   * @returns 钩子映射
   */
  getAllHooks(): Map<string, Hook[]> {
    return new Map(this.hooks);
  }

  /**
   * 检查钩子是否存在
   * @param name 钩子名称
   * @returns 是否存在
   */
  hasHook(name: string): boolean {
    return this.hooks.has(name) && this.hooks.get(name)!.length > 0;
  }

  /**
   * 获取插件
   * @param pluginName 插件名称
   * @returns 插件实例
   */
  getPlugin(pluginName: string): Plugin | undefined {
    return this.plugins.get(pluginName);
  }

  /**
   * 获取所有插件
   * @returns 插件数组
   */
  getAllPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * 检查插件是否已注册
   * @param pluginName 插件名称
   * @returns 是否已注册
   */
  hasPlugin(pluginName: string): boolean {
    return this.plugins.has(pluginName);
  }

  /**
   * 获取应用实例
   * @returns 应用实例
   */
  getApp(): any {
    return this.app;
  }

  /**
   * 获取所有内置工具
   * @returns 内置工具映射
   */
  getBuiltinTools(): Map<string, any> {
    return new Map(this.builtinTools);
  }

  /**
   * 注销内置工具
   * @param pluginName 插件名称
   * @param name 工具名称
   * @returns 是否成功注销
   */
  unregisterBuiltinTool(pluginName: string, name: string): boolean {

    const toolNames = this.pluginBuiltinTools.get(pluginName);
    if (!toolNames || !toolNames.has(name)) {
      return false;
    }


    const deleted = this.builtinTools.delete(name);


    if (deleted) {
      toolNames.delete(name);
      if (toolNames.size === 0) {
        this.pluginBuiltinTools.delete(pluginName);
      }
    }

    return deleted;
  }

  /**
   * 清空所有注册信息
   */
  clear(): void {
    this.plugins.clear();
    this.commands.clear();
    this.hooks.clear();
    this.builtinTools.clear();
    this.pluginBuiltinTools.clear();
  }
}

