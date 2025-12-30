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
    clearable?: boolean
}

const modelValue = defineModel<string | number>()
withDefaults(defineProps<Props>(), {
    options: () => [],
    placeholder: '',
    disabled: false,
    size: 'md',
    clearable: false
})

const clearValue = () => {
    modelValue.value = ''
}
</script>

<template>
    <div :class="['select-wrapper', `select--${size}`, { disabled }]">
        <select v-model="modelValue" :disabled="disabled" class="form-select">
            <option v-if="placeholder" value="" disabled selected>{{ placeholder }}</option>
            <option v-for="option in options" :key="option.value" :value="option.value">
                {{ option.label }}
            </option>
        </select>
        <div v-if="clearable && modelValue && !disabled" class="select-clear" @click="clearValue" title="清空">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 3L3 9M3 3L9 9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"
                    stroke-linejoin="round" />
            </svg>
        </div>
        <div class="select-arrow" :class="{ 'has-clear': clearable && modelValue && !disabled }">
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
    background-color: var(--bg-input);
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
    background-color: var(--bg-disabled);
    color: var(--text-disabled);
    cursor: not-allowed;
}

.select-clear {
    position: absolute;
    right: 30px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-tertiary);
    display: flex;
    align-items: center;
    cursor: pointer;
    opacity: 0.7;
    transition: opacity 0.2s;
}

.select-clear:hover {
    opacity: 1;
}

.select--sm .select-clear {
    right: 24px;
}

.select--sm .select-clear svg {
    width: 10px;
    height: 10px;
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

.select-arrow.has-clear {
    right: 10px;
}

.select--sm .select-arrow {
    right: 6px;
}

.select--sm .select-arrow.has-clear {
    right: 6px;
}

.select--sm .select-arrow svg {
    width: 8px;
    height: 5px;
}
</style>
