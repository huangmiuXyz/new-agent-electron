<script setup lang="ts">
import SettingsGroup from './SettingsGroup.vue'
import SettingsRow from './SettingsRow.vue'
import Button from './Button.vue'
import Switch from './Switch.vue'

interface Props {
  options: CheckboxOption[]
  disabled?: boolean
  toggleOnCardClick?: boolean
  optionAction?: (option: CheckboxOption, event?: MouseEvent) => void
  optionContextMenu?: (option: CheckboxOption, event: MouseEvent) => void
}

const props = withDefaults(defineProps<Props>(), {
  options: () => [],
  disabled: false,
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

const isChecked = (value: string) => modelValue.value.includes(value)

const groupedOptions = computed(() => {
  const groupMap = new Map<string, CheckboxOption[]>()
  const ungrouped: CheckboxOption[] = []
  for (const option of props.options) {
    if (option.group && option.group.trim()) {
      const list = groupMap.get(option.group) || []
      list.push(option)
      groupMap.set(option.group, list)
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
  <div class="cg">
    <template v-for="group in groupedOptions" :key="group.name || '__ungrouped__'">
      <SettingsGroup v-if="group.name" :label="group.name">
        <SettingsRow
          v-for="option in group.options"
          :key="option.value"
          :name="option.label"
          :desc="option.description"
          :muted="!isChecked(option.value)"
          clickable
          @click="toggleOption(option.value)"
          @contextmenu="handleOptionContextMenu(option, $event)"
        >
          <template #icon>
            <div class="cg-dot" :class="{ 'cg-dot--on': isChecked(option.value) }" />
          </template>
          <template #actions>
            <div class="cg-actions">
              <Switch
                :model-value="isChecked(option.value)"
                @update:model-value="toggleOption(option.value)"
              />
              <Button
                v-if="option.actionTitle"
                size="sm"
                variant="text"
                class="action-btn"
                :disabled="option.actionDisabled"
                :title="option.actionTitle"
                @click="handleOptionAction(option, $event)"
              >
                <template #icon>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                </template>
              </Button>
            </div>
          </template>
        </SettingsRow>
      </SettingsGroup>

      <div v-else class="cg-ungrouped">
        <SettingsRow
          v-for="option in group.options"
          :key="option.value"
          :name="option.label"
          :desc="option.description"
          :muted="!isChecked(option.value)"
          clickable
          @click="toggleOption(option.value)"
          @contextmenu="handleOptionContextMenu(option, $event)"
        >
          <template #icon>
            <div class="cg-dot" :class="{ 'cg-dot--on': isChecked(option.value) }" />
          </template>
          <template #actions>
            <div class="cg-actions">
              <Switch
                :model-value="isChecked(option.value)"
                @update:model-value="toggleOption(option.value)"
              />
              <Button
                v-if="option.actionTitle"
                size="sm"
                variant="text"
                class="action-btn"
                :disabled="option.actionDisabled"
                :title="option.actionTitle"
                @click="handleOptionAction(option, $event)"
              >
                <template #icon>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                </template>
              </Button>
            </div>
          </template>
        </SettingsRow>
      </div>
    </template>

    <div v-if="options.length === 0" class="cg-empty">暂无可用选项</div>
  </div>
</template>

<style scoped>
.cg {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.cg-ungrouped {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  overflow: hidden;
}

.cg-dot {
  width: 10px;
  height: 10px;
  border-radius: 9999px;
  border: 2px solid var(--border-subtle);
  flex-shrink: 0;
  transition: all 0.2s var(--motion-ease-standard);
}

.cg-dot--on {
  border-color: var(--color-primary);
  background: var(--color-primary);
}

.cg-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.cg-actions :deep(.toggle-switch) {
  transform: scale(0.8);
  margin: 0 2px;
}

.cg-empty {
  padding: 20px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 12px;
  background: var(--bg-tertiary-hover);
  border-radius: 6px;
  border: 1px dashed var(--border-subtle);
}
</style>