import { createVNode, render, ref, TransitionGroup, defineComponent, h } from 'vue'
import { useNotificationStore, type NotificationType } from '../stores/notifications'

export type { NotificationType }

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
  status: (id: string, text: string, options?: { icon?: string; color?: string; tooltip?: string; pluginName?: string }) => void
  removeStatus: (id: string) => void
}

const styleId = 'nexus-notification-style'

if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const style = document.createElement('style')
  style.id = styleId

  style.innerHTML = `
    .nexus-notification-container {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        left: 0;
        z-index: 9999;
        pointer-events: none;
    }

    .nexus-notification-item {
        position: fixed;
        bottom: 24px;
        right: 24px;
        padding: 14px 16px;
        background: var(--bg-card);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-xl);
        display: flex;
        gap: 12px;
        font-family: var(--font-stack);
        pointer-events: auto;
        width: 360px;
        box-sizing: border-box;
        transition: transform 0.3s cubic-bezier(0.23, 1, 0.32, 1), opacity 0.3s linear;
    }

    .nexus-notification-content-wrapper {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .nexus-notification-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--text-primary);
        line-height: 1.4;
    }

    .nexus-notification-message {
        font-size: 13px;
        color: var(--text-secondary);
        line-height: 1.5;
        word-break: break-word;
    }

    .nexus-notification-close {
        flex-shrink: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: var(--text-tertiary);
        border-radius: var(--radius-sm);
        transition: all 0.2s;
        margin-top: -2px;
        margin-right: -4px;
    }

    .nexus-notification-close:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
    }

    .nexus-notification-icon {
        width: 18px;
        height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        margin-top: 2px;
    }

    @keyframes nexus-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
    .nexus-spin {
        animation: nexus-spin 1s linear infinite;
    }

    /* 移除 TransitionGroup 默认类名干扰 */
    .nexus-notification-move,
    .nexus-notification-enter-active,
    .nexus-notification-leave-active {
        transition: transform 0.3s cubic-bezier(0.23, 1, 0.32, 1), opacity 0.3s linear;
    }

    .nexus-notification-leave-active {
        position: fixed; /* 保持固定定位 */
        z-index: 0;
        pointer-events: none;
    }

    .nexus-notification-enter-from {
        opacity: 0;
        transform: translate3d(100%, 0, 0);
    }

    .nexus-notification-leave-to {
        opacity: 0;
        transform: translate3d(100%, 0, 0);
    }
  `
  document.head.appendChild(style)
}

const notifications = ref<NotificationItem[]>([])

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
              let iconPath = ''
              let iconColor = ''
              let extraClass = ''

              switch (notif.type) {
                case 'success':
                  iconPath = 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z'
                  iconColor = 'var(--color-success)'
                  break
                case 'error':
                  iconPath = 'M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z'
                  iconColor = 'var(--color-danger)'
                  break
                case 'warning':
                  iconPath = 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z'
                  iconColor = 'var(--color-warning)'
                  break
                case 'loading':
                  iconPath = 'M12 4V2m0 20v-2m8-8h2M2 12h2m13.657-5.657l1.414-1.414m-14.142 14.142l1.414-1.414M17.657 17.657l1.414 1.414M4.343 4.343l1.414 1.414'
                  iconColor = 'var(--text-secondary)'
                  extraClass = 'nexus-spin'
                  break
                default:
                  iconPath = 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z'
                  iconColor = 'var(--color-info)'
              }

              const index = notifications.value.findIndex((n) => n.id === notif.id)
              const offset = (notifications.value.length - 1 - index) * 84 // 假设高度约 84px

              return h('div', {
                key: notif.id,
                class: 'nexus-notification-item',
                style: {
                  transform: `translate3d(0, -${offset}px, 0)`
                }
              }, [
                h('div', { class: ['nexus-notification-icon', extraClass], style: { color: iconColor } }, [
                  h('svg', { viewBox: '0 0 24 24', width: '18', height: '18', fill: notif.type === 'loading' ? 'none' : 'currentColor', stroke: notif.type === 'loading' ? 'currentColor' : 'none', 'stroke-width': '2' }, [
                    h('path', { d: iconPath })
                  ])
                ]),
                h('div', { class: 'nexus-notification-content-wrapper' }, [
                  notif.title ? h('div', { class: 'nexus-notification-title' }, notif.title) : null,
                  h('div', { class: 'nexus-notification-message' }, notif.content)
                ]),
                h('div', {
                  class: 'nexus-notification-close',
                  onClick: (e: MouseEvent) => {
                    e.stopPropagation()
                    const index = notifications.value.findIndex((n) => n.id === notif.id)
                    if (index !== -1) {
                      notifications.value.splice(index, 1)
                    }
                  }
                }, [
                  h('svg', { viewBox: '0 0 24 24', width: '14', height: '14', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
                    h('path', { d: 'M18 6L6 18M6 6l12 12' })
                  ])
                ])
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
  if (typeof window === 'undefined') return () => { }

  mountContainer()

  let id = Date.now()
  try {
    const store = useNotificationStore()
    id = store.addNotification({ type, content, title, duration })
  } catch (e) {
    console.warn('Notification store not available yet:', e)
  }

  const finalDuration = duration !== undefined ? duration : type === 'loading' ? 0 : 4500

  const toastItem: NotificationItem = { id, type, content, title, duration: finalDuration }
  notifications.value.push(toastItem)
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
  loading: (content, title, duration) => addNotification('loading', content, title, duration),
  status: (id, text, options) => {
    try {
      const store = useNotificationStore()
      store.setStatus(id, { text, ...options })
    } catch (e) {
      console.warn('Notification store not available for status:', e)
    }
  },
  removeStatus: (id) => {
    try {
      const store = useNotificationStore()
      store.removeStatus(id)
    } catch (e) {
      console.warn('Notification store not available for removeStatus:', e)
    }
  }
}
