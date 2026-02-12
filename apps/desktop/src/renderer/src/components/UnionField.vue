<template>
  <div class="union-field">
    <div class="union-items" v-if="modelValue.length">
      <div v-for="(item, index) in modelValue" :key="index" class="union-item">
        <div class="union-item-header">
          <div class="union-item-type">{{ item.type }}</div>
          <Button variant="text" size="sm" class="remove-btn" @click="removeItem(index)">
            <CloseIcon />
          </Button>
        </div>
        <div class="union-item-content">
          <ItemForm :fields="getFields(item.type)" :data="item" @update="(data) => updateItem(index, data)" />
        </div>
      </div>
    </div>
    <div class="union-add">
      <button v-for="opt in options" :key="opt.type" type="button" class="add-item-btn" @click="addItem(opt.type)">
        <PlusIcon />
        <span>添加 {{ opt.type }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
const CloseIcon = useIcon('Close')
const PlusIcon = useIcon('Plus')

const props = defineProps<{
  modelValue: any[]
  label?: string
  options: Array<{
    type: string
    fields: Array<{
      name: string
      label: string
      type: string
      required?: boolean
      hint?: string
      options?: Array<{ label: string; value: string }>
      min?: number
      max?: number
    }>
  }>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: any[]]
}>()

const getFields = (type: string) => {
  const option = props.options.find((o) => o.type === type)
  return option?.fields.filter((f) => f.name !== 'type') || []
}

const getDefaultValue = (fieldType: string) => {
  switch (fieldType) {
    case 'boolean':
      return false
    case 'number':
      return 0
    case 'slider':
      return 0
    case 'select':
      return ''
    case 'textarea':
      return ''
    default:
      return ''
  }
}

// 子组件：为每个 item 创建 useForm
const ItemForm = defineComponent({
  props: {
    fields: { type: Array, required: true },
    data: { type: Object, required: true }
  },
  emits: ['update'],
  setup(props, { emit }) {
    const [FormComponent] = useForm({
      fields: props.fields as any,
      initialData: props.data,
      onChange: (_field, _value, data) => {
        emit('update', data)
      }
    })

    return () => h(FormComponent, { size: 'sm' })
  }
})

const addItem = (type: string) => {
  const option = props.options.find((o) => o.type === type)
  if (!option) return

  const newItem: any = { type }
  option.fields.forEach((field) => {
    if (field.name !== 'type') {
      newItem[field.name] = getDefaultValue(field.type)
    }
  })

  emit('update:modelValue', [...props.modelValue, newItem])
}

const removeItem = (index: number) => {
  const newValue = [...props.modelValue]
  newValue.splice(index, 1)
  emit('update:modelValue', newValue)
}

const updateItem = (index: number, data: any) => {
  const newValue = [...props.modelValue]
  newValue[index] = { ...newValue[index], ...data }
  emit('update:modelValue', newValue)
}
</script>

<style scoped>
.union-field {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.union-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.union-items {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.union-item {
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  padding: 12px;
  background: var(--bg-secondary);
}

.union-item-header {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-subtle);
}

.union-item-header :deep(.select) {
  flex: 1;
}

.remove-btn {
  color: var(--text-tertiary);
  padding: 4px !important;
  height: 28px !important;
  width: 28px !important;
}

.remove-btn:hover {
  color: #ff4d4f;
  background: rgba(255, 77, 79, 0.1);
}

.union-item-type {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  padding: 4px 0;
}

.union-item-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.union-add {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.add-item-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 4px;
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
</style>
