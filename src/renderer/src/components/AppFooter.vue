<script setup lang="ts">
import { useNotificationStore } from '../stores/notifications'
import { useIcon } from '../composables/useIcon'
import { defineComponent, h } from 'vue'

const notificationStore = useNotificationStore()
const { Bell, InfoCircle, Refresh, Check, Mic } = useIcon(['Bell', 'InfoCircle', 'Refresh', 'Check', 'Mic'])

const StatusIcon = defineComponent({
  props: ['icon', 'color'],
  setup(props) {
    return () => {
      const iconMap = { Bell, InfoCircle, Refresh, Check, Mic }
      const IconComponent = props.icon ? (iconMap[props.icon] || useIcon(props.icon)) : Bell
      return h(IconComponent, {
        style: { color: props.color || 'inherit' },
        class: 'status-icon'
      })
    }
  }
})
</script>

<template>
  <footer class="app-footer no-drag">
    <div class="status-bar">
      <div class="status-bar-left">
        <template v-if="notificationStore.statusItems.length > 0">
        <div
          v-for="item in notificationStore.statusItems"
          :key="item.id"
          class="status-item"
          :title="item.tooltip || item.text"
        >
          <div v-if="item.html" v-html="item.html" class="status-html"></div>
          <div v-else class="icon-wrapper">
            <StatusIcon :icon="item.icon" :color="item.color" />
          </div>
        </div>
      </template>
      </div>

      <div class="status-bar-right">
        <div class="status-item" title="通知" @click="notificationStore.togglePanel">
          <div class="icon-wrapper">
            <StatusIcon icon="Bell" />
            <span v-if="notificationStore.unreadCount > 0" class="badge">{{ notificationStore.unreadCount }}</span>
          </div>
        </div>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.app-footer {
  height: 22px;
  background: var(--footer-bg);
  color: var(--footer-text);
  border-top: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  padding: 0 12px;
  font-size: 11px;
  flex-shrink: 0;
  z-index: 100;
  user-select: none;
  transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease;
}

.status-item {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  height: 100%;
  padding: 0 10px;
  transition: background 0.2s;
  min-width: 36px;
  gap: 4px;
}

.status-item:hover {
  background: var(--bg-hover);
}

.status-bar {
  display: flex;
  align-items: center;
  gap: 0;
  height: 100%;
  width: 100%;
}

.status-bar-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  height: 100%;
}

.status-bar-left {
  display: flex;
  align-items: center;
  height: 100%;
}

.badge {
  position: absolute;
  top: -4px;
  right: -5px;
  background: #f44336;
  color: white;
  border-radius: 10px;
  padding: 0 3px;
  font-size: 8px;
  min-width: 12px;
  height: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
  border: 1px solid var(--footer-bg);
  line-height: 1;
  pointer-events: none;
}

.icon-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
}

/* 插件可以给自己的 HTML 元素添加旋转效果 */
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.status-html {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

:deep(.status-html svg) {
  display: block;
}

:deep(.status-icon) {
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 400px;
}
</style>
