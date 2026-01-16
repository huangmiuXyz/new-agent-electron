<script setup lang="ts">
interface Props {
  modelValue: boolean
  searchQuery?: string
  placeholder?: string
  noResultsText?: string
  hasResults?: boolean
  maxHeight?: string
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '搜索...',
  noResultsText: '未找到结果',
  hasResults: true,
  maxHeight: '60vh'
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'update:searchQuery': [value: string]
}>()

const internalSearchQuery = computed({
  get: () => props.searchQuery || '',
  set: (value) => emit('update:searchQuery', value)
})

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// 点击遮罩层关闭
const handleBackdropClick = (e: MouseEvent) => {
  if (e.target === e.currentTarget) {
    isOpen.value = false
  }
}

// ESC 键关闭
const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <!-- Trigger 插槽 - 用于触发底部弹出的按钮 -->
  <slot name="trigger" :isOpen="isOpen" :toggle="() => (isOpen = !isOpen)"></slot>

  <Transition name="bottom-sheet">
    <div v-if="isOpen" class="bottom-sheet-backdrop" @click="handleBackdropClick">
      <div class="bottom-sheet-container" :style="{ maxHeight }">
        <div class="bottom-sheet-header">
          <div class="bottom-sheet-handle"></div>
          <div class="bottom-sheet-title">
            <slot name="title"></slot>
          </div>
        </div>

        <div class="bottom-sheet-search" v-if="placeholder">
          <Input v-model="internalSearchQuery" type="text" :placeholder="placeholder" class="search-input" autofocus />
        </div>

        <div class="bottom-sheet-content">
          <slot v-if="hasResults"></slot>
          <div v-else class="no-results">
            {{ noResultsText }}
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.bottom-sheet-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 9999;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0;
}

.bottom-sheet-container {
  width: 100%;
  max-width: 100%;
  background: var(--bg-card);
  border-radius: 20px 20px 0 0;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  max-height: v-bind(maxHeight);
  overflow: hidden;
}

.bottom-sheet-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 16px 8px;
  border-bottom: 1px solid var(--border-color-light);
}

.bottom-sheet-handle {
  width: 36px;
  height: 4px;
  background: var(--border-color-medium);
  border-radius: 2px;
  margin-bottom: 8px;
}

.bottom-sheet-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.search-input {
  width: 100%;
  padding: 12px 16px;
  padding-bottom: 0 !important;
  font-size: 14px;
  color: var(--text-primary);
  outline: none;
  transition: all 0.2s;
}

.search-input:focus {
  border-color: var(--accent-color);
  background: var(--bg-input);
}

.search-input::placeholder {
  color: var(--text-tertiary);
}

.bottom-sheet-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px;
}

.bottom-sheet-content::-webkit-scrollbar {
  width: 4px;
}

.bottom-sheet-content::-webkit-scrollbar-track {
  background: transparent;
}

.bottom-sheet-content::-webkit-scrollbar-thumb {
  background: var(--border-color-medium);
  border-radius: 2px;
}

.no-results {
  padding: 40px 20px;
  text-align: center;
  font-size: 14px;
  color: var(--text-tertiary);
}

/* 遮罩层动画 */
.bottom-sheet-enter-active,
.bottom-sheet-leave-active {
  transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.bottom-sheet-enter-from,
.bottom-sheet-leave-to {
  opacity: 0;
}

.bottom-sheet-enter-to,
.bottom-sheet-leave-from {
  opacity: 1;
}

/* 容器从下方弹出动画 */
.bottom-sheet-enter-active .bottom-sheet-container,
.bottom-sheet-leave-active .bottom-sheet-container {
  transition: transform 0.35s cubic-bezier(0.32, 0.72, 0, 1);
}

.bottom-sheet-enter-from .bottom-sheet-container {
  transform: translateY(100%) scale(0.95);
}

.bottom-sheet-leave-to .bottom-sheet-container {
  transform: translateY(100%) scale(0.95);
}

.bottom-sheet-enter-to .bottom-sheet-container,
.bottom-sheet-leave-from .bottom-sheet-container {
  transform: translateY(0) scale(1);
}
</style>
