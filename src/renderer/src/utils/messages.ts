import { createVNode, render, ref, TransitionGroup, defineComponent, h } from 'vue'

export type MessageType = 'success' | 'error' | 'warning' | 'info' | 'loading'

export interface MessageItem {
  id: number
  type: MessageType
  content: string
}

export type CloseMessage = () => void
export type MessageHandler = (content: string, duration?: number) => CloseMessage

export interface MessageApi {
  info: MessageHandler
  success: MessageHandler
  error: MessageHandler
  warning: MessageHandler
  loading: MessageHandler
}

const styleId = 'nexus-message-style'

if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const style = document.createElement('style')
  style.id = styleId

  // 优化后的 CSS：类似 Vercel/Sonner 的现代风格
  style.innerHTML = `
    :root {
      --nexus-font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }

    .nexus-message-container {
        position: fixed;
        top: 24px;
        left: 0;
        width: 100%;
        z-index: 5000;
        display: flex;
        flex-direction: column;
        align-items: center;
        pointer-events: none; /* 点击穿透 */
    }
    
    .nexus-message-item {
        margin-bottom: 16px; /* 增加间距 */
        padding: 10px 18px; /* 增加内边距 */
        
        /* 现代化的背景与边框处理 */
        background: rgba(255, 255, 255, 0.96);
        backdrop-filter: blur(8px); /* 毛玻璃效果（如果浏览器支持） */
        border: 1px solid rgba(0, 0, 0, 0.06);
        border-radius: 12px; /* 更大的圆角 */
        
        /* 柔和的高级阴影 */
        box-shadow: 
            0 4px 6px -1px rgba(0, 0, 0, 0.05), 
            0 10px 15px -3px rgba(0, 0, 0, 0.05);

        display: flex;
        align-items: center;
        gap: 10px;
        
        font-family: var(--nexus-font);
        font-size: 14px; /* 稍微调大字号 */
        font-weight: 500; /* 增加字重 */
        color: #1f2937; /* 深灰而非纯黑，更柔和 */
        
        pointer-events: auto; 
        box-sizing: border-box;
        
        /* 限制最大宽度，防止太长 */
        max-width: 85vw;
        width: fit-content;

        /* 动画性能优化 */
        will-change: transform, opacity;
    }

    .nexus-message-icon {
        font-size: 18px; /* 调整图标大小 */
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    /* 针对 Loading 的旋转动画，不依赖外部 CSS 库 */
    @keyframes nexus-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
    .nexus-spin {
        animation: nexus-spin 1s linear infinite;
    }

    /* ---------------- 动画阶段 ---------------- */
    
    .nexus-message-move,
    .nexus-message-enter-active,
    .nexus-message-leave-active {
        transition: all 0.4s cubic-bezier(0.25, 1, 0.5, 1); /* 使用更平滑的 cubic-bezier */
    }

    /* 进入前 */
    .nexus-message-enter-from {
        opacity: 0;
        transform: translateY(-30px) scale(0.95);
    }

    /* 离开后 */
    .nexus-message-leave-to {
        opacity: 0;
        transform: translateY(-20px) scale(0.95);
    }

    /* 离开时的绝对定位处理，确保平滑移除 */
    .nexus-message-leave-active {
        position: absolute;
    }
`
  document.head.appendChild(style)
}

const messages = ref<MessageItem[]>([])
let seed = 0

const MessageComponent = defineComponent({
  name: 'NexusMessage',
  setup() {
    return () =>
      h(
        TransitionGroup,
        { name: 'nexus-message', tag: 'div', class: 'nexus-message-container' },
        {
          default: () =>
            messages.value.map((msg) => {
              let iconClass = ''
              let iconColor = ''
              // 额外的样式类，用于 loading 旋转
              let extraClass = ''

              // 使用更现代、柔和的调色板 (Tailwind 风格)
              switch (msg.type) {
                case 'success':
                  iconClass = 'ph-fill ph-check-circle'
                  iconColor = '#10B981' // Emerald 500
                  break
                case 'error':
                  iconClass = 'ph-fill ph-x-circle'
                  iconColor = '#EF4444' // Red 500
                  break
                case 'warning':
                  iconClass = 'ph-fill ph-warning-circle'
                  iconColor = '#F59E0B' // Amber 500
                  break
                case 'loading':
                  iconClass = 'ph ph-spinner'
                  iconColor = '#6B7280' // Gray 500
                  extraClass = 'nexus-spin'
                  break
                default: // info
                  iconClass = 'ph-fill ph-info'
                  iconColor = '#3B82F6' // Blue 500
              }

              // 合并图标类名
              const finalIconClass = [iconClass, 'nexus-message-icon', extraClass]

              return h('div', { key: msg.id, class: 'nexus-message-item' }, [
                h('i', { class: finalIconClass, style: { color: iconColor } }),
                h('span', null, msg.content)
              ])
            })
        }
      )
  }
})

let container: HTMLElement | null = null

function mountContainer(): void {
  if (container) return
  container = document.createElement('div')
  // 添加一个特定的 ID 方便调试或覆盖
  container.id = 'nexus-message-root'
  document.body.appendChild(container)
  const vnode = createVNode(MessageComponent)
  render(vnode, container)
}

const addMessage = (type: MessageType, content: string, duration?: number): CloseMessage => {
  if (typeof window === 'undefined') return () => {}

  mountContainer()
  const id = seed++

  // Loading 默认不关闭，其他默认 3000ms
  const finalDuration = duration !== undefined ? duration : type === 'loading' ? 0 : 3000

  const msgObj: MessageItem = { id, type, content }
  messages.value.push(msgObj)

  const close: CloseMessage = () => {
    const index = messages.value.findIndex((m) => m.id === id)
    if (index !== -1) {
      messages.value.splice(index, 1)
    }
  }

  if (finalDuration > 0) {
    setTimeout(close, finalDuration)
  }

  return close
}

export const messageApi: MessageApi = {
  info: (content, duration) => addMessage('info', content, duration),
  success: (content, duration) => addMessage('success', content, duration),
  error: (content, duration) => addMessage('error', content, duration),
  warning: (content, duration) => addMessage('warning', content, duration),
  loading: (content, duration) => addMessage('loading', content, duration)
}
