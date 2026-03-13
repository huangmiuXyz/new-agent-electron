<template>
  <Transition :name="variant === 'drawer' ? 'drawer' : 'modal-fade'">
    <div v-if="visible" ref="modalOverlay" :class="overlayClass" @click.self="handleEsc" @keydown.esc="handleEsc"
      tabindex="-1">
      <div v-if="variant !== 'drawer'" ref="modalBox" class="modal-box"
        :class="{ 'is-dragging': isDragging, 'is-fullscreen': isFullscreen }"
        :style="[{ width: isFullscreen ? '100%' : props.width }, draggableStyle]">
        <div v-show="!isFullscreen" ref="modalHeader" class="modal-header"
          :class="{ 'is-draggable': !isMobile && props.variant !== 'drawer', 'is-hidden': isFullscreen }">
          <span class="modal-title">{{ title }}</span>
          <div class="modal-actions">
            <Button @click="toggleFullscreen" variant="text" title="全屏">
              <Fullscreen />
            </Button>
            <Button @click="handleEsc" variant="text" title="关闭">
              <Close />
            </Button>
          </div>
        </div>
        <div class="modal-body" :class="{ 'is-fullscreen-body': isFullscreen }"
          :style="{ height: isFullscreen ? '100vh' : height, maxHeight: isFullscreen ? '100vh' : maxHeight, ...(modalBodyStyle || {}) }">
          <slot>
            <div v-if="content" class="modal-desc">
              <template v-if="typeof content === 'string'">{{ content }}</template>
              <component v-else :is="content" />
            </div>
          </slot>
        </div>
        <Button v-if="isFullscreen" @click="exitFullscreen" variant="text" class="fullscreen-exit-btn" title="退出全屏">
          <FullscreenExit />
        </Button>
        <div v-show="!isFullscreen && showFooter" class="modal-footer" :class="{ 'is-hidden': isFullscreen }">
          <Button v-if="showCancel" class="btn btn-secondary" type="button" @click="handleCancel">
            {{ props.cancelText || '取消' }}
          </Button>
          <Button ref="confirmButton" v-bind="confirmProps" class="btn btn-primary" type="button"
            @click="handleConfirm">
            {{ props.confirmText || '确认' }}
          </Button>
        </div>
      </div>

      <div v-else class="drawer-container" :style="{ maxHeight: props.maxHeight || drawerViewportHeight, height: props.height }">
        <div class="drawer-header">
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
          <Button variant="secondary" v-if="showCancel" :class="{ isMobile }" type="button" @click="handleCancel">
            {{ props.cancelText || '取消' }}
          </Button>
          <Button variant="primary" :class="{ isMobile }" ref="confirmButton" v-bind="confirmProps" type="button"
            @click="handleConfirm">
            {{ props.confirmText || '确认' }}
          </Button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import Button from './Button.vue'
import { useIcon } from '@renderer/composables/useIcon'
import { useBackButton } from '@renderer/composables/useBackButton'
import { BaseModalProps } from '@renderer/types/components'
import { useDraggable, useWindowSize } from '@vueuse/core'

const props = withDefaults(defineProps<BaseModalProps>(), {
  variant: isMobile.value ? 'drawer' : 'center',
  showFooter: true,
  showCancel: true,
  maxHeight: '90vh'
})

const { Close, Fullscreen, FullscreenExit } = useIcon(['Close', 'Fullscreen', 'FullscreenExit'])
const isFullscreen = ref(false)
const showFullscreenTip = ref(false)
let fullscreenTipTimer: ReturnType<typeof setTimeout> | null = null
let modalResizeObserver: ResizeObserver | null = null

const visible = ref(false)
const modalOverlay = useTemplateRef('modalOverlay')
const confirmButton = useTemplateRef('confirmButton')
const modalBox = ref<HTMLElement | null>(null)
const modalHeader = ref<HTMLElement | null>(null)
const { height: windowHeight } = useWindowSize()
const drawerViewportHeight = computed(() => `${windowHeight.value}px`)

const isDraggableEnabled = computed(() => !isMobile.value && props.variant !== 'drawer' && visible.value)

const { x, y, style: draggableStyle, isDragging } = useDraggable(modalBox, {
  disabled: computed(() => !isDraggableEnabled.value),
  handle: modalHeader,
  initialValue: { x: 0, y: 0 },
  preventDefault: true
})

const toggleFullscreen = () => {
  isFullscreen.value = !isFullscreen.value

  if (isFullscreen.value) {
    showFullscreenTip.value = true
    if (fullscreenTipTimer) clearTimeout(fullscreenTipTimer)
    fullscreenTipTimer = setTimeout(() => {
      showFullscreenTip.value = false
    }, 2000)
  } else {
    showFullscreenTip.value = false
    if (fullscreenTipTimer) clearTimeout(fullscreenTipTimer)
  }
}

const exitFullscreen = () => {
  if (!isFullscreen.value) return
  isFullscreen.value = false
  showFullscreenTip.value = false
  if (fullscreenTipTimer) clearTimeout(fullscreenTipTimer)
}

const resetPosition = () => {
  nextTick(() => {
    const el = modalBox.value
    if (!el) return
    const rect = el.getBoundingClientRect()
    x.value = (window.innerWidth - rect.width) / 2
    y.value = (window.innerHeight - rect.height) / 2
  })
}

