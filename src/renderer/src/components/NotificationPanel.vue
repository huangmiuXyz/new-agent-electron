<script setup lang="ts">
import { useNotificationStore } from '../stores/notifications'
import { useIcon } from '../composables/useIcon'

const notificationStore = useNotificationStore()

const { X, Trash, CheckCircle, InfoCircle, ErrorCircle24Filled, Bulb, Bell } = useIcon([
  'X',
  'Trash',
  'CheckCircle',
  'InfoCircle',
  'ErrorCircle24Filled',
  'Bulb',
  'Bell'
])

const getIcon = (type: string) => {
  switch (type) {
    case 'success':
      return CheckCircle
    case 'error':
      return ErrorCircle24Filled
    case 'warning':
      return Bulb
    case 'loading':
      return Bell // Or a spinner if available
    default:
      return InfoCircle
  }
}

const getIconColor = (type: string) => {
  switch (type) {
    case 'success':
      return 'var(--color-success)'
    case 'error':
      return 'var(--color-danger)'
    case 'warning':
      return 'var(--color-warning)'
    case 'info':
      return 'var(--color-info)'
    default:
      return 'var(--text-secondary)'
  }
}
</script>

<template>
  <Transition name="slide-panel">
    <div v-if="notificationStore.isPanelOpen" class="notification-panel" @click.stop>
      <div class="panel-header">
        <div class="header-title">
          <component :is="Bell" class="header-icon" />
          通知中心
        </div>
        <div class="header-actions">
          <button v-if="notificationStore.notifications.length > 0" class="action-btn" @click="notificationStore.clearAll" title="清空全部">
            <component :is="Trash" />
          </button>
          <button class="action-btn" @click="notificationStore.togglePanel" title="关闭">
            <component :is="X" />
          </button>
        </div>
      </div>

      <div class="panel-content custom-scrollbar">
        <div v-if="notificationStore.notifications.length === 0" class="empty-state">
          <component :is="Bell" class="empty-icon" />
          <p>暂无通知</p>
        </div>

        <TransitionGroup v-else name="list" tag="div" class="notification-list">
          <div
            v-for="item in notificationStore.notifications"
            :key="item.id"
            class="notification-item"
            :class="{ unread: !item.read }"
            @click="notificationStore.markAsRead(item.id)"
          >
            <div class="item-icon" :style="{ color: getIconColor(item.type) }">
              <component :is="getIcon(item.type)" />
            </div>
            <div class="item-body">
              <div class="item-header">
                <span class="item-title">{{ item.title || '系统通知' }}</span>
              </div>
              <div class="item-content">{{ item.content }}</div>
            </div>
            <button class="item-delete" @click.stop="notificationStore.removeNotification(item.id)">
              <component :is="X" />
            </button>
          </div>
        </TransitionGroup>
      </div>
    </div>
  </Transition>

  <!-- Overlay to close panel when clicking outside -->
  <Transition name="fade-overlay">
    <div v-if="notificationStore.isPanelOpen" class="panel-overlay" @click="notificationStore.togglePanel"></div>
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

.notification-panel {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 22px; /* AppFooter height */
  width: 320px;
  background: var(--bg-sidebar);
  border-left: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  z-index: 1000;
  box-shadow: -10px 0 30px rgba(0, 0, 0, 0.1);
}

.dark-mode .notification-panel {
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

.header-actions {
  display: flex;
  gap: 8px;
}

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

.action-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.empty-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  gap: 12px;
}

.empty-icon {
  width: 48px;
  height: 48px;
  opacity: 0.5;
}

.notification-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.notification-item {
  padding: 12px;
  border-radius: 8px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-subtle);
  display: flex;
  gap: 12px;
  position: relative;
  cursor: pointer;
  transition: all 0.2s;
}

.notification-item:hover {
  background: var(--bg-tertiary-hover);
  border-color: var(--border-focus);
}

.notification-item.unread {
  border-left: 3px solid var(--accent-color);
}

.item-icon {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  margin-top: 2px;
}

.item-body {
  flex: 1;
  min-width: 0;
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 4px;
}

.item-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-time {
  font-size: 11px;
  color: var(--text-tertiary);
}

.item-content {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
  word-break: break-all;
}

.item-delete {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 20px;
  height: 20px;
  display: none;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  border: none;
  background: var(--bg-hover);
  color: var(--text-secondary);
  cursor: pointer;
}

.notification-item:hover .item-delete {
  display: flex;
}

.panel-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 999;
  background: transparent;
}

/* Transitions */
.list-enter-active,
.list-leave-active {
  transition: all 0.3s ease;
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateX(30px);
}

.list-leave-active {
  position: absolute;
  width: calc(100% - 24px); /* 100% minus padding */
}

.list-move {
  transition: transform 0.3s ease;
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
