<script setup lang="ts">
import { ref, computed } from 'vue'
import { useIcon } from '../composables/useIcon'

interface Props {
  type?: 'text' | 'password' | 'email' | 'number'
  placeholder?: string
  disabled?: boolean
  readonly?: boolean
  size?: 'md' | 'sm'
}

const modelValue = defineModel<string>()
const props = withDefaults(defineProps<Props>(), {
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

// 密码显示/隐藏状态
const showPassword = ref(false)

// 切换密码显示状态
const togglePasswordVisibility = () => {
  showPassword.value = !showPassword.value
}

// 计算实际输入类型
const inputType = computed(() => {
  if (props.type === 'password') {
    return showPassword.value ? 'text' : 'password'
  }
  return props.type
})

// 判断是否显示密码切换按钮
const showPasswordToggle = computed(() => {
  return props.type === 'password'
})

defineExpose({
  focus: () => {
    inputRef.value?.focus()
  }
})
</script>

<template>
  <div class="input-wrapper">
    <input ref="inputRef" :type="inputType" :placeholder="placeholder" :disabled="disabled" :readonly="readonly"
      v-model="modelValue"
      :class="['form-input', `form-input--${size}`, { 'form-input--with-toggle': showPasswordToggle }]"
      @blur="handleBlur" @focus="handleFocus" />

    <!-- 密码显示/隐藏切换按钮 -->
    <button v-if="showPasswordToggle" type="button" class="password-toggle" @click="togglePasswordVisibility"
      :disabled="disabled">
      <component :is="showPassword ? useIcon('Eye') : useIcon('EyeOff')" class="toggle-icon" />
    </button>
  </div>
</template>

<style scoped>
.input-wrapper {
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
}

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

.form-input--with-toggle {
  padding-right: 36px;
}

.form-input--md.form-input--with-toggle {
  padding-right: 36px;
}

.form-input--sm.form-input--with-toggle {
  padding-right: 32px;
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

.password-toggle {
  position: absolute;
  right: 8px;
  background: none;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition: color 0.2s;
  padding: 4px;
  border-radius: 4px;
}

.password-toggle:hover {
  color: var(--text-primary);
}

.password-toggle:disabled {
  color: #ccc;
  cursor: not-allowed;
}

.toggle-icon {
  width: 18px;
  height: 18px;
}

.form-input--sm+.password-toggle .toggle-icon {
  width: 16px;
  height: 16px;
}
</style>
