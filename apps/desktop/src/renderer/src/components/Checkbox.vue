<script setup lang="ts">
import { useIcon } from '../composables/useIcon'

interface Props {
  disabled?: boolean
  indeterminate?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  indeterminate: false
})

const modelValue = defineModel<boolean>({ default: false })

const toggle = () => {
  if (props.disabled) return
  modelValue.value = !modelValue.value
}

const checkIcon = useIcon('Check')
const minusIcon = useIcon('Remove')
</script>

<template>
  <div
    class="checkbox-wrapper"
    :class="{ disabled, checked: modelValue, indeterminate }"
    @click.stop="toggle"
  >
    <div class="checkbox-box">
      <checkIcon v-if="modelValue && !indeterminate" />
      <minusIcon v-if="indeterminate" />
    </div>
  </div>
</template>

<style scoped>
.checkbox-wrapper {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 2px;
}

.checkbox-wrapper.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.checkbox-box {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border-subtle);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  background: var(--bg-card);
}

.checkbox-wrapper:hover:not(.disabled) .checkbox-box {
  border-color: var(--border-hover);
}

.checkbox-wrapper.checked .checkbox-box,
.checkbox-wrapper.indeterminate .checkbox-box {
  background: var(--accent-color);
  border-color: var(--accent-color);
}

.checkbox-box :deep(svg) {
  font-size: 11px;
  color: var(--accent-text);
}
</style>
