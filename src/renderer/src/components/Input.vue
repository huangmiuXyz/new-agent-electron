<script setup lang="ts">
interface Props {
  type?: 'text' | 'password' | 'email' | 'number'
  placeholder?: string
  disabled?: boolean
  readonly?: boolean
  size?: 'md' | 'sm'
}

const modelValue = defineModel<string>()
withDefaults(defineProps<Props>(), {
  type: 'text',
  placeholder: '',
  disabled: false,
  readonly: false,
  size: 'md'
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
const inputRef = useTemplateRef('inputRef')
defineExpose({
  focus: () => {
    inputRef.value?.focus()
  }
})
</script>

<template>
  <input ref="inputRef" :type="type" :placeholder="placeholder" :disabled="disabled" :readonly="readonly"
    v-model="modelValue" :class="['form-input', `form-input--${size}`]" @blur="handleBlur" @focus="handleFocus" />
</template>

<style scoped>
.form-input {
  width: 100%;
  border: 1px solid var(--border-subtle);
  outline: none;
  transition: border 0.2s, box-shadow 0.2s;
  color: var(--text-primary);
  font-family: inherit;
  background-color: #fff;
}

.form-input--md {
  padding: 8px 10px;
  font-size: 13px;
  border-radius: 6px;
}

.form-input--sm {
  padding: 4px 8px;
  font-size: 12px;
  border-radius: 4px;
}

.form-input:focus {
  border-color: var(--text-secondary);
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.05);
}

.form-input:disabled {
  background-color: #f5f5f5;
  color: #999;
  cursor: not-allowed;
}

.form-input::placeholder {
  color: #999;
}
</style>
