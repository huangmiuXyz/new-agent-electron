import {
  ZodType,
  ZodObject,
  ZodString,
  ZodNumber,
  ZodBoolean,
  ZodEnum,
  ZodArray,
} from 'zod'

interface UnwrapResult {
  schema: ZodType<any, any>
  required: boolean
  defaultValue?: any
}

function unwrap(schema: ZodType): UnwrapResult {
  let current: any = schema
  let required = true
  let defaultValue: unknown = undefined

  while (current?.def) {
    switch (current.def.type) {
      case 'default':
        defaultValue = current.def.defaultValue
        required = false
        current = current.def.innerType
        continue

      case 'optional':
        required = false
        current = current.def.innerType
        continue

      case 'effects':
        current = current.def.schema
        continue

      case 'pipeline':
        current = current.def.out
        continue
    }

    break
  }

  return {
    schema: current,
    required,
    defaultValue
  }
}

function buildName(parent: string | undefined, key: string) {
  return parent ? `${parent}.${key}` : key
}

export function zodSchemaToFormfields<T extends Record<string, any>>(
  schema: ZodObject,
  rootName?: string
): FormField<T>[] {
  return parseObject(schema, rootName)
}

function parseObject<T>(
  schema: ZodObject,
  parentName?: string
): FormField<T>[] {
  const fields: FormField<T>[] = []
  const shape = schema.shape

  for (const key in shape) {
    const raw = shape[key]
    const { schema: inner, required, defaultValue } = unwrap(raw)

    const name = buildName(parentName, key)
    const label = key
    const hint = inner.description

    // object → group
    if (inner instanceof ZodObject) {
      fields.push({
        type: 'group',
        name,
        label,
        hint,
        children: parseObject(inner, name)
      })
      continue
    }

    // array
    if (inner instanceof ZodArray) {
      const element = unwrap(inner.element as ZodType).schema
      if (element instanceof ZodObject) {
        fields.push({
          type: 'array-group',
          name,
          label,
          hint,
          required,
          defaultValue,
          children: parseObject(element)
        })
      } else {
        fields.push({
          type: 'array',
          name,
          label,
          hint,
          required,
          defaultValue
        })
      }
      continue
    }

    if (inner instanceof ZodString) {
      fields.push({
        type: 'text',
        name,
        label,
        hint,
        required,
        defaultValue
      })
      continue
    }
    if (inner instanceof ZodNumber) {
      if (inner.maxValue && inner.minValue && !inner.isInt && !inner.isFinite) {
        fields.push({
          type: 'slider',
          name,
          label,
          hint,
          required,
          defaultValue,
          min: inner.minValue!,
          max: inner.maxValue!
        })
      } else {
        fields.push({
          type: 'number',
          name,
          label,
          hint,
          required,
          defaultValue
        })
      }
      continue
    }

    if (inner instanceof ZodBoolean) {
      fields.push({
        type: 'boolean',
        name,
        label,
        hint,
        required,
        defaultValue
      })
      continue
    }

    if (inner instanceof ZodEnum) {
      fields.push({
        type: 'select',
        name,
        label,
        hint,
        required,
        defaultValue,
        options: inner.options.map((v) => ({
          label: String(v),
          value: String(v)
        }))
      })
      continue
    }

    // fallback
    fields.push({
      type: 'text',
      name,
      label,
      hint,
      required,
      defaultValue
    })
  }

  return fields
}
