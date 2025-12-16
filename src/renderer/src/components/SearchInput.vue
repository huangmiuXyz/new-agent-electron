<script setup lang="ts">
interface Props {
    modelValue?: string
    placeholder?: string
    size?: 'sm' | 'md' | 'lg'
    disabled?: boolean
    autofocus?: boolean
    clearable?: boolean
    showIcon?: boolean
    iconPosition?: 'left' | 'right'
    variant?: 'default' | 'minimal' | 'underlined'
    debounce?: number
    width?: string
}

const props = withDefaults(defineProps<Props>(), {
    modelValue: '',
    placeholder: '搜索...',
    size: 'md',
    disabled: false,
    autofocus: false,
    clearable: true,
    showIcon: true,
    iconPosition: 'left',
    variant: 'default',
    debounce: 300,
    width: '100%'
})

const emit = defineEmits<{
    'update:modelValue': [value: string]
    'search': [value: string]
    'clear': []
    'focus': [event: FocusEvent]
    'blur': [event: FocusEvent]
    'keydown': [event: KeyboardEvent]
}>()

const { Search, Close } = useIcon(['Search', 'Close'])

const searchInput = ref<HTMLInputElement | null>(null)
const isFocused = ref(false)
const localValue = ref(props.modelValue || '')
const debouncedValue = ref('')

// 内部值与外部值同步
watch(() => props.modelValue, (newValue) => {
    localValue.value = newValue || ''
})

// 防抖处理
let debounceTimer: NodeJS.Timeout | null = null

const updateValue = (value: string) => {
    localValue.value = value
    emit('update:modelValue', value)

    if (debounceTimer) {
        clearTimeout(debounceTimer)
    }

    if (props.debounce > 0) {
        debounceTimer = setTimeout(() => {
            debouncedValue.value = value
            emit('search', value)
        }, props.debounce)
    } else {
        debouncedValue.value = value
        emit('search', value)
    }
}

const handleInput = (event: Event) => {
    const value = (event.target as HTMLInputElement).value
    updateValue(value)
}

const handleClear = () => {
    updateValue('')
    emit('clear')
    searchInput.value?.focus()
}

const handleFocus = (event: FocusEvent) => {
    isFocused.value = true
    emit('focus', event)
}

const handleBlur = (event: FocusEvent) => {
    isFocused.value = false
    emit('blur', event)
}

const handleKeydown = (event: KeyboardEvent) => {
    emit('keydown', event)
}

// 自动聚焦
onMounted(() => {
    if (props.autofocus) {
        nextTick(() => {
            searchInput.value?.focus()
        })
    }
})

// 暴露方法
defineExpose({
    focus: () => searchInput.value?.focus(),
    blur: () => searchInput.value?.blur(),
    select: () => searchInput.value?.select(),
    clear: handleClear
})
</script>

<template>
    <div class="search-input-container" :class="[
        `search-input--${size}`,
        `search-input--${variant}`,
        { 'search-input--focused': isFocused },
        { 'search-input--disabled': disabled }
    ]" :style="{ width }">
        <!-- 搜索图标 -->
        <div v-if="showIcon && iconPosition === 'left'" class="search-input__icon search-input__icon--left">
            <Search />
        </div>

        <!-- 输入框 -->
        <input ref="searchInput" :value="localValue" :placeholder="placeholder" :disabled="disabled"
            :class="['search-input__field']" @input="handleInput" @focus="handleFocus" @blur="handleBlur"
            @keydown="handleKeydown" autocomplete="off" />

        <!-- 清除按钮 -->
        <button v-if="clearable && localValue && !disabled" type="button" class="search-input__clear"
            @click="handleClear" @mousedown.prevent>
            <Close />
        </button>

        <!-- 右侧图标 -->
        <div v-if="showIcon && iconPosition === 'right'" class="search-input__icon search-input__icon--right">
            <Search />
        </div>
    </div>
</template>

<style scoped>
.search-input-container {
    position: relative;
    display: flex;
    align-items: center;
    transition: all 0.2s ease;
}

/* 默认样式 */
.search-input--default {
    background-color: #fff;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    overflow: hidden;
}

.search-input--default.search-input--focused {
    border-color: var(--text-secondary);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.05);
}

/* 极简样式 */
.search-input--minimal {
    background-color: transparent;
    border: none;
    border-bottom: 1px solid var(--border-subtle);
    border-radius: 0;
}

.search-input--minimal.search-input--focused {
    border-bottom-color: var(--text-secondary);
}

/* 下划线样式 */
.search-input--underlined {
    background-color: transparent;
    border: none;
    border-radius: 0;
    position: relative;
}

.search-input--underlined::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 1px;
    background-color: var(--border-subtle);
    transition: background-color 0.2s ease;
}

.search-input--underlined.search-input--focused::after {
    background-color: var(--text-secondary);
}

/* 尺寸样式 */
.search-input--sm {
    height: 28px;
}

.search-input--md {
    height: 36px;
}

.search-input--lg {
    height: 44px;
}

/* 输入框样式 */
.search-input__field {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    color: var(--text-primary);
    font-family: inherit;
    width: 100%;
    margin-left: 4px;
}

.search-input--sm .search-input__field {
    font-size: 12px;
    padding: 4px 8px;
}

.search-input--md .search-input__field {
    font-size: 14px;
    padding: 6px 12px;
}

.search-input--lg .search-input__field {
    font-size: 16px;
    padding: 8px 16px;
}

.search-input__field::placeholder {
    color: var(--text-tertiary);
}

/* 图标样式 */
.search-input__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-tertiary);
    transition: color 0.2s ease;
}

.search-input--focused .search-input__icon {
    color: var(--text-secondary);
}

.search-input__icon--left {
    padding-left: 8px;
}

.search-input__icon--right {
    padding-right: 8px;
}

.search-input--sm .search-input__icon {
    font-size: 14px;
    width: 14px;
    height: 14px;
}

.search-input--md .search-input__icon {
    font-size: 16px;
    width: 16px;
    height: 16px;
}

.search-input--lg .search-input__icon {
    font-size: 18px;
    width: 18px;
    height: 18px;
}

/* 清除按钮样式 */
.search-input__clear {
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--text-tertiary);
    cursor: pointer;
    padding: 2px;
    margin-right: 4px;
    border-radius: 2px;
    transition: all 0.2s ease;
}

.search-input__clear:hover {
    color: var(--text-secondary);
    background-color: rgba(0, 0, 0, 0.05);
}

.search-input--sm .search-input__clear {
    font-size: 12px;
    width: 12px;
    height: 12px;
}

.search-input--md .search-input__clear {
    font-size: 14px;
    width: 14px;
    height: 14px;
}

.search-input--lg .search-input__clear {
    font-size: 16px;
    width: 16px;
    height: 16px;
}

/* 禁用状态 */
.search-input--disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.search-input--disabled .search-input__field {
    cursor: not-allowed;
}

.search-input--disabled .search-input__clear {
    display: none;
}

/* 调整不同图标位置下的输入框内边距 */
.search-input--default .search-input__icon--left+.search-input__field {
    padding-left: 4px;
}

.search-input--default .search-input__clear+.search-input__icon--right {
    padding-right: 4px;
}

.search-input--minimal .search-input__icon--left+.search-input__field {
    padding-left: 4px;
}

.search-input--underlined .search-input__icon--left+.search-input__field {
    padding-left: 4px;
}
</style>