const observeModalSize = () => {
  if (props.variant === 'drawer') return
  if (!modalBox.value) return

  modalResizeObserver?.disconnect()
  modalResizeObserver = new ResizeObserver(() => {
    if (isDragging.value || isFullscreen.value) return
    resetPosition()
  })
  modalResizeObserver.observe(modalBox.value)
}

const finalizeClose = (result: boolean) => {
  visible.value = false
  setTimeout(() => {
    resetPosition()
    if (!result && props.onClose) {
      props.onClose()
      return
    }
    props.resolve?.(result)
    props.remove?.()
  }, 200)
}

const handleEsc = () => {
  if (isFullscreen.value) {
    exitFullscreen()
    return
  }
  finalizeClose(false)
}

const handleCancel = () => {
  if (isFullscreen.value) {
    exitFullscreen()
    return
  }
  visible.value = false
  setTimeout(() => {
    resetPosition()
    if (props.onCancel) {
      props.onCancel()
      return
    }
    props.resolve?.(false)
    props.remove?.()
  }, 200)
}

const handleConfirm = () => {
  if (isFullscreen.value) {
    exitFullscreen()
  }
  if (props.onOk) {
    props.onOk()
    return
  }
  visible.value = false
  setTimeout(() => {
    resetPosition()
    props.resolve?.(true)
    props.remove?.()
  }, 200)
}

const overlayClass = computed(() => {
  return props.variant === 'drawer' ? 'modal-overlay drawer-overlay' : 'modal-overlay'
})

useBackButton({
  enabled: computed(() => visible.value),
  handler: () => {
    handleEsc()
    return true
  }
})

onMounted(async () => {
  visible.value = true
  resetPosition()
  nextTick(() => {
    observeModalSize()
    modalOverlay.value?.focus()
    confirmButton.value?.focus()
  })
})

onBeforeUnmount(() => {
  modalResizeObserver?.disconnect()
  modalResizeObserver = null
})
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  z-index: 3000;
}

.drawer-overlay {
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  padding-top: max(env(safe-area-inset-top), 0px);
}

.modal-box {
  background: var(--bg-card);
  width: 420px;
  border-radius: 10px;
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.12),
    0 2px 6px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  max-height: 90vh;
  position: fixed;
  touch-action: none;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-active .modal-box:not(.is-dragging),
.modal-fade-leave-active .modal-box:not(.is-dragging) {
  transition: transform 0.2s ease;
}

.modal-fade-enter-from .modal-box,
.modal-fade-leave-to .modal-box {
  transform: scale(0.95);
}

.modal-header {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header.is-draggable {
  cursor: move;
}

.modal-header.is-draggable:active {
  cursor: grabbing;
}

.modal-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.modal-close {
  cursor: pointer;
  color: var(--text-sub);
  font-size: 16px;
  transition: color 0.2s;
}

.modal-close:hover {
  color: var(--text-primary);
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
}

.modal-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.modal-body > .modal-desc,
.drawer-content > .modal-desc {
  height: 100%;
  min-height: 0;
}

.form-group {
  margin-top: 8px;
}

.form-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.form-input {
  width: 100%;
  height: 34px;
  padding: 0 10px;
  font-size: 13px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  outline: none;
  transition: all 0.1s;
}

.form-input:focus {
  border-color: var(--accent-color);
  box-shadow: 0 0 0 2px rgba(var(--accent-rgb), 0.1);
}

.modal-footer {
  padding: 12px 20px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-app);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.modal-footer-extra {
  margin-right: auto;
  display: flex;
  align-items: center;
}

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

.btn.isMobile {
  flex: 1;
}

.btn-secondary {
  background: var(--bg-card);
  border-color: var(--border-color);
  color: var(--text-primary);
}

.btn-secondary:hover {
  background: var(--bg-hover);
}

.btn-primary {
  background: var(--text-primary);
  color: var(--bg-card);
}

.btn-primary:hover {
  opacity: 0.9;
}

.drawer-container {
  width: 100%;
  max-width: 100%;
  background: var(--bg-card);
  border-radius: 20px 20px 0 0;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.drawer-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  padding: 12px 16px 8px;
  border-bottom: 1px solid var(--border-color-light);
}

.drawer-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.drawer-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
  padding: 8px;
}

.drawer-content::-webkit-scrollbar {
  width: 4px;
}

.drawer-content::-webkit-scrollbar-track {
  background: transparent;
}

.drawer-content::-webkit-scrollbar-thumb {
  background: var(--border-color-medium);
  border-radius: 2px;
}

.drawer-footer {
  flex-shrink: 0;
  padding: 12px 20px calc(20px + max(env(safe-area-inset-bottom), var(--safe-area-bottom, 0px)));
  border-top: 1px solid var(--border-color);
  background: var(--bg-hover);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.drawer-footer-extra {
  margin-right: auto;
  display: flex;
  align-items: center;
}

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

.modal-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.is-hidden {
  display: none !important;
}

.modal-box.is-fullscreen {
  width: 100vw !important;
  height: 100vh;
  max-height: 100vh;
  border-radius: 0;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  transform: none !important;
}

.modal-box.is-fullscreen .modal-header {
  cursor: default;
}

.modal-box.is-fullscreen .modal-body {
  flex: 1;
  max-height: 100vh !important;
  padding: 0;
}

.fullscreen-exit-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 100;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 4px;
  color: white;
}

.fullscreen-exit-btn:hover {
  background: rgba(0, 0, 0, 0.7);
}
</style>
