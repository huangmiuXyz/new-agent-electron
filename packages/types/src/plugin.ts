import { App, Ref, VNode, Component } from 'vue';
import { Pinia } from 'pinia';
import { Router } from 'vue-router';
import { Model, Tool } from './ai';
import { FormActions, FormConfig, TableActions, TableConfig, DownloadProgress, FormField, TableColumn, NotificationApi, ModalActions, TerminalActions } from './components';
import { RegisteredProvider } from './settings';
import { ElectronAPI } from './electron';

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
  /** 更新时间 */
  updatedAt?: string;
  /** 插件安装函数，在插件加载时调用 */
  install: (context: PluginContext) => void | Promise<void>;
  /** 插件卸载函数，在插件卸载时调用 */
  uninstall?: (context: PluginContext) => void | Promise<void>;
  /** README 内容 */
  readme?: string;
}

/**
 * 插件上下文
 * 提供给插件的应用上下文 and API
 */
export interface PluginContext {
  /** 应用实例 */
  app: App;
  /** Electron API */
  api: ElectronAPI;
  /** Pinia 实例 */
  pinia: Pinia;
  /** 路由实例 */
  router: Router;
  /** 插件根路径 */
  basePath: string;
  /** 注册命令 */
  registerCommand: (name: string, handler: (...args: unknown[]) => unknown) => void;
  /** 注册钩子 */
  registerHook: (name: string, handler: (...args: unknown[]) => unknown) => void;
  /** 索引数据库存储 */
  localforage: {
    getItem: <T = unknown>(key: string) => Promise<T | null>;
    setItem: <T = unknown>(key: string, value: T) => Promise<void>;
    removeItem: (key: string) => Promise<void>;
  }
  /** 获取 store */
  getStore: <T = unknown>(storeName: string) => Promise<T>;
  /** 通知接口 */
  notification: NotificationApi;
  /** 注册内置工具 */
  registerBuiltinTool: (name: string, tool: Tool) => void;
  /** 注销内置工具 */
  unregisterBuiltinTool: (name: string) => boolean;
  /** 注册提供商到当前插件 */
  registerProvider: (
    providerId: string,
    options?: { name?: string; providerType?: string; form?: Record<string, unknown>; models?: Model[]; hide?: boolean }
  ) => void;
  /** 注销提供商 */
  unregisterProvider: (providerId: string) => void;
  /** 注册提供商工厂到全局注册表 */
  registerRegistry: <T = unknown>(name: string, factory: (options: Record<string, unknown>) => T, options?: { hide?: boolean }) => void;
  /** 注销提供商工厂 */
  unregisterRegistry: (name: string) => void;
  /** 获取 useForm 工具 */
  useForm: <T extends Record<string, unknown> = Record<string, unknown>>(options: FormConfig<T>) => [Component, FormActions<T>];
  /** 获取 useTable 工具 */
  useTable: <T extends Record<string, unknown> = Record<string, unknown>>(config: TableConfig<T>) => [Component, TableActions<T>];
  /** 获取 useDownload 工具 */
  useDownload: () => {
    isDownloading: Ref<boolean>;
    isPaused: Ref<boolean>;
    progress: Ref<DownloadProgress | null>;
    startDownload: (options: {
      url: string
      destPath: string
      id: string
      onSuccess?: () => void
      onError?: (error: string) => void
      onProgress?: (progress: DownloadProgress) => void
    }) => Promise<void>;
    pauseDownload: (id: string) => Promise<void>;
    cancelDownload: (id: string) => Promise<void>;
  };
  /** 获取 useIcon 工具 */
  useIcon: (iconName: string) => Component;
  /** 获取 useModal 工具 */
  useModal: () => ModalActions;
  /** 获取 useTerminal 工具 */
  useTerminal: () => TerminalActions;
  components: Record<string, Component>;
  vue: {
    ref: typeof import('vue').ref;
    reactive: typeof import('vue').reactive;
    computed: typeof import('vue').computed;
    watch: typeof import('vue').watch;
    onMounted: typeof import('vue').onMounted;
    onUnmounted: typeof import('vue').onUnmounted;
    nextTick: typeof import('vue').nextTick;
    markRaw: typeof import('vue').markRaw;
    h: typeof import('vue').h;
    defineComponent: typeof import('vue').defineComponent;
    toRaw: typeof import('vue').toRaw;
    toRef: typeof import('vue').toRef;
    toRefs: typeof import('vue').toRefs;
    isRef: typeof import('vue').isRef;
    isReactive: typeof import('vue').isReactive;
  };
  getPluginsDataPath: () => string;
  /** 获取当前插件已注册的提供商 */
  getRegisteredProviders: () => RegisteredProvider[];
}

/**
 * 插件上下文创建选项
 */
export interface PluginContextOptions {
  /** 注册内置工具的方法 */
  registerBuiltinTools?: (register: (name: string, tool: Tool) => void) => void;
}

/**
 * 插件状态
 */
export enum PluginStatus {
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
export interface PluginInfo {
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
export interface PluginInfoData {
  /** 插件名称 */
  name: string;
  /** 插件路径 */
  path?: string;
  /** 插件描述 */
  description?: string;
  /** 插件版本 */
  version?: string;
  /** 更新时间 */
  updatedAt?: string;
  /** 插件作者 */
  author?: string;
  /** 主入口文件 */
  main?: string;
  /** README 内容 */
  readme?: string;
  /** 其他属性 */
  [key: string]: string | number | boolean | undefined | null | unknown[];
}

export interface PluginItem {
  id: string;
  name: string;
  description: string;
  version: string;
  status: PluginStatus;
  type: 'loaded' | 'available';
  isDev?: boolean;
  error?: string;
  path?: string;
  updatedAt?: string;
  plugin?: Plugin;
  readme?: string;
}

export interface Command {
  /** 命令名称 */
  name: string;
  /** 命令处理器 */
  handler: (...args: unknown[]) => unknown;
  /** 命令所属插件 */
  pluginName: string;
}

export interface Hook {
  /** 钩子名称 */
  name: string;
  /** 钩子处理器 */
  handler: (...args: unknown[]) => unknown;
  /** 钩子所属插件 */
  pluginName: string;
}

declare global {
  interface Plugin extends _Plugin { }
  interface PluginContext extends _PluginContext { }
  interface PluginContextOptions extends _PluginContextOptions { }
  type PluginStatus = _PluginStatus
  interface PluginInfo extends _PluginInfo { }
  interface PluginInfoData extends _PluginInfoData { }
  interface PluginItem extends _PluginItem { }
  interface Command extends _Command { }
  interface Hook extends _Hook { }
}

type _Plugin = Plugin
type _PluginContext = PluginContext
type _PluginContextOptions = PluginContextOptions
type _PluginStatus = PluginStatus
const _PluginStatus = PluginStatus
type _PluginInfo = PluginInfo
type _PluginInfoData = PluginInfoData
type _PluginItem = PluginItem
type _Command = Command
type _Hook = Hook
