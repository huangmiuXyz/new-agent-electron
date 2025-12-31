import { createVNode, render, ref, TransitionGroup, defineComponent, h } from 'vue'

export type NotificationType = 'success' | 'error' | 'warning' | 'info' | 'loading'

export interface NotificationItem {
  id: number
  type: NotificationType
  title?: string
  content: string
  duration?: number
}

export type CloseNotification = () => void
export type NotificationHandler = (content: string, title?: string, duration?: number) => CloseNotification

export interface NotificationApi {
  info: NotificationHandler
  success: NotificationHandler
  error: NotificationHandler
  warning: NotificationHandler
  loading: NotificationHandler
}

const styleId = 'nexus-notification-style'

if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const style = document.createElement('style')
  style.id = styleId

  style.innerHTML = `
    .nexus-notification-container {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        pointer-events: none;
        min-width: 320px;
        min-height: 10px;
    }

    .nexus-notification-item {
        margin-top: 12px;
        padding: 16px;
        background: #ffffff;
        border: 1px solid rgba(0, 0, 0, 0.12);
        border-radius: 12px;
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
        display: flex;
        flex-direction: column;
        gap: 8px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        pointer-events: auto;
        width: 320px;
        box-sizing: border-box;
        position: relative;
    }

    .nexus-notification-header {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .nexus-notification-title {
        font-size: 14px;
        font-weight: 600;
        color: #111827;
    }

    .nexus-notification-content {
        font-size: 13px;
        color: #4b5563;
        line-height: 1.5;
        margin-left: 24px;
    }

    .nexus-notification-icon {
        font-size: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    @keyframes nexus-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
    .nexus-spin {
        animation: nexus-spin 1s linear infinite;
    }

    /* 动画 */
    .nexus-notification-move,
    .nexus-notification-enter-active,
    .nexus-notification-leave-active {
        transition: all 0.4s cubic-bezier(0.23, 1, 0.32, 1);
    }

    .nexus-notification-enter-from {
        opacity: 0;
        transform: translateX(100%) scale(0.9);
    }

    .nexus-notification-leave-to {
        opacity: 0;
        transform: translateX(100%) scale(0.9);
    }

    .nexus-notification-leave-active {
        position: absolute;
    }
  `
  document.head.appendChild(style)
}

const notifications = ref<NotificationItem[]>([])
let seed = 0

const NotificationComponent = defineComponent({
  name: 'NexusNotification',
  setup() {
    return () =>
      h(
        TransitionGroup,
        { name: 'nexus-notification', tag: 'div', class: 'nexus-notification-container' },
        {
          default: () =>
            notifications.value.map((notif) => {
              let iconClass = ''
              let iconColor = ''
              let extraClass = ''

              switch (notif.type) {
                case 'success':
                  iconClass = 'ph-fill ph-check-circle'
                  iconColor = '#10B981'
                  break
                case 'error':
                  iconClass = 'ph-fill ph-x-circle'
                  iconColor = '#EF4444'
                  break
                case 'warning':
                  iconClass = 'ph-fill ph-warning-circle'
                  iconColor = '#F59E0B'
                  break
                case 'loading':
                  iconClass = 'ph ph-spinner'
                  iconColor = '#6B7280'
                  extraClass = 'nexus-spin'
                  break
                default:
                  iconClass = 'ph-fill ph-info'
                  iconColor = '#3B82F6'
              }

              return h('div', { key: notif.id, class: 'nexus-notification-item' }, [
                h('div', { class: 'nexus-notification-header' }, [
                  h('i', { class: [iconClass, 'nexus-notification-icon', extraClass], style: { color: iconColor } }),
                  notif.title ? h('span', { class: 'nexus-notification-title' }, notif.title) : null
                ]),
                h('div', { class: 'nexus-notification-content' }, notif.content)
              ])
            })
        }
      )
  }
})

let container: HTMLElement | null = null

function mountContainer(): void {
  if (container) return
  console.log('Mounting notification container...');
  container = document.createElement('div')
  container.id = 'nexus-notification-root'
  document.body.appendChild(container)
  console.log('Container appended to body');
  const vnode = createVNode(NotificationComponent)
  render(vnode, container)
  console.log('Notification component rendered');
}

const addNotification = (
  type: NotificationType,
  content: string,
  title?: string,
  duration?: number
): CloseNotification => {
  console.log('Adding notification:', { type, content, title });
  if (typeof window === 'undefined') return () => {}

  mountContainer()
  const id = seed++

  const finalDuration = duration !== undefined ? duration : type === 'loading' ? 0 : 4500

  const notifObj: NotificationItem = { id, type, content, title, duration: finalDuration }
  notifications.value.push(notifObj)
  console.log('Current notifications:', notifications.value.length);

  const close: CloseNotification = () => {
    console.log('Closing notification:', id);
    const index = notifications.value.findIndex((n) => n.id === id)
    if (index !== -1) {
      notifications.value.splice(index, 1)
    }
  }

  if (finalDuration > 0) {
    setTimeout(close, finalDuration)
  }

  return close
}

export const notificationApi: NotificationApi = {
  info: (content, title, duration) => addNotification('info', content, title, duration),
  success: (content, title, duration) => addNotification('success', content, title, duration),
  error: (content, title, duration) => addNotification('error', content, title, duration),
  warning: (content, title, duration) => addNotification('warning', content, title, duration),
  loading: (content, title, duration) => addNotification('loading', content, title, duration)
}
