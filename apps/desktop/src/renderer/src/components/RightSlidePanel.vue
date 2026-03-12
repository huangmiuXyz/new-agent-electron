<script setup lang="ts">
import { computed } from 'vue'
import type { Component } from 'vue'
import { useIcon } from '../composables/useIcon'

const props = withDefaults(defineProps<{
  visible: boolean
  title: string
  icon?: Component | string
  badge?: string | number | null
  width?: string
  bottom?: string
  contentPadding?: string
}>(), {
  icon: undefined,
  badge: null,
  width: '320px',
  bottom: '22px',
  contentPadding: '12px'
})

const emit = defineEmits<{
  (e: 'close'): void
}>()

const { X } = useIcon(['X'])

const panelStyle = computed(() => ({
  width: props.width,
  bottom: props.bottom
}))

const contentStyle = computed(() => ({
  padding: props.contentPadding
}))
</script>

<template>
  <Transition name="slide-panel">
    <div v-if="visible" class="right-slide-panel" :style="panelStyle" @click.stop>
      <div class="panel-header no-drag">
        <div class="header-title">
          <component v-if="icon" :is="icon" class="header-icon" />
          <span>{{ title }}</span>
          <span v-if="badge !== null && badge !== undefined" class="header-count">{{ badge }}</span>
        </div>
        <div class="header-actions">
          <slot name="actions" />
          <button class="action-btn" title="关闭" @click="emit('close')">
            <component :is="X" />
          </button>
        </div>
      </div>

      <div class="panel-content custom-scrollbar" :style="contentStyle">
        <slot />
      </div>
    </div>
  </Transition>

  <Transition name="fade-overlay">
    <div v-if="visible" class="panel-overlay" @click="emit('close')"></div>
  </Transition>
</template>

<style scoped>
.fade-overlay-enter-active,
.fade-overlay-leave-active {
  transition: opacity 0.3s ease;
}

.fade-overlay-enter-from,
.fade-overlay-leave-to {
  opacity: 0;
}

.right-slide-panel {
  position: fixed;
  top: 40px;
  right: 0;
  background: var(--bg-sidebar);
  border-left: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  z-index: 1000;
  border: 1px solid var(--border-subtle);
}

.dark-mode .right-slide-panel {
  box-shadow: -10px 0 30px rgba(0, 0, 0, 0.4);
}

.panel-header {
  height: var(--header-h);
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-header);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.header-icon {
  width: 16px;
  height: 16px;
}

.header-count {
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  background: var(--active-bg);
  color: var(--text-primary);
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.header-actions :deep(.action-btn),
.action-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.header-actions :deep(.action-btn:hover),
.action-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.panel-content {
  flex: 1;
  overflow-y: auto;
}

.panel-overlay {
  position: fixed;
  inset: 0;
  z-index: 999;
  background: transparent;
}

.slide-panel-enter-active,
.slide-panel-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-panel-enter-from,
.slide-panel-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

.slide-panel-enter-to,
.slide-panel-leave-from {
  transform: translateX(0);
  opacity: 1;
}
</style>
