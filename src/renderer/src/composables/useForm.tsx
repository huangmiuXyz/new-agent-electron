import Input from '@renderer/components/Input.vue'
import Textarea from '@renderer/components/Textarea.vue'
import Switch from '@renderer/components/Switch.vue'
import Slider from '@renderer/components/Slider.vue'
import Select from '@renderer/components/Select.vue'
import InputGroup from '@renderer/components/InputGroup.vue'
import CheckboxGroup from '@renderer/components/CheckboxGroup.vue'
import ModelSelector from '@renderer/components/ModelSelector.vue'
import ColorPicker from '@renderer/components/ColorPicker.vue'
import PathSelector from '@renderer/components/PathSelector.vue'
import FileUpload from '@renderer/components/FileUpload.vue'
import Button from '@renderer/components/Button.vue'
import { useIcon } from './useIcon'
import zod from 'zod'
import { zodSchemasToFormfields } from '../utils/zod-to-form'
import type { CheckboxOption } from '@renderer/components/CheckboxGroup.vue'
import Markdown from '@renderer/components/Markdown.vue'
import { VNode, MaybeRefOrGetter, toValue, PropType } from 'vue'

export const FormItem = defineComponent({
  props: {
    label: {
      type: String,
      default: ''
    },
    error: {
      type: String,
      default: ''
    },
    hint: {
      type: String,
      default: ''
    },
    required: {
      type: Boolean,
      default: false
    },
    size: {
      type: String as PropType<'sm' | 'md' | 'lg'>,
      default: 'md'
    },
    layout: {
      type: String as () => 'default' | 'toggle',
      default: 'default'
    },
    rest: {
      type: Function,
      default: () => null
    }
  },
  setup(props, { slots }) {
    return () => {
      const isToggleLayout = props.layout === 'toggle'

      return (
        <div class="form-item" data-layout={props.layout} data-size={props.size}>
          {isToggleLayout ? (
            <>
              <div class="form-item-label">
                <div class="form-item-title">
                  {slots.label?.() ? slots.label?.() : props.label}
                  {props.required && <span class="form-item-required">*</span>}
                  {props.hint && (
                    <div class="form-item-hint">
                      <Markdown
                        block={{ text: props.hint, state: 'done', type: 'text' }}
                        message={{ content: props.hint, role: 'assistant', id: 'hint' } as any}
                      />
                    </div>
                  )}
                </div>
                <div class="form-item-tool">{slots.tool?.()}</div>
              </div>
              <div class="form-item-content">{slots.default?.()}</div>
            </>
          ) : (
            <>
              {props.label && (
                <div class="form-item-label">
                  <div class="form-item-title">
                    {slots.label?.() ? slots.label?.() : props.label}
                    {props.required && <span class="form-item-required">*</span>}
                  </div>
                  <div class="form-item-tool">{slots.tool?.()}</div>
                </div>
              )}
              <div class="form-item-content">{slots.default?.()}</div>
              {props.error && <div class="form-item-error">{props.error}</div>}
              {props.hint && (
                <div class="form-item-hint">
                  <Markdown
                    block={{ text: props.hint, state: 'done', type: 'text' }}
                    message={{ content: props.hint, role: 'assistant', id: 'hint' } as any}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )
    }
  }
})

interface BaseField<T> {
  name: string
  label?: string
  required?: boolean
  disabled?: boolean
  hint?: string
  size?: 'sm' | 'md' | 'lg'
  ifShow?: boolean | ((data: T) => boolean)
  defaultValue?: T[keyof T]
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
  options: CheckboxOption[]
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

export interface FormConfig<T extends Record<string, any>> {
  title?: string
  showHeader?: boolean
  size?: 'sm' | 'md' | 'lg'
  fields?: MaybeRefOrGetter<FormField<T>[]>
  schemas?: zod.ZodObject
  initialData?: T
  onSubmit?: (data: T) => void
  onReset?: () => void
  onChange?: (field: keyof T | undefined, value: T[keyof T] | undefined, data: T) => void
}

export interface FormActions<T> {
  getData: () => T
  setData: (data: T) => void
  reset: () => void
  submit: () => boolean
  validate: () => boolean
  setFieldValue: (field: string, value: any) => void
  setFieldsValue: (data: T) => void
  getFieldValue: (field: string) => any
  updateFieldProps: (field: string, props: Record<string, any>) => void
}

const getNestedValue = (obj: any, path: string) => {
  return path.split('.').reduce((current, key) => current?.[key], obj)
}

const setNestedValue = (obj: any, path: string, value: any) => {
  const keys = path.split('.')
  const lastKey = keys.pop()!
  const target = keys.reduce((current, key) => {
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {}
    }
    return current[key]
  }, obj)
  target[lastKey] = value
}

export function useForm<T extends Record<string, any>>(config: FormConfig<T>) {
  const formData = ref<T>({} as T)

  const dynamicFieldProps = ref<Record<string, Record<string, any>>>({})

  const getDefaultValue = (fieldType: string, field: any) => {
    switch (fieldType) {
      case 'boolean':
        return false
      case 'number':
        return ''
      case 'slider':
        return field.min || 0
      case 'select':
        return ''
      case 'textarea':
        return ''
      case 'array':
        return []
      case 'object':
        return {}
      case 'array-group':
        return []
      case 'checkboxGroup':
        return []
      case 'modelSelector':
        return { modelId: '', providerId: '' }
      case 'color':
        return '#000000'
      case 'path':
        return ''
      case 'upload':
        return field.multiple ? [] : ''
      case 'custom':
        return null
      case 'group':
        return undefined
      default:
        return ''
    }
  }

  const fields = computed<FormField<T>[]>(() => {
    if (config.schemas) {
      return zodSchemasToFormfields(config.schemas)
    }
    return toValue(config.fields) || []
  })

  const initializeField = (field: FormField<T>) => {
    if (field.type === 'group' && field.children) {
      field.children.forEach(initializeField)
      return
    }
    const isNestedField = field.name.includes('.')
    let initialValue
    if (isNestedField) {
      initialValue = field.defaultValue || getNestedValue(config.initialData || {}, field.name)
      if (initialValue === undefined) {
        initialValue = getDefaultValue(field.type!, field)
      }
      setNestedValue(formData.value, field.name, initialValue)
    } else {
      if (
        config.initialData &&
        field.name in config.initialData &&
        config.initialData[field.name] !== undefined
      ) {
        initialValue = config.initialData[field.name]
      } else {
        initialValue = field.defaultValue || getDefaultValue(field.type!, field)
      }
      formData.value[field.name] = initialValue
    }
  }

  fields.value.forEach(initializeField)

  const errors = ref<Record<string, string>>({})

  const validate = () => {
    const newErrors: Record<string, string> = {}

    const validateField = (field: any) => {
      const isShow =
        field.ifShow !== undefined
          ? typeof field.ifShow === 'function'
            ? field.ifShow(formData.value)
            : field.ifShow
          : true

      if (!isShow) {
        return
      }

      if (field.type === 'group' && field.children) {
        field.children.forEach(validateField)
        return
      }

      if (field.required && !getNestedValue(formData.value, field.name)) {
        newErrors[field.name] = `${field.label || field.name} 是必填项`
      }
    }

    fields.value.forEach(validateField)

    errors.value = newErrors
    return Object.keys(newErrors).length === 0
  }

  const submit = () => {
    const newErrors: Record<string, string> = {}

    const validateField = (field: any) => {
      const isShow =
        field.ifShow !== undefined
          ? typeof field.ifShow === 'function'
            ? field.ifShow(formData.value)
            : field.ifShow
          : true

      if (!isShow) {
        return
      }

      if (field.type === 'group' && field.children) {
        field.children.forEach(validateField)
        return
      }

      if (field.required && !getNestedValue(formData.value, field.name)) {
        newErrors[field.name] = `${field.label || field.name} 是必填项`
      }
    }

    fields.value.forEach(validateField)

    errors.value = newErrors

    if (Object.keys(newErrors).length === 0) {
      config.onSubmit?.(formData.value)
      return true
    }
    return false
  }

  const reset = () => {
    fields.value.forEach(initializeField)
    errors.value = {}
    config.onReset?.()
  }

  const setFieldValue = (field: string, value: any) => {
    if (field.includes('.')) {
      setNestedValue(formData.value, field, value)
    } else {
      formData.value[field] = value
    }

    config.onChange?.(field as keyof T, value as T[keyof T], formData.value)
  }
  const setFieldsValue = (data: T) => {
    Object.keys(data).forEach((key) => {
      if (key.includes('.')) {
        setNestedValue(formData.value, key, data[key])
      } else {
        formData.value[key] = data[key]
      }
    })
    config.onChange?.(undefined, undefined, formData.value)
  }

  const getFieldValue = (field: string) => {
    if (field.includes('.')) {
      return getNestedValue(formData.value, field)
    } else {
      return formData.value[field]
    }
  }

  const getData = () => {
    return formData.value
  }

  const setData = (data: T) => {
    Object.assign(formData.value, data)
  }

  const updateFieldProps = (field: string, props: Record<string, any>) => {
    if (!dynamicFieldProps.value[field]) {
      dynamicFieldProps.value[field] = {}
    }
    Object.assign(dynamicFieldProps.value[field], props)
  }

  const renderField = (field: FormField<T>, formSize?: 'sm' | 'md' | 'lg'): VNode | null => {

    const show =
      field.ifShow !== undefined
        ? typeof field.ifShow === 'function'
          ? field.ifShow(formData.value)
          : field.ifShow
        : true
    if (!show) {
      return null
    }

    if (field.type === 'array-group') {
      const value = (getFieldValue(field.name) || []) as any[]
      const icons = useIcon(['Plus', 'Close'])
      const PlusIcon = icons.Plus as any
      const CloseIcon = icons.Close as any

      const addItem = () => {
        const newItem = {} as any
        field.children.forEach((child: any) => {
          const childName = child.name.split('.').pop()!
          newItem[childName] = getDefaultValue(child.type, child)
        })
        setFieldValue(field.name, [...value, newItem])
      }

      const removeItem = (index: number) => {
        const newValue = [...value]
        newValue.splice(index, 1)
        setFieldValue(field.name, newValue)
      }

      return (
        <div class="form-array-group" key={field.name}>
          {field.label && <div class="form-group-title">{field.label}</div>}
          <div class="form-array-items">
            {value.map((item, index) => (
              <div class="form-array-item" key={`${field.name}-${index}`}>
                <div class="form-array-item-content">
                  {field.children.map((child: any) => {
                    const childName = child.name.split('.').pop()!
                    const fieldName = `${field.name}.${index}.${childName}`

                    // Create a virtual field for the child
                    const childField = {
                      ...child,
                      name: fieldName,
                      label: child.label || childName
                    }
                    return renderField(childField, formSize)
                  })}
                </div>
                <Button
                  variant="text"
                  size="sm"
                  class="remove-item-btn"
                  onClick={() => removeItem(index)}
                >
                  <CloseIcon />
                </Button>
              </div>
            ))}
          </div>
          <button type="button" class="add-item-btn" onClick={addItem}>
            <PlusIcon />
            <span>添加{field.label || '项'}</span>
          </button>
        </div>
      )
    }

    if (field.type === 'group') {
      return (
        <div class="form-group" key={field.name}>
          {field.label && <div class="form-group-title">{field.label}</div>}
          <div class="form-group-children">{field.children.map((child) => renderField(child, formSize))}</div>
        </div>
      )
    }

    const fieldProps = {
      ...field,
      ...(dynamicFieldProps.value[field.name] || {}),
      modelValue: getFieldValue(field.name),
      'onUpdate:modelValue': (val: any) => setFieldValue(field.name, val)
    }

    const error = errors.value[field.name]

    return (
      <FormItem
        key={field.name}
        label={field.label}
        error={error}
        hint={field.hint}
        required={field.required}
        size={field.size || formSize || config.size}
        layout={field.type === 'boolean' ? 'toggle' : 'default'}
      >
        {(() => {
          switch (field.type) {
            case 'boolean':
              return <Switch {...fieldProps} />
            case 'slider':
              return <Slider {...fieldProps} />
            case 'select':
              return (
                <Select
                  {...fieldProps}
                  clearable={(field as SelectField<T>).clearable ?? !field.required}
                />
              )
            case 'textarea':
              return <Textarea {...fieldProps} />
            case 'array':
              return <InputGroup {...fieldProps} />
            case 'object':
              return <InputGroup {...fieldProps} mode="object" />
            case 'checkboxGroup':
              return <CheckboxGroup {...fieldProps} />
            case 'modelSelector': {
              const val = getFieldValue(field.name) || { modelId: '', providerId: '' }
              const f = field as ModelSelectorField<T>
              return (
                <ModelSelector
                  popupPosition={f.popupPosition}
                  multiple={f.multiple}
                  category={f.modelCategory}
                  modelId={val.modelId}
                  providerId={val.providerId}
                  onUpdate:modelId={(v) => {
                    const current = getFieldValue(field.name) || { modelId: '', providerId: '' }
                    setFieldValue(field.name, { ...current, modelId: v })
                  }}
                  onUpdate:providerId={(v) => {
                    const current = getFieldValue(field.name) || { modelId: '', providerId: '' }
                    setFieldValue(field.name, { ...current, providerId: v })
                  }}
                />
              )
            }
            case 'color':
              return <ColorPicker {...fieldProps} />
            case 'path':
              return <PathSelector {...fieldProps} />
            case 'upload':
              return <FileUpload {...fieldProps} />
            case 'custom':
              return (field as CustomField<T>).render(formData.value)
            default:
              return (
                <Input
                  {...fieldProps}
                  type={(field as TextField<T>).type || 'text'}
                  placeholder={(field as TextField<T>).placeholder}
                />
              )
          }
        })()}
      </FormItem>
    )
  }

  const FormComponent = defineComponent({
    props: {
      fields: {
        type: Array as PropType<FormField<T>[]>,
        default: undefined
      },
      size: {
        type: String as PropType<'sm' | 'md' | 'lg'>,
        default: undefined
      }
    },
    setup(props, { slots }) {
      return () => {
        const hasHeader = config.showHeader !== false && config.title
        const displayFields = props.fields || fields.value
        const formSize = props.size || config.size

        return (
          <div class="form-container" data-size={formSize}>
            {hasHeader && <header class="form-header">{config.title}</header>}
            <div class="form-content">
              <div class="form-wrapper">
                {displayFields.map((field) => renderField(field, formSize))}
                {slots.footer?.()}
              </div>
            </div>
          </div>
        )
      }
    }
  })

  if (typeof document !== 'undefined' && !document.getElementById('use-form-styles')) {
    const style = document.createElement('style')
    style.id = 'use-form-styles'
    style.textContent = `
      .form-container {
        display: flex;
        flex-direction: column;
        width: 100%;
      }

      .form-header {
        height: var(--header-h);
        border-bottom: 1px solid var(--border-subtle);
        display: flex;
        align-items: center;
        padding: 0 24px;
        font-weight: 600;
        font-size: 14px;
      }

      .form-content {
        padding: 0;
        height: 100%;
      }

      .form-item {
        width: 100%;
        margin-bottom: 16px;
        margin-top: 20px;
      }

      .form-item[data-size="sm"] {
        margin-bottom: 8px;
        margin-top: 10px;
      }

      .form-item[data-size="lg"] {
        margin-bottom: 24px;
        margin-top: 30px;
      }

      .form-item:first-child {
        margin-top: 0 !important;
        padding-top: 0 !important;
      }

      .form-item[data-layout="toggle"] {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 0;
        border-bottom: 1px solid #f5f5f5;
        margin-top: 0;
      }

      .form-item[data-layout="toggle"][data-size="sm"] {
        padding: 6px 0;
      }

      .form-item-label {
        display: flex;
        font-size: 12px;
        font-weight: 500;
        color: var(--text-secondary);
        margin-bottom: 6px;
        justify-content: space-between;
      }

      .form-item[data-layout="toggle"] .form-item-label {
        font-size: 13px;
        margin-bottom: 0;
      }

      .form-item-required {
        color: #ff4757;
        margin-left: 2px;
      }

      .form-item-content {
        width: 100%;
      }

      .form-item[data-layout="toggle"] .form-item-content {
        width: auto;
      }

      .form-item-error,
      .form-item-hint {
        font-size: 11px;
        margin-top: 4px;
      }

      .form-item-error {
        color: #ff4757;
      }

      .form-item-hint {
        color: var(--text-tertiary);
      }

      .form-group {
        margin-bottom: 24px;
        padding: 16px;
        border: 1px solid var(--border-subtle);
        border-radius: 8px;
        background: var(--bg-secondary-soft);
      }

      .form-group-title {
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 16px;
        color: var(--text-primary);
        border-bottom: 1px solid var(--border-subtle);
        padding-bottom: 8px;
      }

      .form-group-children {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .form-array-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
        border: 1px solid var(--border-subtle);
        border-radius: 6px;
        padding: 12px;
        background: var(--bg-secondary);
      }

      .form-array-items {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .form-array-item {
        display: flex;
        gap: 8px;
        padding: 8px;
        background: var(--bg-tertiary);
        border-radius: 4px;
        border: 1px solid var(--border-subtle);
      }

      .form-array-item-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .remove-item-btn {
        margin-top: 4px;
        color: var(--text-tertiary);
        transition: all 0.2s;
        padding: 4px !important;
        height: 24px !important;
        width: 24px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        border-radius: 4px !important;
      }

      .remove-item-btn:hover {
        color: #ff4d4f !important;
        background: rgba(255, 77, 79, 0.1) !important;
      }

      .add-item-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        width: 100%;
        padding: 6px;
        border: 1px dashed var(--border-subtle);
        background: var(--bg-tertiary);
        color: var(--text-secondary);
        font-size: 13px;
        font-weight: 500;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.2s;
      }

      .add-item-btn:hover {
        border-color: var(--text-secondary);
        color: var(--text-primary);
        background: var(--bg-secondary);
      }
    `
    document.head.appendChild(style)
  }

  const actions: FormActions<T> = {
    getData,
    setData,
    reset,
    submit,
    validate,
    setFieldValue,
    getFieldValue,
    setFieldsValue,
    updateFieldProps
  }

  return [FormComponent, actions] as const
}
