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

// 用于对象模式的临时数组形式（方便渲染）
const objectEntries = computed(() => {
    if (props.mode !== 'object') return []
    return Object.entries(objectModel.value).map(([key, value]) => ({ key, value }))
})

// 添加项
const addItem = () => {
    if (props.disabled) return

    if (props.mode === 'array') {
        arrayModel.value = [...arrayModel.value, '']
    } else {
        // 为对象模式添加一个临时的空键值对
        const newKey = `key_${Date.now()}`
        objectModel.value = { ...objectModel.value, [newKey]: '' }
    }
}

// 删除项
const removeItem = (index: number, key?: string) => {
    if (props.disabled) return

    if (props.mode === 'array') {
        const newArray = [...arrayModel.value]
        newArray.splice(index, 1)
        arrayModel.value = newArray
    } else if (key) {
        const newObject = { ...objectModel.value }
        delete newObject[key]
        objectModel.value = newObject
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
const updateObjectKey = (oldKey: string, newKey: string) => {
    if (props.disabled || oldKey === newKey) return

    const newObject = { ...objectModel.value }
    const value = newObject[oldKey]
    delete newObject[oldKey]
    newObject[newKey] = value
    objectModel.value = newObject
}

// 更新对象的值
const updateObjectValue = (key: string, value: string) => {
    if (props.disabled) return

    objectModel.value = { ...objectModel.value, [key]: value }
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
                    <button type="button" class="remove-btn" :disabled="disabled" @click="removeItem(index)">
                        <Close />
                    </button>
                </div>
            </template>

            <!-- 对象模式（键值对） -->
            <template v-else>
                <div v-for="({ key, value }, index) in objectEntries" :key="`object-${key}`"
                    class="input-group-item input-group-item--pair">
                    <Input :model-value="key" :placeholder="keyPlaceholder" :disabled="disabled" size="sm"
                        class="key-input" @update:model-value="(newKey) => updateObjectKey(key, newKey as string)" />
                    <span class="separator">=</span>
                    <Input :model-value="value" :placeholder="valuePlaceholder" :disabled="disabled" size="sm"
                        class="value-input"
                        @update:model-value="(newValue) => updateObjectValue(key, newValue as string)" />
                    <button type="button" class="remove-btn" :disabled="disabled" @click="removeItem(index, key)">
                        <Close />
                    </button>
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
    gap: 8px;
}

.input-group-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
}

.input-group-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-secondary);
}

.input-group-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.input-group-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    background: #fafafa;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    transition: all 0.2s;
}

.input-group-item:hover {
    background: #f5f5f5;
    border-color: var(--border-hover, #d1d1d1);
}

.input-group-item--pair {
    display: grid;
    grid-template-columns: 1fr auto 1fr auto;
    gap: 8px;
}

.separator {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    color: var(--text-tertiary);
    font-weight: 600;
}

.key-input,
.value-input {
    flex: 1;
}

.remove-btn {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-tertiary);
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.2s;
}

.remove-btn:hover:not(:disabled) {
    background: rgba(255, 71, 87, 0.1);
    color: #ff4757;
}

.remove-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.add-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 12px;
    border: 1px dashed var(--border-subtle);
    background: transparent;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 500;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
}

.add-btn:hover:not(:disabled) {
    border-color: var(--text-secondary);
    background: #fafafa;
    color: var(--text-primary);
}

.add-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

/* 列表动画 */
.list-enter-active,
.list-leave-active {
    transition: all 0.3s ease;
}

.list-enter-from {
    opacity: 0;
    transform: translateY(-10px);
}

.list-leave-to {
    opacity: 0;
    transform: translateX(10px);
}

.list-move {
    transition: transform 0.3s ease;
}
</style>
