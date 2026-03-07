import { VNode, Component, CSSProperties, Ref, MaybeRefOrGetter } from 'vue'
import * as zod from 'zod'
import { ModelCategory } from './ai'

import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'

export interface DownloadProgress {
  total: number;
  downloaded: number;
  percent: number;
}

export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'icon' | 'text'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
  danger?: boolean
  loading?: boolean
}

export interface BaseModalProps {
  title: string
  content?: string | VNode | Component | (() => VNode)
  resolve?: (value: string | boolean) => void
  remove?: () => void
  confirmProps?: ButtonProps
  width?: string
  onOk?: () => void | Promise<void>
  height?: string
  maxHeight?: string
  cancelText?: string
  showCancel?: boolean
  confirmText?: string
  onCancel?: () => void | Promise<void>
  onClose?: () => void
  variant?: 'center' | 'drawer'
  showFooter?: boolean
  modalBodyStyle?: CSSProperties
}

export interface ModalActions {
  confirm: (options: BaseModalProps) => Promise<string | boolean>
  remove: () => void
}

export interface BaseField<T> {
  name: string
  label?: string
  required?: boolean
  disabled?: boolean
  hint?: string
  size?: 'sm' | 'md' | 'lg'
  ifShow?: boolean | ((data: T) => boolean)
  defaultValue?: T[keyof T]
  rest?: () => VNode
}

