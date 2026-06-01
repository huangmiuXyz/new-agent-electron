<script setup lang="ts">
import { useNotificationStore } from '../stores/notifications'
import { useIcon } from '../composables/useIcon'

const notificationStore = useNotificationStore()

const { Trash, CheckCircle, InfoCircle, ErrorCircle24Filled, Bulb, Bell } = useIcon([
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
      return Bell
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
  <div class="notification-panel-content">
    <div class="panel-tools">
      <button
        v-if="notificationStore.notifications.length > 0"
        class="action-btn"
        title="清空全部"
        @click="notificationStore.clearAll"
      >
        <component :is="Trash" />
      </button>
    </div>

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
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.notification-panel-content {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.panel-tools {
  display: flex;
  justify-content: flex-end;
  padding: 8px;
}

.empty-state {
  flex: 1;
  min-height: 0;
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
  padding: 8px;
  padding-top: 0 !important;
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

.item-content {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
  word-break: break-all;
}

.item-delete,
.action-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.action-btn:hover,
.item-delete:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.item-delete {
  position: absolute;
  top: 8px;
  right: 8px;
  display: none;
}

.notification-item:hover .item-delete {
  display: inline-flex;
}

.list-enter-active,
.list-leave-active,
.list-move {
  transition: all 0.25s ease;
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
