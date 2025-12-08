import Input from '@renderer/components/Input.vue'
import Textarea from '@renderer/components/Textarea.vue'
import Switch from '@renderer/components/Switch.vue'
import Slider from '@renderer/components/Slider.vue'
import Select from '@renderer/components/Select.vue'
import InputGroup from '@renderer/components/InputGroup.vue'
import CheckboxGroup from '@renderer/components/CheckboxGroup.vue'
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

export type FormField<T> =
  | TextField<T>
  | BooleanField<T>
  | SliderField<T>
  | SelectField<T>
  | TextareaField<T>
  | ArrayField<T>
  | ObjectField<T>
  | CheckboxGroupField<T>

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
}

export function useForm<T extends Record<string, any>>(config: FormConfig<T>) {
  // 初始化表单数据
  const formData = ref<T>({} as T)

  // 初始化字段值
  config.fields.forEach((field) => {
    if (
      config.initialData &&
      field.name in config.initialData &&
      config.initialData[field.name] !== undefined
    ) {
      formData.value[field.name] = config.initialData[field.name]
    } else {
      // 根据字段类型设置默认值
      switch (field.type) {
        case 'boolean':
          formData.value[field.name] = false
          break
        case 'number':
          formData.value[field.name] = ''
          break
        case 'slider':
          formData.value[field.name] = field.min || 0
          break
        case 'select':
          formData.value[field.name] = ''
          break
        case 'textarea':
          formData.value[field.name] = ''
          break
        case 'array':
          formData.value[field.name] = []
          break
        case 'object':
          formData.value[field.name] = {}
          break
        case 'checkboxGroup':
          formData.value[field.name] = []
          break
        default:
          formData.value[field.name] = ''
      }
    }
  })

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

      if (field.required && !formData.value[field.name]) {
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

      if (field.required && !formData.value[field.name]) {
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
    config.fields.forEach((field) => {
      if (
        config.initialData &&
        field.name in config.initialData &&
        config.initialData[field.name] !== undefined
      ) {
        formData.value[field.name] = config.initialData[field.name]
      } else {
        switch (field.type) {
          case 'boolean':
            formData.value[field.name] = false
            break
          case 'number':
            formData.value[field.name] = ''
            break
          case 'slider':
            formData.value[field.name] = field.min || 0
            break
          case 'select':
            formData.value[field.name] = ''
            break
          case 'textarea':
            formData.value[field.name] = ''
            break
          case 'array':
            formData.value[field.name] = []
            break
          case 'object':
            formData.value[field.name] = {}
            break
          case 'checkboxGroup':
            formData.value[field.name] = []
            break
          default:
            formData.value[field.name] = ''
        }
      }
    })
    errors.value = {}
    config.onReset?.()
  }

  const setFieldValue = (field: string, value: any) => {
    formData.value[field] = value
    // 触发 onChange 回调
    config.onChange?.(field as keyof T, value as T[keyof T], formData.value)
  }
  const setFieldsValue = (data: T) => {
    Object.assign(formData.value, data)
    config.onChange?.(undefined, undefined, formData.value)
  }

  const getFieldValue = (field: string) => {
    return formData.value[field]
  }

  const getData = () => {
    return formData.value
  }

  const setData = (data: T) => {
    Object.assign(formData.value, data)
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
                            v-model={formData.value[field.name]}
                            onUpdate:modelValue={(value) => {
                              formData.value[field.name] = value
                              config.onChange?.(
                                field.name as keyof T,
                                value as T[keyof T],
                                formData.value
                              )
                            }}
                          />
                        </FormItem>
                      )

                    case 'boolean':
                      return (
                        <FormItem label={field.label} required={field.required} layout="toggle">
                          <Switch
                            v-model={formData.value[field.name]}
                            onUpdate:modelValue={(value) => {
                              formData.value[field.name] = value
                              config.onChange?.(
                                field.name as keyof T,
                                value as T[keyof T],
                                formData.value
                              )
                            }}
                          />
                        </FormItem>
                      )

                    case 'slider':
                      return (
                        <FormItem
                          label={
                            field.label
                              ? `${field.label}: ${formData.value[field.name]}${field.unit || ''}`
                              : ''
                          }
                          hint={field.hint}
                          required={field.required}
                          layout="default"
                        >
                          <Slider
                            v-model={formData.value[field.name]}
                            min={field.min}
                            max={field.max}
                            step={field.step}
                            unit={field.unit}
                            onUpdate:modelValue={(value) => {
                              formData.value[field.name] = value
                              config.onChange?.(
                                field.name as keyof T,
                                value as T[keyof T],
                                formData.value
                              )
                            }}
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
                            v-model={formData.value[field.name]}
                            onUpdate:modelValue={(value) => {
                              formData.value[field.name] = value
                              config.onChange?.(
                                field.name as keyof T,
                                value as T[keyof T],
                                formData.value
                              )
                            }}
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
                            v-model={formData.value[field.name]}
                            onUpdate:modelValue={(value) => {
                              formData.value[field.name] = value
                              config.onChange?.(
                                field.name as keyof T,
                                value as T[keyof T],
                                formData.value
                              )
                            }}
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
                            arrayValue={formData.value[field.name] as string[]}
                            onUpdate:arrayValue={(value) => {
                              formData.value[field.name] = value
                              config.onChange?.(
                                field.name as keyof T,
                                value as T[keyof T],
                                formData.value
                              )
                            }}
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
                            objectValue={formData.value[field.name] as Record<string, string>}
                            onUpdate:objectValue={(value) => {
                              formData.value[field.name] = value
                              config.onChange?.(
                                field.name as keyof T,
                                value as T[keyof T],
                                formData.value
                              )
                            }}
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
                            v-model={formData.value[field.name]}
                            onUpdate:modelValue={(value) => {
                              formData.value[field.name] = value
                              config.onChange?.(
                                field.name as keyof T,
                                value as T[keyof T],
                                formData.value
                              )
                            }}
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
    setFieldsValue
  }

  return [FormComponent, actions] as const
}
