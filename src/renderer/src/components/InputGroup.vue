<script setup lang="ts">
/**
 * InputGroup 组件
 * 用于动态添加/删除参数和环境变量
 * 
 * mode='array': 用于参数列表（字符串数组）
 * mode='object': 用于环境变量（键值对对象）
 */

interface Props {
    mode?: 'array' | 'object'
    placeholder?: string
    keyPlaceholder?: string
    valuePlaceholder?: string
    label?: string
    disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
    mode: 'array',
    placeholder: '添加项',
    keyPlaceholder: '键',
    valuePlaceholder: '值',
    disabled: false
})

const { Plus, Close } = useIcon(['Plus', 'Close'])

// 数组模式的数据
const arrayModel = defineModel<string[]>('arrayValue', { default: [] })
// 对象模式的数据
const objectModel = defineModel<Record<string, string>>('objectValue', { default: {} })

// 对象模式的待添加项（尚未保存到 model 的新项）
interface PendingItem {
    id: string
    key: string
    value: string
}
const pendingItems = ref<PendingItem[]>([])

// 用于对象模式的完整列表（已保存的 + 待添加的）
const objectEntries = computed(() => {
    if (props.mode !== 'object') return []

    // 已保存的项
    const saved = Object.entries(objectModel.value).map(([key, value]) => ({
        id: key,
        key,
        value,
        isPending: false
    }))

    // 待添加的项
    const pending = pendingItems.value.map(item => ({
        ...item,
        isPending: true
    }))

    return [...saved, ...pending]
})

// 添加项
const addItem = () => {
    if (props.disabled) return

    if (props.mode === 'array') {
        arrayModel.value = [...arrayModel.value, '']
    } else {
        // 为对象模式添加一个待添加项（不立即保存到 model）
        pendingItems.value.push({
            id: `pending_${nanoid()}`,
            key: '',
            value: ''
        })
    }
}

// 删除项
const removeItem = (id: string, isPending: boolean) => {
    if (props.disabled) return

    if (props.mode === 'array') {
        // array mode uses index as id
        const index = parseInt(id)
        const newArray = [...arrayModel.value]
        newArray.splice(index, 1)
        arrayModel.value = newArray
    } else {
        if (isPending) {
            // 删除待添加项
            pendingItems.value = pendingItems.value.filter(item => item.id !== id)
        } else {
            // 删除已保存项
            const newObject = { ...objectModel.value }
            delete newObject[id]
            objectModel.value = newObject
        }
    }
}

// 更新数组项
const updateArrayItem = (index: number, value: string) => {
    if (props.disabled) return

    const newArray = [...arrayModel.value]
    newArray[index] = value
    arrayModel.value = newArray
}

// 更新对象的键
const updateObjectKey = (id: string, newKey: string, isPending: boolean) => {
    if (props.disabled) return

    if (isPending) {
        // 更新待添加项的键
        const item = pendingItems.value.find(item => item.id === id)
        if (item) {
            item.key = newKey
            // 如果键和值都有内容，保存到 model
            if (newKey.trim() && item.value.trim()) {
                objectModel.value = { ...objectModel.value, [newKey]: item.value }
                pendingItems.value = pendingItems.value.filter(i => i.id !== id)
            }
        }
    } else {
        // 更新已保存项的键
        const oldKey = id
        if (oldKey === newKey) return

        const newObject = { ...objectModel.value }
        const value = newObject[oldKey]
        delete newObject[oldKey]
        if (newKey.trim()) {
            newObject[newKey] = value
        }
        objectModel.value = newObject
    }
}

// 更新对象的值
const updateObjectValue = (id: string, newValue: string, isPending: boolean) => {
    if (props.disabled) return

    if (isPending) {
        // 更新待添加项的值
        const item = pendingItems.value.find(item => item.id === id)
        if (item) {
            item.value = newValue
            // 如果键和值都有内容，保存到 model
            if (item.key.trim() && newValue.trim()) {
                objectModel.value = { ...objectModel.value, [item.key]: newValue }
                pendingItems.value = pendingItems.value.filter(i => i.id !== id)
            }
        }
    } else {
        // 更新已保存项的值
        objectModel.value = { ...objectModel.value, [id]: newValue }
    }
}
</script>

<template>
    <div class="input-group">
        <div v-if="label" class="input-group-header">
            <span class="input-group-label">{{ label }}</span>
        </div>

        <TransitionGroup name="list" tag="div" class="input-group-list">
            <!-- 数组模式 -->
            <template v-if="mode === 'array'">
                <div v-for="(item, index) in arrayModel" :key="`array-${index}`" class="input-group-item">
                    <Input :model-value="item" :placeholder="placeholder" :disabled="disabled" size="sm"
                        @update:model-value="(value) => updateArrayItem(index, value as string)" />
                    <Button variant="text" size="sm" :disabled="disabled" @click="removeItem(String(index), false)">
                        <Close />
                    </Button>
                </div>
            </template>

            <!-- 对象模式（键值对） -->
            <template v-else>
                <div v-for="entry in objectEntries" :key="`object-${entry.id}`"
                    class="input-group-item input-group-item--pair">
                    <Input :model-value="entry.key" :placeholder="keyPlaceholder" :disabled="disabled" size="sm"
                        class="key-input"
                        @update:model-value="(newKey) => updateObjectKey(entry.id, newKey as string, entry.isPending)" />
                    <span class="separator">=</span>
                    <Input :model-value="entry.value" :placeholder="valuePlaceholder" :disabled="disabled" size="sm"
                        class="value-input"
                        @update:model-value="(newValue) => updateObjectValue(entry.id, newValue as string, entry.isPending)" />
                    <Button variant="text" size="sm" :disabled="disabled"
                        @click="removeItem(entry.id, entry.isPending)">
                        <Close />
                    </Button>
                </div>
            </template>
        </TransitionGroup>

        <button type="button" class="add-btn" :disabled="disabled" @click="addItem">
            <Plus />
            <span>{{ mode === 'array' ? '添加参数' : '添加环境变量' }}</span>
        </button>
    </div>
</template>

<style scoped>
.input-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.input-group-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 2px;
}

.input-group-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary);
}

.input-group-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.input-group-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
}

.input-group-item--pair {
    display: grid;
    grid-template-columns: 1fr auto 1fr auto;
    align-items: center;
}

.separator {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    font-size: 14px;
    color: var(--text-tertiary);
    font-weight: 500;
}


.add-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    width: 100%;
    padding: 4px;
    border: 1px dashed var(--border-subtle);
    background: var(--bg-hover);
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 500;
    border-radius: 8px;
    cursor: pointer;
}

.add-btn:hover:not(:disabled) {
    border-color: var(--text-primary);
    background: var(--border-color-light);
    color: var(--text-primary);
}

.add-btn:active:not(:disabled) {
    background: var(--border-color-medium);
}

.add-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}
</style>
