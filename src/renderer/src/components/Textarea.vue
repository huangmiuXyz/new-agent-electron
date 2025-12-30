<script setup lang="ts">
interface Props {
    placeholder?: string
    disabled?: boolean
    readonly?: boolean
    size?: 'md' | 'sm'
    rows?: number
    autoResize?: boolean
}

const modelValue = defineModel<string>()
const props = withDefaults(defineProps<Props>(), {
    placeholder: '',
    disabled: false,
    readonly: false,
    size: 'md',
    rows: 3,
    autoResize: false
})

const emit = defineEmits<{
    blur: [event: FocusEvent]
    focus: [event: FocusEvent]
}>()

const handleBlur = (event: FocusEvent) => {
    emit('blur', event)
}

const handleFocus = (event: FocusEvent) => {
    emit('focus', event)
}

const textareaRef = useTemplateRef('textareaRef')

// Auto-resize functionality
const handleInput = () => {
    if (props.autoResize && textareaRef.value) {
        textareaRef.value.style.height = 'auto'
        textareaRef.value.style.height = textareaRef.value.scrollHeight + 'px'
    }
}

onMounted(() => {
    if (props.autoResize) {
        handleInput()
    }
})

watch(modelValue, () => {
    if (props.autoResize) {
        nextTick(() => {
            handleInput()
        })
    }
})

defineExpose({
    focus: () => {
        textareaRef.value?.focus()
    }
})
</script>

<template>
    <textarea ref="textareaRef" :placeholder="placeholder" :disabled="disabled" :readonly="readonly" :rows="rows"
        v-model="modelValue" :class="['form-textarea', `form-textarea--${size}`]" @blur="handleBlur"
        @focus="handleFocus" @input="handleInput" />
</template>

<style scoped>
.form-textarea {
    width: 100%;
    border: 1px solid var(--border-subtle);
    outline: none;
    transition: border 0.2s, box-shadow 0.2s;
    color: var(--text-primary);
    font-family: inherit;
    background-color: var(--bg-input);
    resize: vertical;
}

.form-textarea--md {
    padding: 8px 10px;
    font-size: 13px;
    border-radius: 6px;
}

.form-textarea--sm {
    padding: 4px 8px;
    font-size: 12px;
    border-radius: 4px;
}

.form-textarea:focus {
    border-color: var(--text-secondary);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.05);
}

.form-textarea:disabled {
    background-color: var(--bg-disabled);
    color: var(--text-disabled);
    cursor: not-allowed;
}

.form-textarea::placeholder {
    color: var(--text-placeholder);
}
</style>
