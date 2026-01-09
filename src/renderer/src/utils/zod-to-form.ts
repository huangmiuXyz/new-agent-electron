import { z } from 'zod'
import type { FormField } from '../composables/useForm'

export function zodSchemaToFormfields<T extends Record<string, any>>(
  schema: z.ZodTypeAny,
  prefix = ''
): FormField<T>[] {
  const fields: FormField<T>[] = []

  let actualSchema: z.ZodTypeAny = schema

  while (true) {
    if (actualSchema instanceof z.ZodOptional || actualSchema instanceof z.ZodNullable || actualSchema instanceof z.ZodDefault) {
      actualSchema = actualSchema.unwrap() as z.ZodTypeAny
    } else if (actualSchema instanceof z.ZodPipe) {
      actualSchema = actualSchema.in as z.ZodTypeAny
    } else {
      break
    }
  }

  if (!(actualSchema instanceof z.ZodObject)) {
    return []
  }

  const shape = actualSchema.shape

  for (const key in shape) {
    const fieldSchema = shape[key]
    const name = prefix ? `${prefix}.${key}` : key
    const label = key

    const field = convertZodTypeToField(fieldSchema, name, label, !fieldSchema.isOptional())
    if (field) {
      fields.push(field as FormField<T>)
    }
  }

  return fields
}

function convertZodTypeToField(
  zodType: z.ZodTypeAny,
  name: string,
  label: string,
  required: boolean,
  parentDescription?: string
): FormField<any> | null {
  const description = zodType.description || parentDescription
  const commonProps = {
    name,
    label,
    required,
    hint: description
  }

  // 1. 处理对象 (嵌套)
  if (zodType instanceof z.ZodObject) {
    const children = zodSchemaToFormfields(zodType, name)
    if (children.length === 0) return null
    return {
      ...commonProps,
      type: 'group',
      children
    }
  }

  // 2. 处理基础类型
  if (zodType instanceof z.ZodString) {
    return { ...commonProps, type: 'text' }
  }

  if (zodType instanceof z.ZodNumber) {
    const min = zodType.minValue
    const max = zodType.maxValue

    if (min !== null && max !== null) {
      return { ...commonProps, type: 'slider', min, max, step: 0.1 }
    }
    return { ...commonProps, type: 'text' }
  }

  if (zodType instanceof z.ZodBoolean) {
    return { ...commonProps, type: 'boolean' }
  }

  if (zodType instanceof z.ZodArray) {
    // 检查数组元素类型，目前只支持基础类型的数组
    let elementType = zodType.element as z.ZodTypeAny
    while (elementType instanceof z.ZodOptional || elementType instanceof z.ZodNullable || elementType instanceof z.ZodDefault) {
      elementType = elementType.unwrap() as z.ZodTypeAny
    }

    if (elementType instanceof z.ZodString || elementType instanceof z.ZodNumber || elementType instanceof z.ZodEnum) {
      return { ...commonProps, type: 'array' }
    }

    if (elementType instanceof z.ZodObject) {
      return {
        ...commonProps,
        type: 'array-group',
        children: zodSchemaToFormfields(elementType, name)
      }
    }
    return null
  }

  if (zodType instanceof z.ZodRecord) {
    // 目前只支持值是基础类型的 Record
    let valueType = zodType.valueType as z.ZodTypeAny
    while (valueType instanceof z.ZodOptional || valueType instanceof z.ZodNullable || valueType instanceof z.ZodDefault) {
      valueType = valueType.unwrap() as z.ZodTypeAny
    }
    if (valueType instanceof z.ZodString || valueType instanceof z.ZodNumber) {
      return { ...commonProps, type: 'object' }
    }
    return null
  }

  if (zodType instanceof z.ZodEnum) {
    const options = zodType.options.map((v) => ({
      label: String(v),
      value: v
    }))
    return { ...commonProps, type: 'select', options, clearable: !required }
  }

  if (zodType instanceof z.ZodLiteral) {
    return {
      ...commonProps,
      type: 'select',
      options: [{ label: String(zodType.value), value: zodType.value as string | number }],
      clearable: !required
    }
  }

  if (zodType instanceof z.ZodUnion) {
    const options = zodType.options
      .filter((opt): opt is z.ZodLiteral<string | number> => opt instanceof z.ZodLiteral && (typeof opt.value === 'string' || typeof opt.value === 'number'))
      .map((opt) => {
        const val = opt.value
        return { label: String(val), value: val }
      })

    if (options.length > 0) {
      return { ...commonProps, type: 'select', options, clearable: !required }
    }
  }

  // 3. 处理包装类型 (Optional, Default, etc.)
  if (zodType instanceof z.ZodOptional || zodType instanceof z.ZodNullable || zodType instanceof z.ZodDefault) {
    return convertZodTypeToField(zodType.unwrap() as z.ZodTypeAny, name, label, required, description)
  }

  if (zodType instanceof z.ZodPipe) {
    return convertZodTypeToField(zodType.in as z.ZodTypeAny, name, label, required, description)
  }

  return null
}

