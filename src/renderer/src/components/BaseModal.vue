<template>
  <Transition name="modal-fade">
    <div v-if="visible" ref="modalOverlay" class="modal-overlay" @click.self="handleCancel" @keydown.esc="handleCancel"
      tabindex="-1">
      <div class="modal-box" :style="{ width: props.width }">
        <div class="modal-header">
          <span class="modal-title">{{ title }}</span>
          <Close class="ph ph-x modal-close" @click="handleCancel" />
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
          <Button class="btn btn-secondary" type="button" @click="handleCancel">取消</Button>
          <Button v-bind="confirmProps" class="btn btn-primary" type="button" @click="handleConfirm">
            确认
          </Button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import type { BaseModalProps } from '@renderer/types/components';
import Button from './Button.vue';
import { useIcon } from '@renderer/composables/useIcon';

const props = defineProps<BaseModalProps>();
const Close = useIcon('Close')

const visible = ref(false);
const modalOverlay = useTemplateRef('modalOverlay');

onMounted(async () => {
  visible.value = true;
  nextTick(() => {
    modalOverlay.value?.focus();
  });
});

const handleConfirm = () => {
  if (props.onOk) {
    props.onOk()
    return
  }
  visible.value = false;
  setTimeout(() => {
    props.resolve?.(true);
    props.remove?.();
  }, 200);
};

const handleCancel = () => {
  visible.value = false;
  setTimeout(() => {
    props.resolve?.(false);
    props.remove?.();
  }, 200);
};
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

.modal-box {
  background: #fff;
  width: 420px;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.04);
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
  padding: 16px 20px;
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
</style>