export interface TextField<T> extends BaseField<T> {
  type?: 'text' | 'password' | 'email' | 'number'
  placeholder?: string
  readonly?: boolean
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

export interface CheckboxOption {
  label: string
  value: string
  description?: string
  image?: string
  group?: string
}

export interface CheckboxGroupField<T> extends BaseField<T> {
  type?: 'checkboxGroup'
  options: CheckboxOption[]
}

export interface ModelSelectorField<T> extends BaseField<T> {
  type?: 'modelSelector'
  placeholder?: string
  popupPosition?: 'bottom' | 'top'
  modelCategory?: ModelCategory | ModelCategory[]
  multiple?: boolean
  onChange?: (value: { modelId: string; providerId: string }) => void
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
  /** 媒体类型过滤，如 'image' 表示只允许上传图片 */
  media?: 'image' | 'video' | 'audio'
  /** 返回格式类型：'b64_json' 返回 base64 data URL，'url' 返回文件路径 */
  returnType?: 'b64_json' | 'url'
}

export interface CustomField<T> extends BaseField<T> {
  type: 'custom'
  render: (data: T) => VNode | null
}

export interface GroupField<T> extends BaseField<T> {
  type: 'group'
  children: FormField<T>[]
  collapsible?: boolean
  defaultCollapsed?: boolean
  noStyle?: boolean
}

export interface ArrayGroupField<T> extends BaseField<T> {
  type: 'array-group'
  children: FormField<T>[]
  max?: number
}

export interface RecordGroupField<T> extends BaseField<T> {
  type: 'record-group'
  children: FormField<T>[]
  keyPlaceholder?: string
}

export interface UnionField<T> extends BaseField<T> {
  type: 'union'
  options: Array<{
    type: string
    fields: FormField<T>[]
  }>
}

export interface ArrayUnionField<T> extends BaseField<T> {
  type: 'array-union'
  options: Array<{
    type: string
    fields: FormField<T>[]
  }>
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
  | RecordGroupField<T>
  | UnionField<T>
  | ArrayUnionField<T>

export interface FormConfig<T> {
  title?: string
  showHeader?: boolean
  size?: 'sm' | 'md' | 'lg'
  fields?: FormField<T>[] | (() => FormField<T>[]) | MaybeRefOrGetter<FormField<T>[]>
  schemas?: zod.ZodObject
  initialData?: T
  onSubmit?: (data: T) => void
  onReset?: () => void
  onChange?: (field: keyof T | undefined, value: T[keyof T] | undefined, data: T) => void
  filterDefaultValues?: boolean
}

export interface FormActions<T> {
  getData: () => T
  setData: (data: T) => void
  reset: () => void
  submit: () => boolean | Promise<T>
  validate: () => boolean | Promise<boolean>
  setFieldValue: (field: string, value: any) => void
  setFieldsValue: (data: T) => void
  getFieldValue: (field: string) => any
  updateFieldProps: (field: string, props: Record<string, any>) => void
}

export interface TableColumn<T = unknown> {
  key: string
  label: string
  width?: string | number
  minWidth?: string | number
  align?: 'left' | 'center' | 'right'
  headerClass?: string
  headerRender?: () => VNode | string | number | null
  renderType?: 'html'
  render?: (row: T, index: number) => VNode | string | number | null
}

export interface TableConfig<T extends Record<string, unknown>> {
  columns: TableColumn<T>[] | (() => TableColumn<T>[])
  data?: T[] | (() => T[])
  loading?: boolean | (() => boolean)
  onRowClick?: (row: T) => void
  expandRender?: (row: T) => VNode | string | number | null
  height?: string | number
  autoHeight?: {
    enabled: boolean
    bottomOffset?: number
    minHeight?: number
  }
  virtualScroll?: {
    enabled: boolean
    itemHeight: number
    overscan?: number
  }
  selection?: {
    enabled: boolean
    key?: string
    width?: string | number
  }
}

export interface TableActions<T> {
  setData: (data: T[]) => void
  setLoading: (loading: boolean) => void
  setColumns: (columns: TableColumn<T>[]) => void
  getData: () => T[]
  getLoading: () => boolean
  toggleExpand: (id: string | number) => void
  isExpanded: (id: string | number) => boolean
  getSelectedKeys: () => (string | number)[]
  getSelectedRows: () => T[]
  setSelectedKeys: (keys: (string | number)[]) => void
  toggleSelect: (key: string | number) => void
  selectAll: () => void
  clearSelection: () => void
  isSelected: (key: string | number) => boolean
  isAllSelected: () => boolean
  isIndeterminate: () => boolean
}

export interface TerminalTab {
  id: string
  title: string
  instance?: Terminal
  addon?: FitAddon
  isExecuting?: boolean
  isExecutingDelayed?: boolean
  lastExitCode?: number | null
  isReady?: boolean
  currentOutput?: string
  forceContinue?: () => void
  _cleanup?: () => void
}

export interface TerminalActions {
  tabs: Ref<TerminalTab[]>
  activeTabId: Ref<string>
  terminalHeight: Ref<number>
  isResizing: Ref<boolean>
  terminalSettings: Ref<TerminalSettings>
  createTab: (options?: {
    toolCallId?: string
    showTerminal?: boolean
    id?: string
    command?: string
    timeout?: number
  }) => Promise<{ id: string; result?: { success: boolean; exitCode: number | null; output: string } }>
  removeTab: (id: string, event?: Event) => void
  switchTab: (id: string) => void
  setTerminalRef: (el: any, id: string) => void
  handleWindowResize: () => void
  showTerminal: (active: boolean) => void
  hideTerminal: () => void
  toggleTerminal: () => void
  waitForCommand: (id: string, timeout?: number) => Promise<{ success: boolean; exitCode: number | null; output: string }>
  forceContinue: (id: string) => void
  getTerminalIdByToolCallId: (toolCallId: string) => string | undefined
}

export type NotificationType = 'success' | 'error' | 'warning' | 'info' | 'loading'

export type CloseNotification = () => void

export type NotificationHandler = (content: string, title?: string, duration?: number) => CloseNotification

export interface NotificationApi {
  info: NotificationHandler
  success: NotificationHandler
  error: NotificationHandler
  warning: NotificationHandler
  loading: NotificationHandler
  status: (id: string, text: string, options?: {
    icon?: string
    html?: string
    color?: string
    tooltip?: string
    pluginName?: string
  }) => void
  removeStatus: (id: string) => void
}

declare global {
  interface DownloadProgress extends _DownloadProgress { }
  interface ButtonProps extends _ButtonProps { }
  interface BaseModalProps extends _BaseModalProps { }
  interface ModalActions extends _ModalActions { }
  interface BaseField<T> extends _BaseField<T> { }
  interface TextField<T> extends _TextField<T> { }
  interface BooleanField<T> extends _BooleanField<T> { }
  interface SliderField<T> extends _SliderField<T> { }
  interface SelectField<T> extends _SelectField<T> { }
  interface TextareaField<T> extends _TextareaField<T> { }
  interface ArrayField<T> extends _ArrayField<T> { }
  interface ObjectField<T> extends _ObjectField<T> { }
  interface CheckboxOption extends _CheckboxOption { }
  interface CheckboxGroupField<T> extends _CheckboxGroupField<T> { }
  interface ModelSelectorField<T> extends _ModelSelectorField<T> { }
  interface ColorField<T> extends _ColorField<T> { }
  interface PathSelectorField<T> extends _PathSelectorField<T> { }
  interface UploadField<T> extends _UploadField<T> { }
  interface CustomField<T> extends _CustomField<T> { }
  interface GroupField<T> extends _GroupField<T> { }
  interface ArrayGroupField<T> extends _ArrayGroupField<T> { }
  interface RecordGroupField<T> extends _RecordGroupField<T> { }
  interface UnionField<T> extends _UnionField<T> { }
  interface ArrayUnionField<T> extends _ArrayUnionField<T> { }
  type FormField<T> = _FormField<T>
  interface FormConfig<T extends Record<string, unknown>> extends _FormConfig<T> { }
  interface FormActions<T> extends _FormActions<T> { }
  interface TableColumn<T = unknown> extends _TableColumn<T> { }
  interface TableConfig<T extends Record<string, unknown>> extends _TableConfig<T> { }
  interface TableActions<T> extends _TableActions<T> { }
  interface TerminalTab extends _TerminalTab { }
  interface TerminalActions extends _TerminalActions { }
  type NotificationType = _NotificationType
  type CloseNotification = _CloseNotification
  type NotificationHandler = _NotificationHandler
  interface NotificationApi extends _NotificationApi { }
  type ModalResolve = (value: string | boolean) => void
}

type _DownloadProgress = DownloadProgress
type _ButtonProps = ButtonProps
type _BaseModalProps = BaseModalProps
type _ModalActions = ModalActions
type _BaseField<T> = BaseField<T>
type _TextField<T> = TextField<T>
type _BooleanField<T> = BooleanField<T>
type _SliderField<T> = SliderField<T>
type _SelectField<T> = SelectField<T>
type _TextareaField<T> = TextareaField<T>
type _ArrayField<T> = ArrayField<T>
type _ObjectField<T> = ObjectField<T>
type _CheckboxOption = CheckboxOption
type _CheckboxGroupField<T> = CheckboxGroupField<T>
type _ModelSelectorField<T> = ModelSelectorField<T>
type _ColorField<T> = ColorField<T>
type _PathSelectorField<T> = PathSelectorField<T>
type _UploadField<T> = UploadField<T>
type _CustomField<T> = CustomField<T>
type _GroupField<T> = GroupField<T>
type _ArrayGroupField<T> = ArrayGroupField<T>
type _RecordGroupField<T> = RecordGroupField<T>
type _UnionField<T> = UnionField<T>
type _ArrayUnionField<T> = ArrayUnionField<T>
type _FormField<T> = FormField<T>
type _FormConfig<T extends Record<string, unknown>> = FormConfig<T>
type _FormActions<T> = FormActions<T>
type _TableColumn<T = unknown> = TableColumn<T>
type _TableConfig<T extends Record<string, unknown>> = TableConfig<T>
type _TableActions<T> = TableActions<T>
type _TerminalTab = TerminalTab
type _TerminalActions = TerminalActions
type _NotificationType = NotificationType
type _CloseNotification = CloseNotification
type _NotificationHandler = NotificationHandler
type _NotificationApi = NotificationApi
