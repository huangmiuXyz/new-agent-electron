<script setup lang="ts">
export interface Option {
    label: string
    value: string | number
}

interface Props {
    options: Option[]
    placeholder?: string
    disabled?: boolean
    size?: 'md' | 'sm'
}

const modelValue = defineModel<string | number>()
withDefaults(defineProps<Props>(), {
    options: () => [],
    placeholder: '',
    disabled: false,
    size: 'md'
})
</script>

<template>
    <div :class="['select-wrapper', `select--${size}`, { disabled }]">
        <select v-model="modelValue" :disabled="disabled" class="form-select">
            <option v-if="placeholder" value="" disabled selected>{{ placeholder }}</option>
            <option v-for="option in options" :key="option.value" :value="option.value">
                {{ option.label }}
            </option>
        </select>
        <div class="select-arrow">
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
                    stroke-linejoin="round" />
            </svg>
        </div>
    </div>
</template>

<style scoped>
.select-wrapper {
    position: relative;
    width: 100%;
}

.form-select {
    width: 100%;
    appearance: none;
    border: 1px solid var(--border-subtle);
    outline: none;
    transition: border 0.2s, box-shadow 0.2s;
    color: var(--text-primary);
    font-family: inherit;
    background-color: #fff;
    cursor: pointer;
}

.select--md .form-select {
    padding: 8px 30px 8px 10px;
    font-size: 13px;
    border-radius: 6px;
}

.select--sm .form-select {
    padding: 4px 24px 4px 8px;
    font-size: 12px;
    border-radius: 4px;
}

.form-select:focus {
    border-color: var(--text-secondary);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.05);
}

.form-select:disabled {
    background-color: #f5f5f5;
    color: #999;
    cursor: not-allowed;
}

.select-arrow {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
    color: var(--text-tertiary);
    display: flex;
    align-items: center;
}

.select--sm .select-arrow {
    right: 6px;
}

.select--sm .select-arrow svg {
    width: 8px;
    height: 5px;
}
</style>
