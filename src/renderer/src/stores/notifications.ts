import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type NotificationType = 'success' | 'error' | 'warning' | 'info' | 'loading'

export interface NotificationItem {
  id: number
  type: NotificationType
  title?: string
  content: string
  duration?: number
  timestamp: number
  read: boolean
}

export interface StatusItem {
  id: string
  text?: string
  icon?: string
  html?: string // 支持自定义 HTML 图标内容
  color?: string
  tooltip?: string
  pluginName?: string
  command?: string
}

export const useNotificationStore = defineStore('notifications', () => {
  const notifications = ref<NotificationItem[]>([])
  const isPanelOpen = ref(false)
  const statusItems = ref<StatusItem[]>([])

  const unreadCount = computed(() => {
    return notifications.value.filter(n => !n.read).length
  })

  const addNotification = (item: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>) => {
    const id = Date.now() + Math.random()
    const notification: NotificationItem = {
      ...item,
      id,
      timestamp: Date.now(),
      read: false
    }
    notifications.value.unshift(notification)
    return id
  }

  const removeNotification = (id: number) => {
    const index = notifications.value.findIndex(n => n.id === id)
    if (index !== -1) {
      notifications.value.splice(index, 1)
    }
  }

  const markAsRead = (id: number) => {
    const notification = notifications.value.find(n => n.id === id)
    if (notification) {
      notification.read = true
    }
  }

  const markAllAsRead = () => {
    notifications.value.forEach(n => {
      n.read = true
    })
  }

  const clearAll = () => {
    notifications.value = []
  }

  const togglePanel = () => {
    isPanelOpen.value = !isPanelOpen.value
    if (isPanelOpen.value) {
      markAllAsRead()
    }
  }

  const setStatus = (id: string, item: Omit<StatusItem, 'id'>) => {
    const index = statusItems.value.findIndex(s => s.id === id)
    if (index !== -1) {
      statusItems.value[index] = { ...item, id }
    } else {
      statusItems.value.push({ ...item, id })
    }
  }

  const removeStatus = (id: string) => {
    const index = statusItems.value.findIndex(s => s.id === id)
    if (index !== -1) {
      statusItems.value.splice(index, 1)
    }
  }

  return {
    notifications,
    unreadCount,
    isPanelOpen,
    statusItems,
    addNotification,
    removeNotification,
    markAsRead,
    markAllAsRead,
    clearAll,
    togglePanel,
    setStatus,
    removeStatus
  }
})
