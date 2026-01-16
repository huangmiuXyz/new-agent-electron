import type { App, defineComponent, VNode, Component } from 'vue'
import type { Pinia } from 'pinia'
import type { ZodObject } from 'zod'
import { Model, Tool, ModelCategory } from './ai'
import { RegisteredProvider } from './settings'

/**
 * 表单配置接口
 */
export interface BaseField<T> {
  name: string
  label?: string
  required?: boolean
  disabled?: boolean | ((data: T) => boolean)
  hint?: string
  size?: 'sm' | 'md' | 'lg'
  ifShow?: boolean | ((data: T) => boolean)
  defaultValue?: T // 字段的默认值应该是该字段数据的类型 T
  span?: number
}

export interface TextField<T> extends BaseField<T> {
  type?: 'text' | 'password' | 'email' | 'number'
  placeholder?: string
  readonly?: boolean
  rest?: () => VNode
}

export interface BooleanField<T> extends BaseField<T> {
  type?: 'boolean'
}

export interface SliderField<T> extends BaseField<T> {
  type?: 'slider'
  min?: number
  max?: number
  step?: number
  unit?: string
  unlimited?: boolean
}

export interface SelectField<T> extends BaseField<T> {
  type?: 'select'
  options: { label: string; value: string | number }[]
  placeholder?: string
  clearable?: boolean
}

export interface TextareaField<T> extends BaseField<T> {
  type?: 'textarea'
  placeholder?: string
  readonly?: boolean
  rows?: number
  autoResize?: boolean
}

export interface ArrayField<T> extends BaseField<T> {
  type?: 'array'
  placeholder?: string
}

export interface ObjectField<T> extends BaseField<T> {
  type?: 'object'
  keyPlaceholder?: string
  valuePlaceholder?: string
}

export interface CheckboxGroupField<T> extends BaseField<T> {
  type?: 'checkboxGroup'
  options: { label: string; value: string | number }[]
}

export interface ModelSelectorField<T> extends BaseField<T> {
  type?: 'modelSelector'
  placeholder?: string
  popupPosition?: 'bottom' | 'top'
  modelCategory?: ModelCategory
  multiple?: boolean
}

export interface ColorField<T> extends BaseField<T> {
  type?: 'color'
  placeholder?: string
  presetColors?: string[]
  showAlpha?: boolean
}

export interface PathSelectorField<T> extends BaseField<T> {
  type?: 'path'
  placeholder?: string
  readonly?: boolean
  dialogOptions?: {
    properties?: Array<'openFile' | 'openDirectory' | 'multiSelections' | 'showHiddenFiles'>
    filters?: Array<{ name: string; extensions: string[] }>
    title?: string
    defaultPath?: string
  }
}

export interface UploadField<T> extends BaseField<T> {
  type: 'upload'
  multiple?: boolean
  showUpload?: boolean
}

export interface CustomField<T> extends BaseField<T> {
  type: 'custom'
  render: (data: T) => VNode | null
}

export interface GroupField<T> extends BaseField<T> {
  type: 'group'
  children: FormField<T>[]
}

export interface ArrayGroupField<T> extends BaseField<T> {
  type: 'array-group'
  children: FormField<T>[]
  max?: number
}

export type FormField<T> =
  | TextField<T>
  | BooleanField<T>
  | SliderField<T>
  | SelectField<T>
  | TextareaField<T>
  | ArrayField<T>
  | ObjectField<T>
  | CheckboxGroupField<T>
  | ModelSelectorField<T>
  | ColorField<T>
  | PathSelectorField<T>
  | UploadField<T>
  | CustomField<T>
  | GroupField<T>
  | ArrayGroupField<T>

export interface FormConfig<T extends Record<string, string | number | boolean | object | null | undefined>> {
  title?: string
  showHeader?: boolean
  size?: 'sm' | 'md' | 'lg'
  fields?: FormField<T>[]
  schemas?: ZodObject<Record<string, import('zod').ZodType>>
  initialData?: T
  onSubmit?: (data: T) => void
  onReset?: () => void
  onChange?: (field: keyof T | undefined, value: T[keyof T] | undefined, data: T) => void
  filterDefaultValues?: boolean
}

export interface FormActions<T extends Record<string, string | number | boolean | object | null | undefined>> {
  getData: () => T
  setData: (data: T) => void
  reset: () => void
  submit: () => boolean
  validate: () => boolean
  setFieldValue: <K extends keyof T>(field: K, value: T[K]) => void
  setFieldsValue: (data: Partial<T>) => void
  getFieldValue: <K extends keyof T>(field: K) => T[K]
  updateFieldProps: (field: keyof T, props: Record<string, string | number | boolean | object | null | undefined>) => void
}

/**
 * 表格配置接口
 */
export interface TableColumn<T extends Record<string, string | number | boolean | object | null | undefined> = Record<string, string | number | boolean | object | null | undefined>> {
  key: string
  label: string
  width?: string | number
  align?: 'left' | 'center' | 'right'
  headerClass?: string
  renderType?: 'html'
  render?: (row: T, index: number) => VNode | string | number | null
}

export interface TableConfig<T extends Record<string, string | number | boolean | object | null | undefined>> {
  columns: TableColumn<T>[]
  data?: T[]
  loading?: boolean
  onRowClick?: (row: T) => void
  expandRender?: (row: T) => VNode | string | number | null
}

