<script setup lang="ts">
import { useIcon } from '../composables/useIcon'

export interface CheckboxOption {
    label: string
    value: string
    description?: string
}

interface Props {
    options: CheckboxOption[]
    disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
    options: () => [],
    disabled: false
})

const modelValue = defineModel<string[]>({ default: [] })

const toggleOption = (value: string) => {
    if (props.disabled) return

    if (modelValue.value.includes(value)) {
        modelValue.value = modelValue.value.filter((v) => v !== value)
    } else {
        modelValue.value = [...modelValue.value, value]
    }
}

const isChecked = (value: string) => {
    return modelValue.value.includes(value)
}

const checkIcon = useIcon('Check')
</script>

<template>
    <div class="checkbox-group">
        <div v-for="option in options" :key="option.value" class="checkbox-item"
            :class="{ disabled, checked: isChecked(option.value) }" @click="toggleOption(option.value)">
            <div class="checkbox">
                <div class="checkbox-box">
                    <checkIcon v-if="isChecked(option.value)" />
                </div>
            </div>
            <div class="checkbox-content">
                <div class="checkbox-label">{{ option.label }}</div>
                <div v-if="option.description" class="checkbox-description">
                    {{ option.description }}
                </div>
            </div>
        </div>
        <div v-if="options.length === 0" class="empty-message">暂无可用选项</div>
    </div>
</template>

<style scoped>
.checkbox-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.checkbox-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
    background: #fff;
}

.checkbox-item:hover:not(.disabled) {
    border-color: var(--border-hover, #d1d1d1);
    background: #fafafa;
}

.checkbox-item.checked {
    border-color: var(--accent-color, #000);
    background: #fafafa;
}

.checkbox-item.disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.checkbox {
    flex-shrink: 0;
    padding-top: 2px;
}

.checkbox-box {
    width: 18px;
    height: 18px;
    border: 2px solid var(--border-subtle);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    background: #fff;
}

.checkbox-item.checked .checkbox-box {
    background: var(--accent-color, #000);
    border-color: var(--accent-color, #000);
}

.checkbox-box :deep(svg) {
    font-size: 12px;
    color: #fff;
}

.checkbox-content {
    flex: 1;
    min-width: 0;
}

.checkbox-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 2px;
}

.checkbox-description {
    font-size: 11px;
    color: var(--text-tertiary);
    line-height: 1.3;
}

.empty-message {
    padding: 20px;
    text-align: center;
    color: var(--text-tertiary);
    font-size: 12px;
    background: #fafafa;
    border-radius: 6px;
    border: 1px dashed var(--border-subtle);
}
</style>
