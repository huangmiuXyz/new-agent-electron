<script setup lang="ts">
import type { ButtonProps } from '@renderer/types/components'

const props = withDefaults(defineProps<ButtonProps>(), {
  variant: 'primary',
  size: 'md',
  disabled: false,
  type: 'button',
  danger: false
})

const buttonRef = useTemplateRef('buttonRef')
const emit = defineEmits<{
  click: [event: MouseEvent]
}>()
defineExpose({
  focus: () => buttonRef.value?.focus?.()
})
const buttonClasses = computed(() => {
  const classes = ['btn', `btn--${props.variant}`, `btn--${props.size}`]

  if (props.disabled) {
    classes.push('btn--disabled')
  }

  if (props.danger) {
    classes.push('btn--danger')
  }

  return classes
})
const handleClick = (event: MouseEvent) => {
  if (!props.disabled) {
    emit('click', event)
  }
}
</script>

<template>
  <button class="no-drag" ref="buttonRef" :type="type" :class="buttonClasses" :disabled="disabled" @click="handleClick">
    <template v-if="$slots.icon">
      <div class="icon-btn">
        <slot name="icon" />
        <slot />
      </div>
    </template>
    <slot v-else />
  </button>
</template>

<style scoped>
.icon-btn {
  display: flex;
  gap: 4px;
  align-items: center;
}

/* 基础按钮样式 */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-sm, 6px);
  font-family: var(--font-stack);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  outline: none;
  user-select: none;
}

.btn:focus-visible {
  outline: 2px solid var(--accent-color);
  outline-offset: 2px;
}

/* 主要按钮样式 - 用于发送按钮等 */
.btn--primary {
  background: var(--accent-color);
  color: var(--accent-text);
}

.btn--primary:hover:not(.btn--disabled) {
  opacity: 0.9;
}

.btn--primary:active:not(.btn--disabled) {
  opacity: 0.8;
}

/* 次要按钮样式 */
.btn--secondary {
  background: transparent;
  color: var(--text-secondary);
}

.btn--secondary:hover:not(.btn--disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
}

/* 图标按钮样式 */
.btn--icon {
  background: transparent;
  color: var(--text-secondary);
  padding: 4px;
  border-radius: 4px;
  font-size: inherit;
  width: auto;
  height: auto;
  min-width: 24px;
  min-height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.btn--icon:hover:not(.btn--disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
}

/* 文本按钮样式 - 无背景hover效果 */
.btn--text {
  background: transparent;
  color: var(--text-secondary);
  padding: 4px;
  border-radius: 4px;
  font-size: inherit;
  width: auto;
  height: auto;
  min-width: 24px;
  min-height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.btn--text:hover:not(.btn--disabled) {
  background: transparent;
  color: var(--text-primary);
}

/* 危险按钮样式 */
.btn--danger {
  background: var(--color-danger) !important;
  color: var(--accent-text) !important;
}

.btn--danger:hover:not(.btn--disabled) {
  background: var(--color-danger-hover, rgba(var(--color-danger-rgb, 239, 68, 68), 0.8)) !important;
}

.btn--danger:active:not(.btn--disabled) {
  background: var(--color-danger-active, rgba(var(--color-danger-rgb, 239, 68, 68), 0.7)) !important;
}

/* 危险次要按钮样式 */
.btn--secondary.btn--danger {
  background: transparent;
  color: var(--color-danger);
}

.btn--secondary.btn--danger:hover:not(.btn--disabled) {
  background: rgba(239, 68, 68, 0.1);
  color: var(--color-danger);
}

/* 危险图标按钮样式 */
.btn--icon.btn--danger {
  background: transparent;
  color: var(--color-danger);
}

.btn--icon.btn--danger:hover:not(.btn--disabled) {
  background: rgba(239, 68, 68, 0.1);
  color: var(--color-danger);
}

/* 危险文本按钮样式 */
.btn--text.btn--danger {
  background: transparent;
  color: var(--color-danger);
}

.btn--text.btn--danger:hover:not(.btn--disabled) {
  background: transparent;
  color: var(--color-danger);
}

/* 尺寸变体 */
.btn--sm {
  padding: 4px 8px;
  font-size: 11px;
}

.btn--md {
  padding: 6px 16px;
  font-size: 12px;
}

.btn--lg {
  padding: 8px 20px;
  font-size: 14px;
}

/* 图标按钮的特殊尺寸 */
.btn--icon.btn--sm {
  font-size: 16px;
  width: 24px;
  height: 24px;
  padding: 2px;
}

.btn--icon.btn--md {
  font-size: 18px;
  width: 28px;
  height: 28px;
  padding: 4px;
}

.btn--icon.btn--lg {
  font-size: 20px;
  width: 32px;
  height: 32px;
  padding: 6px;
}

/* 文本按钮的特殊尺寸 */
.btn--text.btn--sm {
  font-size: 12px;
  padding: 2px;
}

.btn--text.btn--md {
  font-size: 14px;
  height: 28px;
  padding: 4px;
}

.btn--text.btn--lg {
  font-size: 16px;
  height: 32px;
  padding: 6px;
}

/* 禁用状态 */
.btn--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