export interface TableActions<T extends Record<string, string | number | boolean | object | null | undefined>> {
  setData: (data: T[]) => void
  setLoading: (loading: boolean) => void
  setColumns: (columns: TableColumn<T>[]) => void
  getData: () => T[]
  getLoading: () => boolean
  toggleExpand: (id: string | number) => void
  isExpanded: (id: string | number) => boolean
}

/**
 * 下载配置接口
 */
export interface DownloadProgress {
  total: number
  downloaded: number
  percent: number
}

export interface UseDownloadOptions {
  url: string
  destPath: string
  id: string
  onSuccess?: () => void
  onError?: (error: string) => void
  onProgress?: (progress: DownloadProgress) => void
}

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
}

/**
 * Electron API 接口
 */
export interface ElectronAPI {
  pty: {
    spawn: (options: {
      id: string
      cols?: number
      rows?: number
      cwd?: string
      startupLocation?: string
      customLocationPath?: string
    }) => Promise<string>
    write: (id: string, data: string) => Promise<void>
    resize: (id: string, cols: number, rows: number) => Promise<void>
    kill: (id: string) => Promise<void>
    onData: (id: string, callback: (data: string) => void) => () => void
    onExit: (id: string, callback: (info: { exitCode: number; signal?: number }) => void) => () => void
  }
  showOpenDialog: (options: {
    title?: string
    defaultPath?: string
    buttonLabel?: string
    filters?: { name: string; extensions: string[] }[]
    properties?: Array<'openFile' | 'openDirectory' | 'multiSelections' | 'showHiddenFiles' | 'createDirectory' | 'promptToCreate' | 'noResolveAliases' | 'treatPackageAsDirectory' | 'dontAddToRecent'>
    message?: string
    securityScopedBookmarks?: boolean
  }) => Promise<{ canceled: boolean; filePaths: string[]; bookmarks?: string[] }>
  app: {
    isPackaged: boolean
    getPath: (name: string) => string
    getAppPath: () => string
  }
  shell: {
    openExternal: (url: string) => Promise<void>
    openPath: (path: string) => Promise<string>
    showItemInFolder: (path: string) => void
  }
  fs: typeof import('fs')
  path: typeof import('path')
  net: {
    fetch: (url: string, options?: RequestInit) => Promise<Response>
    download: (options: { url: string; destPath: string; id?: string; offset?: number }) => Promise<string>
    onDownloadProgress: (id: string, callback: (progress: { total: number; downloaded: number; percent: number }) => void) => () => void
    cancelDownload: (id: string) => Promise<void>
  }
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
  /** 插件根路径 */
  basePath: string;
  /** 注册命令 */
  registerCommand: (name: string, handler: (...args: any[]) => void | Promise<void>) => void;
  /** 注册钩子 */
  registerHook: (name: string, handler: (...args: any[]) => void | Promise<void>) => void;
  /** 索引数据库存储 */
  localforage: {
    getItem: <T>(key: string) => Promise<T | null>;
    setItem: <T>(key: string, value: T) => Promise<T>;
    removeItem: (key: string) => Promise<void>;
  }
  /** 获取 store */
  getStore: <T>(storeName: string) => Promise<T>;
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
  registerProvider: (
    providerId: string,
    options?: { name?: string; form?: FormConfig<Record<string, string | number | boolean | object | null | undefined>>; models?: Model[] }
  ) => void;
  /** 注销提供商 */
  unregisterProvider: (providerId: string) => void;
  /** 注册提供商工厂到全局注册表 */
  registerRegistry: (name: string, factory: (options: { apiKey: string; baseURL: string; name: string }) => Record<string, string | number | boolean | object | null | undefined>) => void;
  /** 获取 useForm 工具 */
  useForm: <T extends Record<string, string | number | boolean | object | null | undefined>>(config: FormConfig<T>) => [ReturnType<typeof defineComponent>, FormActions<T>];
  useTable: <T extends Record<string, string | number | boolean | object | null | undefined>>(config: TableConfig<T>) => [ReturnType<typeof defineComponent>, TableActions<T>];
  useDownload: () => {
    isDownloading: { value: boolean };
    isPaused: { value: boolean };
    progress: { value: DownloadProgress | null };
    startDownload: (options: UseDownloadOptions) => Promise<void>;
    pauseDownload: (id: string) => Promise<void>;
    cancelDownload: (id: string) => Promise<void>;
  };
  useIcon: (name: string) => Component | VNode | null;
  components: Record<string, Component>;
  vue: typeof import('vue');
  getPluginsDataPath: () => string;
  /** 获取当前插件已注册 of 提供商 */
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
}

/**
 * 命令定义
 */
export interface Command {
  /** 命令名称 */
  name: string;
  /** 命令处理器 */
  handler: (...args: any[]) => void | Promise<void>;
  /** 命令所属插件 */
  pluginName: string;
}

/**
 * 钩子定义
 */
export interface Hook {
  /** 钩子名称 */
  name: string;
  /** 钩子处理器 */
  handler: (...args: any[]) => void | Promise<void>;
  /** 钩子所属插件 */
  pluginName: string;
}
