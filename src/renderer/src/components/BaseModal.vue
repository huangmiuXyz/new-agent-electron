<template>
  <Transition :name="variant === 'drawer' ? 'drawer' : 'modal-fade'">
    <div
      v-if="visible"
      ref="modalOverlay"
      :class="overlayClass"
      @click.self="handleEsc"
      @keydown.esc="handleEsc"
      tabindex="-1"
    >
      <!-- 中心弹窗样式 -->
      <div v-if="variant !== 'drawer'" class="modal-box" :style="{ width: props.width }">
        <div class="modal-header">
          <span class="modal-title">{{ title }}</span>
          <Button @click="handleEsc" variant="text">
            <Close />
          </Button>
        </div>
        <div class="modal-body" :style="{ height, maxHeight }">
          <slot>
            <div v-if="content" class="modal-desc">
              <template v-if="typeof content === 'string'">{{ content }}</template>
              <component v-else :is="content" />
            </div>
          </slot>
        </div>
        <div class="modal-footer">
          <Button class="btn btn-secondary" type="button" @click="handleCancel">{{
            props.cancelText || '取消'
          }}</Button>
          <Button
            ref="confirmButton"
            v-bind="confirmProps"
            class="btn btn-primary"
            type="button"
            @click="handleConfirm"
          >
            {{ props.confirmText || '确认' }}
          </Button>
        </div>
      </div>

      <!-- 抽屉样式 -->
      <div v-else class="drawer-container" :style="{ maxHeight }">
        <div class="drawer-header">
          <div class="drawer-handle"></div>
          <div class="drawer-title">{{ title }}</div>
        </div>
        <div class="drawer-content">
          <slot>
            <div v-if="content" class="modal-desc">
              <template v-if="typeof content === 'string'">{{ content }}</template>
              <component v-else :is="content" />
            </div>
          </slot>
        </div>
        <div v-if="showFooter" class="drawer-footer">
          <Button class="btn btn-secondary" type="button" @click="handleCancel">{{
            props.cancelText || '取消'
          }}</Button>
          <Button
            ref="confirmButton"
            v-bind="confirmProps"
            class="btn btn-primary"
            type="button"
            @click="handleConfirm"
          >
            {{ props.confirmText || '确认' }}
          </Button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import type { BaseModalProps } from '@renderer/types/components'
import Button from './Button.vue'
import { useIcon } from '@renderer/composables/useIcon'

const props = withDefaults(defineProps<BaseModalProps>(), {
  variant: isMobile.value ? 'drawer' : 'center',
  showFooter: true,
  maxHeight: '90vh'
})
const Close = useIcon('Close')

const visible = ref(false)
const modalOverlay = useTemplateRef('modalOverlay')
const confirmButton = useTemplateRef('confirmButton')

const overlayClass = computed(() => {
  return props.variant === 'drawer' ? 'modal-overlay drawer-overlay' : 'modal-overlay'
})

onMounted(async () => {
  visible.value = true
  nextTick(() => {
    modalOverlay.value?.focus()
    confirmButton.value?.focus()
  })
})

const handleConfirm = () => {
  if (props.onOk) {
    props.onOk()
    return
  }
  visible.value = false
  setTimeout(() => {
    props.resolve?.(true)
    props.remove?.()
  }, 200)
}
const handleEsc = () => {
  visible.value = false
  setTimeout(() => {
    if (props.onClose) {
      props.onClose?.()
      return
    }
    props.resolve?.(false)
    props.remove?.()
  }, 200)
}
const handleCancel = () => {
  visible.value = false
  setTimeout(() => {
    if (props.onCancel) {
      props.onCancel?.()
      return
    }
    props.resolve?.(false)
    props.remove?.()
  }, 200)
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3000;
}

.drawer-overlay {
  align-items: flex-end;
  background: rgba(0, 0, 0, 0.5);
}

.modal-box {
  background: #fff;
  width: 420px;
  border-radius: 10px;
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.12),
    0 2px 6px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 动画部分 */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-active .modal-box,
.modal-fade-leave-active .modal-box {
  transition: transform 0.2s ease;
}

.modal-fade-enter-from .modal-box,
.modal-fade-leave-to .modal-box {
  transform: scale(0.95);
}

/* 内部布局 */
.modal-header {
  padding: 8px 10px;
  border-bottom: 1px solid #e1e1e3;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-title {
  font-size: 15px;
  font-weight: 600;
  color: #111;
}

.modal-close {
  cursor: pointer;
  color: #a0a0a0;
  font-size: 16px;
  transition: color 0.2s;
}

.modal-close:hover {
  color: #202020;
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
}

.modal-desc {
  font-size: 13px;
  color: #6b6b6b;
  line-height: 1.5;
  margin-bottom: 12px;
}

/* 表单样式 */
.form-group {
  margin-top: 8px;
}

.form-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: #6b6b6b;
  margin-bottom: 6px;
}

.form-input {
  width: 100%;
  height: 34px;
  padding: 0 10px;
  font-size: 13px;
  border: 1px solid #d1d1d1;
  border-radius: 6px;
  outline: none;
  transition: all 0.1s;
}

.form-input:focus {
  border-color: #000;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.05);
}

.modal-footer {
  padding: 12px 20px;
  border-top: 1px solid #e1e1e3;
  background: #fbfbfb;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

/* 按钮样式 */
.btn {
  padding: 0 16px;
  height: 32px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.1s;
}

.btn-secondary {
  background: #fff;
  border-color: #d1d1d1;
  color: #202020;
}

.btn-secondary:hover {
  background: #f5f5f5;
}

.btn-primary {
  background: #000;
  color: #fff;
}

.btn-primary:hover {
  opacity: 0.9;
}

/* 抽屉样式 */
.drawer-container {
  width: 100%;
  max-width: 100%;
  background: #fff;
  border-radius: 20px 20px 0 0;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  max-height: v-bind('maxHeight || "60vh"');
  overflow: hidden;
}

.drawer-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 16px 8px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.drawer-handle {
  width: 36px;
  height: 4px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 2px;
  margin-bottom: 8px;
}

.drawer-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.drawer-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px;
}

.drawer-content::-webkit-scrollbar {
  width: 4px;
}

.drawer-content::-webkit-scrollbar-track {
  background: transparent;
}

.drawer-content::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 2px;
}

.drawer-footer {
  padding: 12px 20px;
  border-top: 1px solid #e1e1e3;
  background: #fbfbfb;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

/* 抽屉动画 */
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}

.drawer-enter-to,
.drawer-leave-from {
  opacity: 1;
}

.drawer-enter-active .drawer-container,
.drawer-leave-active .drawer-container {
  transition: transform 0.35s cubic-bezier(0.32, 0.72, 0, 1);
}

.drawer-enter-from .drawer-container {
  transform: translateY(100%) scale(0.95);
}

.drawer-leave-to .drawer-container {
  transform: translateY(100%) scale(0.95);
}

.drawer-enter-to .drawer-container,
.drawer-leave-from .drawer-container {
  transform: translateY(0) scale(1);
}
</style>
