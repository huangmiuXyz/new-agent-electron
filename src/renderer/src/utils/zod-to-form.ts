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
  metadata?: any
}

function unwrap(schema: ZodType): UnwrapResult {
  let current: any = schema
  let required = true
  let defaultValue: unknown = undefined
  let metadata: any[] = []

  const updateMetadata = (s: any) => {
    metadata.push(s.meta())
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

  // 最后检查最内层 schema 的描述
  updateMetadata(current)

  console.log(metadata);
  return {
    schema: current,
    required,
    defaultValue,
    metadata: metadata.filter(Boolean)?.[0]
  }
}

function buildName(parent: string | undefined, key: string) {
  return parent ? `${parent}.${key}` : key
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
