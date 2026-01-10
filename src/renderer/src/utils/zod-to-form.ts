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
  const isHidden = (zodType.def as any).isHidden === true

  // 解包以获取实际类型，但保留 description 和 isHidden
  let actualType = zodType
  while (true) {
    if (actualType instanceof z.ZodOptional || actualType instanceof z.ZodNullable || actualType instanceof z.ZodDefault) {
      actualType = actualType.unwrap() as z.ZodTypeAny
    } else if (actualType instanceof z.ZodPipe) {
      actualType = actualType.in as z.ZodTypeAny
    } else {
      break
    }
  }

  const description = zodType.description || actualType.description || parentDescription

  const commonProps = {
    name,
    label,
    required,
    hint: description,
    ifShow: isHidden ? () => false : undefined
  }

  if (actualType instanceof z.ZodObject) {
    const children = zodSchemaToFormfields(actualType, name)
    if (children.length === 0) return null
    return {
      ...commonProps,
      type: 'group',
      children
    }
  }

  if (actualType instanceof z.ZodString) {
    return { ...commonProps, type: 'text' }
  }

  if (actualType instanceof z.ZodNumber) {
    const min = actualType.minValue
    const max = actualType.maxValue

    if (min !== null && max !== null) {
      return { ...commonProps, type: 'slider', min, max, step: 0.1 }
    }
    return { ...commonProps, type: 'text' }
  }

  if (actualType instanceof z.ZodBoolean) {
    return { ...commonProps, type: 'boolean' }
  }

  if (actualType instanceof z.ZodArray) {
    let elementType = actualType.element as z.ZodTypeAny
    while (elementType instanceof z.ZodOptional || elementType instanceof z.ZodNullable || elementType instanceof z.ZodDefault) {
      elementType = elementType.unwrap() as z.ZodTypeAny
    }

    if (elementType instanceof z.ZodObject) {
      return {
        ...commonProps,
        type: 'array-group',
        children: zodSchemaToFormfields(elementType, name)
      }
    }

    if (elementType instanceof z.ZodString || elementType instanceof z.ZodNumber || elementType instanceof z.ZodEnum) {
      return { ...commonProps, type: 'array' }
    }
    return null
  }

  if (actualType instanceof z.ZodRecord) {
    let valueType = actualType.valueType as z.ZodTypeAny
    while (valueType instanceof z.ZodOptional || valueType instanceof z.ZodNullable || valueType instanceof z.ZodDefault) {
      valueType = valueType.unwrap() as z.ZodTypeAny
    }
    if (valueType instanceof z.ZodString || valueType instanceof z.ZodNumber) {
      return { ...commonProps, type: 'object' }
    }
    return null
  }

  if (actualType instanceof z.ZodEnum) {
    const options = actualType.options.map((v) => ({
      label: String(v),
      value: v
    }))
    return { ...commonProps, type: 'select', options, clearable: !required }
  }

  if (actualType instanceof z.ZodLiteral) {
    return {
      ...commonProps,
      type: 'select',
      options: [{ label: String(actualType.value), value: actualType.value as string | number }],
      clearable: !required
    }
  }

  if (actualType instanceof z.ZodUnion) {
    const options = actualType.options
      .filter((opt): opt is z.ZodLiteral<string | number> => opt instanceof z.ZodLiteral && (typeof opt.value === 'string' || typeof opt.value === 'number'))
      .map((opt) => {
        const val = opt.value
        return { label: String(val), value: val }
      })

    if (options.length > 0) {
      return { ...commonProps, type: 'select', options, clearable: !required }
    }
  }

  return null
}

