import Input from '@renderer/components/Input.vue'
import Textarea from '@renderer/components/Textarea.vue'
import Switch from '@renderer/components/Switch.vue'
import Slider from '@renderer/components/Slider.vue'
import Select from '@renderer/components/Select.vue'
import InputGroup from '@renderer/components/InputGroup.vue'
import CheckboxGroup from '@renderer/components/CheckboxGroup.vue'
import ModelSelector from '@renderer/components/ModelSelector.vue'
import type { CheckboxOption } from '@renderer/components/CheckboxGroup.vue'

// FormItem 组件 - 统一的表单项布局组件
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
    layout: {
      type: String as () => 'default' | 'toggle',
      default: 'default'
    }
  },
  setup(props, { slots }) {
    return () => {
      const isToggleLayout = props.layout === 'toggle'

      return (
        <div class="form-item" data-layout={props.layout}>
          {isToggleLayout ? (
            <>
              <div class="form-item-label">
                <div class="form-item-title">
                  {slots.label?.() ? slots.label?.() : props.label}
                  {props.required && <span class="form-item-required">*</span>}
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
              {props.hint && <div class="form-item-hint">{props.hint}</div>}
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
  ifShow?: (data: T) => boolean
}

// 文本输入字段
export interface TextField<T> extends BaseField<T> {
  type: 'text' | 'password' | 'email' | 'number'
  placeholder?: string
  readonly?: boolean
}

// 布尔字段（开关）
export interface BooleanField<T> extends BaseField<T> {
  type: 'boolean'
}

// 滑块字段
export interface SliderField<T> extends BaseField<T> {
  type: 'slider'
  min?: number
  max?: number
  step?: number
  unit?: string
}

// 选择字段
export interface SelectField<T> extends BaseField<T> {
  type: 'select'
  options: { label: string; value: string | number }[]
  placeholder?: string
}

// 文本域字段
export interface TextareaField<T> extends BaseField<T> {
  type: 'textarea'
  placeholder?: string
  readonly?: boolean
  rows?: number
  autoResize?: boolean
}

// 数组字段（用于参数列表）
export interface ArrayField<T> extends BaseField<T> {
  type: 'array'
  placeholder?: string
}

// 对象字段（用于环境变量）
export interface ObjectField<T> extends BaseField<T> {
  type: 'object'
  keyPlaceholder?: string
  valuePlaceholder?: string
}

// 复选框组字段（用于多选）
export interface CheckboxGroupField<T> extends BaseField<T> {
  type: 'checkboxGroup'
  options: CheckboxOption[]
}

// 模型选择器字段
export interface ModelSelectorField<T> extends BaseField<T> {
  type: 'modelSelector'
  placeholder?: string
  popupPosition?: 'bottom' | 'top'
  modelCategory?: ModelCategory
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

export interface FormConfig<T extends Record<string, any>> {
  title?: string
  showHeader?: boolean
  fields: FormField<T>[]
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

// 辅助函数：获取嵌套对象的值
const getNestedValue = (obj: any, path: string) => {
  return path.split('.').reduce((current, key) => current?.[key], obj)
}

// 辅助函数：设置嵌套对象的值
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
  // 初始化表单数据
  const formData = ref<T>({} as T)

  // 存储动态字段属性
  const dynamicFieldProps = ref<Record<string, Record<string, any>>>({})

  // 根据字段类型获取默认值的辅助函数
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
      case 'checkboxGroup':
        return []
      case 'modelSelector':
        return { modelId: '', providerId: '' }
      default:
        return ''
    }
  }

  // 初始化单个字段的辅助函数
  const initializeField = (field: any) => {
    const isNestedField = field.name.includes('.')
    let initialValue

    if (isNestedField) {
      // 处理嵌套字段
      initialValue = getNestedValue(config.initialData || {}, field.name)
      if (initialValue === undefined) {
        initialValue = getDefaultValue(field.type, field)
      }
      setNestedValue(formData.value, field.name, initialValue)
    } else {
      // 处理非嵌套字段
      if (
        config.initialData &&
        field.name in config.initialData &&
        config.initialData[field.name] !== undefined
      ) {
        initialValue = config.initialData[field.name]
      } else {
        initialValue = getDefaultValue(field.type, field)
      }
      formData.value[field.name] = initialValue
    }
  }

  // 初始化所有字段值
  config.fields.forEach(initializeField)

  // 表单验证状态
  const errors = ref<Record<string, string>>({})

  // 表单操作函数
  const validate = () => {
    const newErrors: Record<string, string> = {}

    config.fields.forEach((field) => {
      // 跳过隐藏的字段
      if (field.ifShow && !field.ifShow(formData.value)) {
        return
      }

      if (field.required && !getNestedValue(formData.value, field.name)) {
        newErrors[field.name] = `${field.label || field.name} 是必填项`
      }
    })

    errors.value = newErrors
    return Object.keys(newErrors).length === 0
  }

  const submit = () => {
    const newErrors: Record<string, string> = {}

    config.fields.forEach((field) => {
      // 跳过隐藏的字段
      if (field.ifShow && !field.ifShow(formData.value)) {
        return
      }

      if (field.required && !getNestedValue(formData.value, field.name)) {
        newErrors[field.name] = `${field.label || field.name} 是必填项`
      }
    })

    errors.value = newErrors

    if (Object.keys(newErrors).length === 0) {
      config.onSubmit?.(formData.value)
      return true
    }
    return false
  }

  const reset = () => {
    config.fields.forEach(initializeField)
    errors.value = {}
    config.onReset?.()
  }

  const setFieldValue = (field: string, value: any) => {
    if (field.includes('.')) {
      // 处理嵌套字段
      setNestedValue(formData.value, field, value)
    } else {
      // 处理非嵌套字段
      formData.value[field] = value
    }
    // 触发 onChange 回调
    config.onChange?.(field as keyof T, value as T[keyof T], formData.value)
  }
  const setFieldsValue = (data: T) => {
    // 处理嵌套字段的设置
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
      // 处理嵌套字段
      return getNestedValue(formData.value, field)
    } else {
      // 处理非嵌套字段
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

  // 表单组件
  const FormComponent = defineComponent({
    setup(_, { slots }) {
      return () => {
        const hasHeader = config.showHeader !== false && config.title

        return (
          <div class="form-container">
            {hasHeader && <header class="form-header">{config.title}</header>}
            <div class="form-content">
              <div class="form-wrapper">
                {config.fields.map((field) => {
                  // 检查字段是否应该显示
                  if (field.ifShow && !field.ifShow(formData.value)) {
                    return null
                  }

                  const hasError = errors.value[field.name]
                  // 获取动态字段属性
                  const dynamicProps = dynamicFieldProps.value[field.name] || {}

                  switch (field.type) {
                    case 'text':
                    case 'password':
                    case 'email':
                    case 'number':
                      return (
                        <FormItem
                          label={field.label}
                          error={hasError}
                          hint={field.hint}
                          required={field.required}
                          layout="default"
                        >
                          <Input
                            type={field.type}
                            placeholder={field.placeholder}
                            disabled={field.disabled}
                            readonly={field.readonly}
                            modelValue={getNestedValue(formData.value, field.name)}
                            onUpdate:modelValue={(value) => {
                              setFieldValue(field.name, value)
                            }}
                            {...dynamicProps}
                          />
                        </FormItem>
                      )

                    case 'boolean':
                      return (
                        <FormItem label={field.label} required={field.required} layout="toggle">
                          <Switch
                            modelValue={getNestedValue(formData.value, field.name)}
                            onUpdate:modelValue={(value) => {
                              setFieldValue(field.name, value)
                            }}
                            {...dynamicProps}
                          />
                        </FormItem>
                      )

                    case 'slider':
                      return (
                        <FormItem
                          label={
                            field.label
                              ? `${field.label}: ${getNestedValue(formData.value, field.name)}${field.unit || ''}`
                              : ''
                          }
                          hint={field.hint}
                          required={field.required}
                          layout="default"
                        >
                          <Slider
                            modelValue={getNestedValue(formData.value, field.name)}
                            min={field.min}
                            max={field.max}
                            step={field.step}
                            unit={field.unit}
                            onUpdate:modelValue={(value) => {
                              setFieldValue(field.name, value)
                            }}
                            {...dynamicProps}
                          />
                        </FormItem>
                      )

                    case 'select':
                      return (
                        <FormItem
                          label={field.label}
                          error={hasError}
                          hint={field.hint}
                          required={field.required}
                          layout="default"
                        >
                          <Select
                            options={field.options}
                            placeholder={field.placeholder}
                            disabled={field.disabled}
                            modelValue={getNestedValue(formData.value, field.name)}
                            onUpdate:modelValue={(value) => {
                              setFieldValue(field.name, value)
                            }}
                            {...dynamicProps}
                          />
                        </FormItem>
                      )

                    case 'textarea':
                      return (
                        <FormItem
                          label={field.label}
                          error={hasError}
                          hint={field.hint}
                          required={field.required}
                          layout="default"
                        >
                          <Textarea
                            placeholder={field.placeholder}
                            disabled={field.disabled}
                            readonly={field.readonly}
                            rows={field.rows}
                            autoResize={field.autoResize}
                            modelValue={getNestedValue(formData.value, field.name)}
                            onUpdate:modelValue={(value) => {
                              setFieldValue(field.name, value)
                            }}
                            {...dynamicProps}
                          />
                        </FormItem>
                      )

                    case 'array':
                      return (
                        <FormItem
                          label={field.label}
                          error={hasError}
                          hint={field.hint}
                          required={field.required}
                          layout="default"
                        >
                          <InputGroup
                            mode="array"
                            placeholder={field.placeholder}
                            disabled={field.disabled}
                            arrayValue={getNestedValue(formData.value, field.name) as string[]}
                            onUpdate:arrayValue={(value) => {
                              setFieldValue(field.name, value)
                            }}
                            {...dynamicProps}
                          />
                        </FormItem>
                      )

                    case 'object':
                      return (
                        <FormItem
                          label={field.label}
                          error={hasError}
                          hint={field.hint}
                          required={field.required}
                          layout="default"
                        >
                          <InputGroup
                            mode="object"
                            keyPlaceholder={field.keyPlaceholder}
                            valuePlaceholder={field.valuePlaceholder}
                            disabled={field.disabled}
                            objectValue={
                              getNestedValue(formData.value, field.name) as Record<string, string>
                            }
                            onUpdate:objectValue={(value) => {
                              setFieldValue(field.name, value)
                            }}
                            {...dynamicProps}
                          />
                        </FormItem>
                      )

                    case 'checkboxGroup':
                      return (
                        <FormItem
                          label={field.label}
                          error={hasError}
                          hint={field.hint}
                          required={field.required}
                          layout="default"
                        >
                          <CheckboxGroup
                            options={field.options}
                            disabled={field.disabled}
                            modelValue={getNestedValue(formData.value, field.name)}
                            onUpdate:modelValue={(value) => {
                              setFieldValue(field.name, value)
                            }}
                            {...dynamicProps}
                          />
                        </FormItem>
                      )

                    case 'modelSelector':
                      return (
                        <FormItem
                          label={field.label}
                          error={hasError}
                          hint={field.hint}
                          required={field.required}
                          layout="default"
                        >
                          <ModelSelector
                            category={field.modelCategory}
                            popupPosition={field.popupPosition}
                            modelId={getNestedValue(formData.value, field.name)?.modelId || ''}
                            providerId={
                              getNestedValue(formData.value, field.name)?.providerId || ''
                            }
                            onUpdate:modelId={(value: string) => {
                              const currentValue = getNestedValue(formData.value, field.name) || {}
                              setNestedValue(formData.value, field.name, {
                                ...currentValue,
                                modelId: value
                              })
                              config.onChange?.(
                                field.name as keyof T,
                                getNestedValue(formData.value, field.name) as T[keyof T],
                                formData.value
                              )
                            }}
                            onUpdate:providerId={(value: string) => {
                              const currentValue = getNestedValue(formData.value, field.name) || {}
                              setNestedValue(formData.value, field.name, {
                                ...currentValue,
                                providerId: value
                              })
                              config.onChange?.(
                                field.name as keyof T,
                                getNestedValue(formData.value, field.name) as T[keyof T],
                                formData.value
                              )
                            }}
                            {...dynamicProps}
                          />
                        </FormItem>
                      )

                    default:
                      return null
                  }
                })}
                {slots.footer?.()}
              </div>
            </div>
          </div>
        )
      }
    }
  })

  // 动态添加样式到文档头部
  if (typeof document !== 'undefined' && !document.getElementById('use-form-styles')) {
    const style = document.createElement('style')
    style.id = 'use-form-styles'
    style.textContent = `
      .form-container {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
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
        flex: 1;
        overflow-y: auto;
        padding: 0;
        height: 100%;
      }

      .form-item {
        width: 100%;
        margin-bottom: 16px;
        margin-top: 20px;
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
    `
    document.head.appendChild(style)
  }

  // 表单操作对象
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
