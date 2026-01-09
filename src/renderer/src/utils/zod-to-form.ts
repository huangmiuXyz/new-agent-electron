import type { FormField } from '../composables/useForm'

export function zodSchemaToFormfields<T extends Record<string, any>>(
  schema: any,
  prefix = ''
): FormField<T>[] {
  const fields: FormField<T>[] = []

  let actualSchema = schema
  // Handle ZodEffects
  if (schema._def?.typeName === 'ZodEffects') {
    actualSchema = schema._def.schema
  }

  if (actualSchema._def?.typeName !== 'ZodObject') {
    return []
  }

  const shape = actualSchema.shape

  for (const key in shape) {
    const fieldSchema = shape[key]
    const name = prefix ? `${prefix}.${key}` : key
    const label = fieldSchema.description || key

    // Check if optional or nullable
    let isOptional = false
    let tempSchema = fieldSchema
    while (tempSchema._def) {
      if (tempSchema._def.typeName === 'ZodOptional' || tempSchema._def.typeName === 'ZodNullable') {
        isOptional = true
        break
      }
      tempSchema = tempSchema._def.innerType || tempSchema._def.schema
      if (!tempSchema) break
    }

    const field = convertZodTypeToField(fieldSchema, name, label, !isOptional)
    if (field) {
      fields.push(field as FormField<T>)
    }
  }

  return fields
}

function convertZodTypeToField(
  zodType: any,
  name: string,
  label: string,
  required: boolean
): FormField<any> | null {
  let currentType = zodType

  // Unwrap optional/nullable/default
  while (
    currentType._def &&
    ['ZodOptional', 'ZodNullable', 'ZodDefault'].includes(currentType._def.typeName)
  ) {
    currentType = currentType._def.innerType || currentType._def.schema
  }

  const typeName = currentType._def?.typeName

  const commonProps = {
    name,
    label,
    required,
    hint: zodType.description
  }

  if (typeName === 'ZodString') {
    return {
      ...commonProps,
      type: 'text'
    }
  }

  if (typeName === 'ZodNumber') {
    const checks = currentType._def.checks || []
    const min = checks.find((c: any) => c.kind === 'min')?.value
    const max = checks.find((c: any) => c.kind === 'max')?.value

    if (min !== undefined && max !== undefined) {
      return {
        ...commonProps,
        type: 'slider',
        min,
        max,
        step: checks.find((c: any) => c.kind === 'multipleOf')?.value || 0.1
      }
    }

    return {
      ...commonProps,
      type: 'text'
    }
  }

  if (typeName === 'ZodBoolean') {
    return {
      ...commonProps,
      type: 'boolean'
    }
  }

  if (typeName === 'ZodEnum') {
    return {
      ...commonProps,
      type: 'select',
      options: currentType._def.values.map((v: string) => ({ label: v, value: v }))
    }
  }

  if (typeName === 'ZodNativeEnum') {
    const values = Object.values(currentType._def.values)
    return {
      ...commonProps,
      type: 'select',
      options: values.map((v: any) => ({ label: String(v), value: v }))
    }
  }

  if (typeName === 'ZodArray') {
    return {
      ...commonProps,
      type: 'array'
    }
  }

  if (typeName === 'ZodObject') {
    return {
      ...commonProps,
      type: 'group',
      children: zodSchemaToFormfields(currentType, name)
    }
  }

  if (typeName === 'ZodUnion') {
    const options = currentType._def.options
      .filter((opt: any) => opt._def?.typeName === 'ZodLiteral')
      .map((opt: any) => ({ label: String(opt._def.value), value: opt._def.value }))

    if (options.length > 0) {
      return {
        ...commonProps,
        type: 'select',
        options
      }
    }
  }

  return null
}

