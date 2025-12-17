<script setup lang="ts" generic="T extends Array<any>">
import { z } from 'zod'


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
    enableAISearch?: boolean
    aiSearchPlaceholder?: string
    searchData?: T
    searchKey?: string
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
    width: '100%',
    enableAISearch: true,
    aiSearchPlaceholder: 'AI 搜索'
})

const emit = defineEmits<{
    'update:modelValue': [value: string]
    'focus': []
    'blur': []
    'ai-search': [results: T]
}>()

const { Search, Close, Sparkles } = useIcon(['Search', 'Close', 'Sparkles'])

const searchInput = ref<HTMLInputElement | null>(null)
const isFocused = ref(false)
const localValue = ref(props.modelValue || '')
const isAISearching = ref(false)

watch(() => props.modelValue, v => {
    localValue.value = v || ''
})

let debounceTimer: NodeJS.Timeout | null = null

const updateValue = (value: string) => {
    localValue.value = value
    emit('update:modelValue', value)
    if (debounceTimer) clearTimeout(debounceTimer)
    if (props.debounce > 0) {
        debounceTimer = setTimeout(() => { }, props.debounce)
    }
}

const handleInput = (e: Event) => {

    updateValue((e.target as HTMLInputElement).value)
}

const handleClear = () => {
    updateValue('')
    searchInput.value?.focus()
}

const handleFocus = () => {
    isFocused.value = true
    emit('focus')
}
const handleBlur = () => {
    isFocused.value = false
    emit('blur')
}

const handleAISearch = async () => {
    if (!localValue.value.trim() || isAISearching.value) return
    isAISearching.value = true

    if (!props.searchData!.length) {
        isAISearching.value = false
        return
    }

    const settings = useSettingsStore()
    const searchProviderId = settings.defaultModels.searchProviderId
    const searchModelId = settings.defaultModels.searchModelId

    if (!searchProviderId || !searchModelId) {
        isAISearching.value = false
        return
    }

    const { model, provider } = settings.getModelById(searchProviderId, searchModelId)
    if (!model || !provider) {
        isAISearching.value = false
        return
    }
    const { generateText } = chatService()
    const searchTool = {
        title: '返回结果',
        description: `
你已经基于搜索词和数据完成了语义搜索。
请在这里返回你认为“最相关”的${props.searchKey}。
只返回${props.searchKey}。
`,
        inputSchema: z.object({
            key: z
                .array(z.string())
        }),
        execute: async (args: any) => {
            const { key } = args
            return {
                toolResult: key
            }
        }
    }

    const prompt = `
搜索词：「${localValue.value}」

你将获得一组数据，请你：
1. 阅读并理解所有数据
2. 判断哪些数据与搜索词在语义上最相关
3. 在调用 return_result 工具时，提交你最终认定的${props.searchKey}

数据如下：
${JSON.stringify(props.searchData)}
`


    const result = await generateText(prompt, {
        model: model.name,
        apiKey: provider.apiKey!,
        baseURL: provider.baseUrl,
        provider: provider.name,
        providerType: provider.providerType,
        tools: { return_result: searchTool },
        toolChoice: {
            type: 'tool',
            toolName: 'return_result'
        }
    })
    const toolResults = (result.toolResults[0]!.output as { toolResult: number[] }).toolResult
    isAISearching.value = false
    emit('ai-search', props.searchData!.filter((data) => toolResults.find(res => res === data[props.searchKey!])) as T)
}

onMounted(() => {
    if (props.autofocus) nextTick(() => searchInput.value?.focus())
})

defineExpose({
    focus: () => searchInput.value?.focus(),
    blur: () => searchInput.value?.blur()
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
            autocomplete="off" />

        <!-- 清除按钮 -->
        <Button v-if="clearable && localValue && !disabled" variant="text" @click="handleClear" @mousedown.prevent>
            <Close />
        </Button>

        <!-- AI 搜索按钮 -->
        <Button v-if="enableAISearch && localValue && !disabled" size='sm' variant="text" @click="handleAISearch"
            :title="aiSearchPlaceholder" @mousedown.prevent>
            <Sparkles v-if="!isAISearching" />
            <Loading v-else size='mini' />
        </Button>

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

/* AI 搜索按钮样式 */
.search-input__ai-search {
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

.search-input__ai-search:hover {
    color: var(--text-secondary);
    background-color: rgba(0, 0, 0, 0.05);
}

.search-input__ai-search--loading {
    color: var(--accent);
}

.search-input--sm .search-input__ai-search {
    font-size: 12px;
    width: 12px;
    height: 12px;
}

.search-input--md .search-input__ai-search {
    font-size: 14px;
    width: 14px;
    height: 14px;
}

.search-input--lg .search-input__ai-search {
    font-size: 16px;
    width: 16px;
    height: 16px;
}

/* AI 搜索结果样式 */
.search-input__ai-result {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: #fff;
    border: 1px solid var(--border-subtle);
    border-top: none;
    border-radius: 0 0 6px 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    z-index: 1000;
    max-width: 100%;
    overflow: hidden;
}

.search-input__ai-result-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: rgba(249, 250, 251, 0.8);
    border-bottom: 1px solid var(--border-subtle);
}

.search-input__ai-result-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-primary);
}

.search-input__ai-result-icon {
    font-size: 14px;
    color: var(--accent);
}

.search-input__ai-result-close {
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--text-tertiary);
    cursor: pointer;
    padding: 2px;
    border-radius: 2px;
    transition: all 0.2s ease;
}

.search-input__ai-result-close:hover {
    color: var(--text-secondary);
    background-color: rgba(0, 0, 0, 0.05);
}

.search-input__ai-result-content {
    padding: 12px;
    font-size: 13px;
    line-height: 1.5;
    color: var(--text-primary);
    max-height: 200px;
    overflow-y: auto;
}

/* AI 结果动画 */
.ai-result-fade-enter-active,
.ai-result-fade-leave-active {
    transition: all 0.2s ease;
}

.ai-result-fade-enter-from,
.ai-result-fade-leave-to {
    opacity: 0;
    transform: translateY(-10px);
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}
</style>