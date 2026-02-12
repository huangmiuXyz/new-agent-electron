import {
  ZodType,
  ZodObject,
  ZodString,
  ZodNumber,
  ZodBoolean,
  ZodEnum,
  ZodArray,
  ZodRecord,
  ZodUnion,
  ZodLiteral,
} from 'zod'

interface UnwrapResult {
  schema: ZodType<any, any>
  required: boolean
  defaultValue?: any
  metadata?: any
}

function unwrap(schema: ZodType): UnwrapResult {
  let current: any = schema
  let required = true
  let defaultValue: unknown = undefined
  let metadata: any[] = []

  const updateMetadata = (s: any) => {
    const meta = typeof s.meta === 'function' ? s.meta() : undefined
    const description = s.description || s._def?.description
    if (meta || description) {
      metadata.push({ ...meta, description })
    }
  }

  // 递归展开包装类型（optional, default, effects, pipeline, nullable）
  while (current) {
    updateMetadata(current)
    const def = current.def
    if (!def) break

    const type = def.type

    if (type === 'default') {
      defaultValue =
        typeof def.defaultValue === 'function' ? def.defaultValue() : def.defaultValue
      required = false
      current = def.innerType
    } else if (type === 'optional' || type === 'nullable') {
      required = false
      current = def.innerType
    } else if (type === 'effects') {
      current = def.schema
    } else if (type === 'pipeline') {
      current = def.out
    } else {
      break
    }
  }

  updateMetadata(current)

  return {
    schema: current,
    required,
    defaultValue,
    metadata: metadata.filter(Boolean).reduce((acc, curr) => ({ ...acc, ...curr }), {})
  }
}

function buildName(parent: string | undefined, key: string) {
  return parent ? `${parent}.${key}` : key
}

// 获取 ZodLiteral 的值（Zod v4）
function getLiteralValue(schema: any): unknown {
  return schema?._zod?.def?.values?.[0]
}

export function zodSchemasToFormfields<T extends Record<string, any>>(
  schema: ZodObject<any>,
  rootName?: string
): FormField<T>[] {
  return parseObject(schema, rootName)
}
function getNumberRange(schema: ZodNumber) {
  const bag = schema?._zod?.bag
  if (!bag) return null

  const min =
    typeof bag.minimum === 'number' ? bag.minimum : undefined
  const max =
    typeof bag.maximum === 'number' ? bag.maximum : undefined

  return { min, max }
}

function parseObject<T>(schema: ZodObject<any>, parentName?: string): FormField<T>[] {
  const fields: FormField<T>[] = []
  const shape = schema.shape

  for (const key in shape) {
    const raw = shape[key]

    const { schema: inner, required, defaultValue, metadata } = unwrap(raw)

    const name = buildName(parentName, key)
    const label = key
    const hint = metadata?.description || ''
    // object → group
    if (inner instanceof ZodObject) {
      fields.push({
        type: 'group',
        name,
        label,
        hint,
        children: parseObject(inner, name),
        ...metadata
      })
      continue
    }

    // array
    if (inner instanceof ZodArray) {
      const elementResult = unwrap(inner.element as ZodType)
      const element = elementResult.schema
      if (element instanceof ZodObject) {
        fields.push({
          type: 'array-group',
          name,
          label,
          hint,
          required,
          defaultValue,
          children: parseObject(element),
          ...metadata
        })
      } else if (element instanceof ZodUnion) {
        const unionOptions = element.options.map((opt) => {
          const { schema: optSchema } = unwrap(opt as ZodType)
          if (optSchema instanceof ZodObject) {
            const shape = (optSchema as ZodObject<any>).shape
            const typeField = shape.type
            let typeValue = 'unknown'
            const unwrappedType = typeField ? unwrap(typeField as ZodType) : null
            if (unwrappedType?.schema instanceof ZodLiteral) {
              typeValue = String(getLiteralValue(unwrappedType.schema))
            }
            return {
              type: typeValue,
              fields: parseObject(optSchema as ZodObject<any>)
            }
          }
          return { type: 'unknown', fields: [] }
        })
        fields.push({
          type: 'array-union',
          name,
          label,
          hint,
          required,
          defaultValue,
          options: unionOptions,
          ...metadata
        })
      } else {
        fields.push({
          type: 'array',
          name,
          label,
          hint,
          required,
          defaultValue,
          ...metadata
        })
      }
      continue
    }

    // record
    if (inner instanceof ZodRecord) {
      const valueSchema = inner.valueType
      const { schema: valueInner } = unwrap(valueSchema as ZodType)

      if (valueInner instanceof ZodObject) {
        fields.push({
          type: 'record-group',
          name,
          label,
          hint,
          required,
          defaultValue,
          children: parseObject(valueInner),
          ...metadata
        } as any)
      } else {
        const isNumberValue = valueInner instanceof ZodNumber
        fields.push({
          type: 'object',
          name,
          label,
          hint,
          required,
          defaultValue,
          valueType: isNumberValue ? 'number' : 'string',
          ...metadata
        } as any)
      }
      continue
    }

    if (inner instanceof ZodString) {
      const def = (inner as any).def
      const checks = def?.checks || []
      const isEmail = checks.some((c: any) => c.kind === 'email')
      const isUrl = checks.some((c: any) => c.kind === 'url')

      fields.push({
        type: 'text',
        name,
        label,
        hint,
        required,
        defaultValue,
        placeholder: isEmail ? 'example@email.com' : isUrl ? 'https://...' : undefined,
        ...metadata
      } as any)
      continue
    }

    if (inner instanceof ZodNumber) {
      const range = getNumberRange(inner)
      if (typeof (range?.max) === 'number' && typeof range.min === 'number') {
        fields.push({
          type: 'slider',
          name,
          label,
          hint,
          required,
          defaultValue,
          min: range.min!,
          max: range.max!,
          ...metadata
        })
      } else {
        fields.push({
          type: 'number',
          name,
          label,
          hint,
          required,
          defaultValue,
          ...metadata
        } as any)
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
        defaultValue,
        ...metadata
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
        })),
        ...metadata
      })
      continue
    }

    // union - 用于 content 数组项等多类型场景
    if (inner instanceof ZodUnion) {
      const unionOptions = inner.options.map((opt) => {
        const { schema: optSchema } = unwrap(opt as ZodType)
        if (optSchema instanceof ZodObject) {
          const shape = (optSchema as ZodObject<any>).shape
          const typeField = shape.type
          let typeValue = 'unknown'
          // 尝试获取 literal 值，考虑可能的包装层
          const unwrappedType = typeField ? unwrap(typeField as ZodType) : null
          if (unwrappedType?.schema instanceof ZodLiteral) {
            typeValue = String(getLiteralValue(unwrappedType.schema))
          } else if (typeField instanceof ZodLiteral) {
            typeValue = String(getLiteralValue(typeField))
          }
          return {
            type: typeValue,
            fields: parseObject(optSchema as ZodObject<any>)
          }
        }
        return { type: 'unknown', fields: [] }
      })

      fields.push({
        type: 'union',
        name,
        label,
        hint,
        required,
        defaultValue,
        options: unionOptions,
        ...metadata
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
      defaultValue,
      ...metadata
    })
  }
  return fields
}
