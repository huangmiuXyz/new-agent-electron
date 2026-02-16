<script setup lang="ts">
import { useIcon } from '../composables/useIcon'

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

const groupedOptions = computed(() => {
    const groupMap = new Map<string, CheckboxOption[]>()
    const ungrouped: CheckboxOption[] = []

    for (const option of props.options) {
        if (option.group && option.group.trim()) {
            const key = option.group.trim()
            const list = groupMap.get(key) || []
            list.push(option)
            groupMap.set(key, list)
        } else {
            ungrouped.push(option)
        }
    }

    const groups = Array.from(groupMap.entries())
        .sort(([a], [b]) => a.localeCompare(b, 'zh-Hans-CN'))
        .map(([name, options]) => ({ name, options }))

    if (ungrouped.length > 0) {
        groups.unshift({ name: '', options: ungrouped })
    }

    return groups
})

const checkIcon = useIcon('Check')
</script>

<template>
    <div class="checkbox-group">
        <template v-for="group in groupedOptions" :key="group.name || '__ungrouped__'">
            <div v-if="group.name" class="checkbox-group-title">{{ group.name }}</div>
            <div v-for="option in group.options" :key="option.value" class="checkbox-item"
                :class="{ disabled, checked: isChecked(option.value) }" @click="toggleOption(option.value)">
                <div class="checkbox">
                    <div class="checkbox-box">
                        <checkIcon v-if="isChecked(option.value)" />
                    </div>
                </div>
                <div class="checkbox-content">
                    <div v-if="option.image" class="checkbox-image">
                        <Image :src="option.image" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;" />
                    </div>
                    <div class="checkbox-text">
                        <div class="checkbox-label">{{ option.label }}</div>
                        <div v-if="option.description" class="checkbox-description">
                            {{ option.description }}
                        </div>
                    </div>
                </div>
            </div>
        </template>
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
    align-items: center;
    gap: 10px;
    padding: 10px;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
    background: var(--bg-card);
}

.checkbox-group-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    margin-top: 4px;
    margin-bottom: 2px;
}

.checkbox-item:hover:not(.disabled) {
    border-color: var(--border-hover);
    background: var(--bg-tertiary-hover);
}

.checkbox-item.checked {
    border-color: var(--accent-color);
    background: var(--bg-tertiary-hover);
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
    background: var(--bg-card);
}

.checkbox-item.checked .checkbox-box {
    background: var(--accent-color);
    border-color: var(--accent-color);
}

.checkbox-box :deep(svg) {
    font-size: 12px;
    color: var(--accent-text);
}

.checkbox-content {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
}

.checkbox-image {
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    overflow: hidden;
    background: var(--bg-tertiary);
    border-radius: 4px;
}

.checkbox-text {
    flex: 1;
    min-width: 0;
}

.checkbox-label {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
    background: var(--bg-tertiary-hover);
    border-radius: 6px;
    border: 1px dashed var(--border-subtle);
}
</style>
