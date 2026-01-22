<template>
  <div
    ref="containerRef"
    class="resize-box"
    :style="{
      width: isCollapsed ? '0px' : `${width}px`,
    }"
    :class="{ collapsed: isCollapsed, resizing: isResizing }"
  >
    <div class="resize-content">
      <slot></slot>
    </div>
    <div
      class="resize-handle"
      :class="{ 'is-collapsed': isCollapsed }"
      @mousedown="startResizing"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from 'vue'

const props = withDefaults(defineProps<{
  width: number
  isCollapsed: boolean
  minWidth?: number
  maxWidth?: number
  collapseThreshold?: number
}>(), {
  minWidth: 150,
  maxWidth: 500,
  collapseThreshold: 80
})

const emit = defineEmits<{
  (e: 'update:width', value: number): void
  (e: 'update:isCollapsed', value: boolean): void
}>()

const isResizing = ref(false)
const containerRef = ref<HTMLElement | null>(null)

const startResizing = (e: MouseEvent) => {
  isResizing.value = true
  const startX = e.clientX
  const startWidth = props.isCollapsed ? 0 : props.width

  // Add a class to body to prevent text selection and show cursor
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'

  const handleMouseMove = (moveEvent: MouseEvent) => {
    if (!isResizing.value) return

    const deltaX = moveEvent.clientX - startX
    let newWidth = startWidth + deltaX

    if (newWidth < props.collapseThreshold) {
      if (!props.isCollapsed) {
        emit('update:isCollapsed', true)
      }
    } else {
      if (newWidth < props.minWidth) {
        newWidth = props.minWidth
      }
      if (newWidth > props.maxWidth) {
        newWidth = props.maxWidth
      }
      if (props.isCollapsed) {
        emit('update:isCollapsed', false)
      }
      emit('update:width', newWidth)
    }
  }

  const handleMouseUp = () => {
    isResizing.value = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }

  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
}

onUnmounted(() => {
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
})
</script>

<style scoped>
.resize-box {
  position: relative;
  height: 100%;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
}

.resize-box.resizing {
  transition: none;
}

.resize-content {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.resize-handle {
  position: absolute;
  top: 0;
  right: -2px;
  width: 4px;
  height: 100%;
  cursor: col-resize;
  z-index: 100;
  transition: background-color 0.2s, right 0.2s;
}

.resize-handle:hover,
.resizing .resize-handle {
  background-color: var(--color-primary, #007bff);
}

.resize-handle.is-collapsed {
  right: -4px;
}
</style>
