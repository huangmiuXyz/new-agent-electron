<script setup lang="ts">
import { useNotificationStore } from '../stores/notifications'
import { useIcon } from '../composables/useIcon'
import RightSlidePanel from './RightSlidePanel.vue'

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
  <RightSlidePanel
    :visible="notificationStore.isPanelOpen"
    title="通知中心"
    :icon="Bell"
    @close="notificationStore.closePanel"
  >
    <template #actions>
      <button
        v-if="notificationStore.notifications.length > 0"
        class="action-btn"
        @click="notificationStore.clearAll"
        title="清空全部"
      >
        <component :is="Trash" />
      </button>
    </template>

    <div v-if="notificationStore.notifications.length === 0" class="empty-state">
      <component :is="Bell" class="empty-icon" />
      <p>暂无通知</p>
    </div>

    <TransitionGroup v-else name="list" tag="div" class="notification-list">
      <div v-for="item in notificationStore.notifications" :key="item.id" class="notification-item"
        :class="{ unread: !item.read }" @click="notificationStore.markAsRead(item.id)">
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
  </RightSlidePanel>
</template>

<style scoped>
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

.list-enter-active,
.list-leave-active {
  transition: all var(--motion-duration-normal) var(--motion-ease-standard);
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateX(30px);
}

.list-leave-active {
  position: absolute;
  width: calc(100% - 24px);
}

.list-move {
  transition: transform var(--motion-duration-normal) var(--motion-ease-standard);
}
</style>
