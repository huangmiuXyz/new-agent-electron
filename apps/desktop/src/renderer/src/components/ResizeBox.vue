<template>
  <div
    class="resize-box"
    :style="containerStyle"
  :class="{ 
    collapsed: isCollapsed, 
    resizing: isResizing,
    'is-horizontal': direction === 'horizontal',
    'is-vertical': direction === 'vertical',
    'is-mounted': isMounted
  }"
  >
    <div class="resize-content">
      <slot></slot>
    </div>
    <div
      class="resize-handle"
      :class="{ 
        'is-collapsed': isCollapsed,
        'is-top': direction === 'vertical' && handlePosition === 'top',
        'is-bottom': direction === 'vertical' && handlePosition === 'bottom',
        'is-left': direction === 'horizontal' && handlePosition === 'left',
        'is-right': direction === 'horizontal' && handlePosition === 'right'
      }"
      @mousedown="startResizing"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted, computed, onMounted } from 'vue'

const props = withDefaults(defineProps<{
  width?: number
  height?: number
  isCollapsed: boolean
  minSize?: number
  maxSize?: number
  collapseThreshold?: number
  direction?: 'horizontal' | 'vertical'
  handlePosition?: 'left' | 'right' | 'top' | 'bottom'
}>(), {
  minSize: 150,
  maxSize: 800,
  collapseThreshold: 80,
  direction: 'horizontal',
  handlePosition: 'right'
})

const emit = defineEmits<{
  (e: 'update:width', value: number): void
  (e: 'update:height', value: number): void
  (e: 'update:isCollapsed', value: boolean): void
  (e: 'expand'): void
}>()

const isResizing = ref(false)
const isMounted = ref(false)

onMounted(() => {
  // 挂载后短暂禁用过渡动画，避免初始动画影响子组件尺寸计算
  requestAnimationFrame(() => {
    isMounted.value = true
  })
})

const containerStyle = computed(() => {
  if (props.direction === 'horizontal') {
    return {
      width: props.isCollapsed ? '0px' : `${props.width}px`,
    }
  } else {
    return {
      height: props.isCollapsed ? '0px' : `${props.height}px`,
    }
  }
})

// 监听展开状态变化，展开后触发事件
watch(() => props.isCollapsed, (newVal, oldVal) => {
  if (oldVal === true && newVal === false) {
    // 从折叠变为展开，等待过渡完成后触发事件
    setTimeout(() => {
      emit('expand')
    }, 350)
  }
})

const startResizing = (e: MouseEvent) => {
  isResizing.value = true
  const startX = e.clientX
  const startY = e.clientY
  const startSize = props.direction === 'horizontal' 
    ? (props.isCollapsed ? 0 : (props.width || 0))
    : (props.isCollapsed ? 0 : (props.height || 0))
  
  // Add a class to body to prevent text selection and show cursor
  document.body.style.cursor = props.direction === 'horizontal' ? 'col-resize' : 'row-resize'
  document.body.style.userSelect = 'none'

  const handleMouseMove = (moveEvent: MouseEvent) => {
    if (!isResizing.value) return
    
    let delta = 0
    if (props.direction === 'horizontal') {
      delta = moveEvent.clientX - startX
      if (props.handlePosition === 'left') delta = -delta
    } else {
      delta = moveEvent.clientY - startY
      if (props.handlePosition === 'top') delta = -delta
    }

    let newSize = startSize + delta
    
    if (newSize < props.collapseThreshold) {
      if (!props.isCollapsed) {
        emit('update:isCollapsed', true)
      }
    } else {
      if (newSize < props.minSize) {
        newSize = props.minSize
      }
      if (newSize > props.maxSize) {
        newSize = props.maxSize
      }
      if (props.isCollapsed) {
        emit('update:isCollapsed', false)
      }
      
      if (props.direction === 'horizontal') {
        emit('update:width', newSize)
      } else {
        emit('update:height', newSize)
      }
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
  flex-shrink: 0;
}
.resize-box.is-mounted:not(.resizing) {
  transition: none;
}

.resize-box.is-horizontal {
  height: 100%;
}

.resize-box.is-vertical {
  width: 100%;
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
  z-index: 100;
  transition: background-color 0.2s, right 0.2s, left 0.2s, top 0.2s, bottom 0.2s;
}

.resize-handle:hover,
.resizing .resize-handle {
  background-color: var(--color-primary, #007bff);
}

/* Horizontal styles */
.is-horizontal .resize-handle {
  top: 0;
  width: 4px;
  height: 100%;
  cursor: col-resize;
}

.resize-handle.is-right {
  right: -2px;
}

.resize-handle.is-left {
  left: -2px;
}

.resize-handle.is-right.is-collapsed {
  right: -4px;
}

.resize-handle.is-left.is-collapsed {
  left: -4px;
}

/* Vertical styles */
.is-vertical .resize-handle {
  left: 0;
  height: 4px;
  width: 100%;
  cursor: row-resize;
}

.resize-handle.is-top {
  top: -2px;
}

.resize-handle.is-bottom {
  bottom: -2px;
}

.resize-handle.is-top.is-collapsed {
  top: -4px;
}

.resize-handle.is-bottom.is-collapsed {
  bottom: -4px;
}
</style>
