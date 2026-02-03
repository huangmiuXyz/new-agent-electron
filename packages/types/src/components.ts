import { VNode, Component, CSSProperties, MaybeRefOrGetter, Ref } from 'vue'
import * as zod from 'zod'
import { ModelCategory } from './ai'

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
}

export interface CheckboxGroupField<T> extends BaseField<T> {
  type?: 'checkboxGroup'
  options: CheckboxOption[]
}

export interface ModelSelectorField<T> extends BaseField<T> {
  type?: 'modelSelector'
  placeholder?: string
  popupPosition?: 'bottom' | 'top'
  modelCategory?: ModelCategory
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

export interface FormConfig<T extends Record<string, unknown>> {
  title?: string
  showHeader?: boolean
  size?: 'sm' | 'md' | 'lg'
  fields?: MaybeRefOrGetter<FormField<T>[]>
  schemas?: zod.AnyZodObject
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
  setFieldValue: (field: string, value: unknown) => void
  setFieldsValue: (data: T) => void
  getFieldValue: (field: string) => unknown
  updateFieldProps: (field: string, props: Record<string, unknown>) => void
}

export interface TableColumn<T = unknown> {
  key: string
  label: string
  width?: string | number
  align?: 'left' | 'center' | 'right'
  headerClass?: string
  renderType?: 'html'
  render?: (row: T, index: number) => VNode | string | number | null
}

export interface TableConfig<T extends Record<string, unknown>> {
  columns: MaybeRefOrGetter<TableColumn<T>[]>
  data?: MaybeRefOrGetter<T[]>
  loading?: MaybeRefOrGetter<boolean>
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
  instance: unknown // Terminal
  addon: unknown // FitAddon
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
  createTab: (options?: {
    toolCallId?: string
    showTerminal?: boolean
    id?: string
    command?: string
    timeout?: number
  }) => Promise<{ id: string; result?: { success: boolean; exitCode: number | null; output: string } }>
  removeTab: (id: string, event?: Event) => void
  switchTab: (id: string) => void
  showTerminal: () => void
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
