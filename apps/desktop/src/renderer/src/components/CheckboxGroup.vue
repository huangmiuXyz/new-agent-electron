<script setup lang="ts">
import { useIcon } from '../composables/useIcon'
import Button from './Button.vue'
import Tags from './Tags.vue'

interface Props {
    options: CheckboxOption[]
    disabled?: boolean
    columns?: number
    toggleOnCardClick?: boolean
    optionAction?: (option: CheckboxOption, event?: MouseEvent) => void
    optionContextMenu?: (option: CheckboxOption, event: MouseEvent) => void
}

const props = withDefaults(defineProps<Props>(), {
    options: () => [],
    disabled: false,
    columns: 1,
    toggleOnCardClick: true
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

const handleOptionClick = (option: CheckboxOption) => {
    if (!props.toggleOnCardClick) return
    toggleOption(option.value)
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

const { Check, Settings } = useIcon(['Check', 'Settings'])

const getGroupSelectionState = (groupOptions: CheckboxOption[]) => {
    const total = groupOptions.length
    const selected = groupOptions.filter((option) => modelValue.value.includes(option.value)).length
    return {
        total,
        selected,
        checked: total > 0 && selected === total,
        indeterminate: selected > 0 && selected < total
    }
}

const toggleGroup = (groupOptions: CheckboxOption[]) => {
    if (props.disabled) return

    const { checked } = getGroupSelectionState(groupOptions)
    const groupValues = groupOptions.map((option) => option.value)

    if (checked) {
        modelValue.value = modelValue.value.filter((value) => !groupValues.includes(value))
        return
    }

    const next = new Set(modelValue.value)
    groupValues.forEach((value) => next.add(value))
    modelValue.value = Array.from(next)
}

const handleOptionAction = (option: CheckboxOption, event: MouseEvent) => {
    event.stopPropagation()
    if (props.disabled || option.actionDisabled) return
    props.optionAction?.(option, event)
}

const handleOptionContextMenu = (option: CheckboxOption, event: MouseEvent) => {
    props.optionContextMenu?.(option, event)
}
</script>

<template>
    <div class="checkbox-group">
        <div v-for="group in groupedOptions" :key="group.name || '__ungrouped__'" class="checkbox-section">
            <div v-if="group.name" class="checkbox-group-title" @click="toggleGroup(group.options)">
                <div class="checkbox group-checkbox" :class="{ checked: getGroupSelectionState(group.options).checked }">
                    <div class="checkbox-box"
                        :class="{ indeterminate: getGroupSelectionState(group.options).indeterminate }">
                        <Check
                            v-if="getGroupSelectionState(group.options).checked || getGroupSelectionState(group.options).indeterminate" />
                    </div>
                </div>
                <span>{{ group.name }}</span>
            </div>
            <div class="checkbox-grid" :class="`columns-${Math.max(columns, 1)}`">
                <div v-for="option in group.options" :key="option.value" class="checkbox-item"
                    :class="{ disabled, checked: isChecked(option.value) }" @click="handleOptionClick(option)"
                    @contextmenu="handleOptionContextMenu(option, $event)">
                    <div class="checkbox">
                        <div class="checkbox-box">
                            <Check v-if="isChecked(option.value)" />
                        </div>
                    </div>
                    <div class="checkbox-content">
                        <div v-if="option.image" class="checkbox-image">
                            <Image :src="option.image" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;" />
                        </div>
                        <div class="checkbox-text">
                            <div class="checkbox-header">
                                <div class="checkbox-label">{{ option.label }}</div>
                                <Tags v-if="option.tags?.length" :tags="option.tags" size="sm"
                                    :color="option.tagColor || 'orange'" />
                            </div>
                            <div v-if="option.description" class="checkbox-description">
                                {{ option.description }}
                            </div>
                        </div>
                    </div>
                    <Button v-if="option.actionTitle" size="sm" variant="text"
                        :disabled="option.actionDisabled"
                        :title="option.actionTitle"
                        @click="handleOptionAction(option, $event)">
                        <template #icon>
                            <Settings />
                        </template>
                    </Button>
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

.checkbox-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.checkbox-grid {
    display: grid;
    gap: 8px;
}

.checkbox-grid.columns-1 {
    grid-template-columns: 1fr;
}

.checkbox-grid.columns-2 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
}

.checkbox-grid.columns-3 {
    grid-template-columns: repeat(3, minmax(0, 1fr));
}

.checkbox-grid.columns-4 {
    grid-template-columns: repeat(4, minmax(0, 1fr));
}

.checkbox-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 10px;
    min-height: 60px;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
    background: var(--bg-card);
}

.checkbox-group-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    margin-top: 4px;
    margin-bottom: 2px;
    cursor: pointer;
}

.group-checkbox {
    padding-top: 0;
}

.group-checkbox .checkbox-box.indeterminate {
    background: var(--bg-tertiary);
    border-color: var(--accent-color);
}

.group-checkbox.checked .checkbox-box,
.group-checkbox .checkbox-box.indeterminate {
    border-color: var(--accent-color);
}

.group-checkbox.checked .checkbox-box {
    background: var(--accent-color);
}

.group-checkbox .checkbox-box :deep(svg) {
    color: var(--accent-text);
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

.checkbox-header {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}

.checkbox-item :deep(.btn--text) {
    flex-shrink: 0;
}

.checkbox-item :deep(.btn--text svg) {
    width: 16px;
    height: 16px;
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
    white-space: pre-line;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
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

@media (max-width: 640px) {
    .checkbox-grid {
        grid-template-columns: 1fr;
    }
}
</style>
