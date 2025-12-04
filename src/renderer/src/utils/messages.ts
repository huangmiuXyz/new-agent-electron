import { createVNode, render, ref, TransitionGroup, defineComponent, h } from 'vue'

export type MessageType = 'success' | 'error' | 'warning' | 'info' | 'loading'

export interface MessageItem {
  id: number
  type: MessageType
  content: string
}

// 返回的关闭函数类型
export type CloseMessage = () => void

// 具体的调用方法签名
export type MessageHandler = (content: string, duration?: number) => CloseMessage

// 导出的对象接口
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
  // 在 message.ts 中

  style.innerHTML = `
    .nexus-message-container {
        position: fixed;
        top: 24px;
        left: 0; /* 改为 0 */
        width: 100%; /* 改为 100%，占满屏幕宽度，这样容器永远不会变形 */
        /* transform: translateX(-50%);  <-- 删除这一行，不再需要移动容器 */
        z-index: 5000;
        display: flex;
        flex-direction: column;
        align-items: center; /* 让内部的消息条在 100% 宽度的容器里水平居中 */
        pointer-events: none; /* 关键：让点击穿透全屏透明容器 */
    }
    
    .nexus-message-item {
        margin-bottom: 12px;
        padding: 9px 16px;
        background: #fff;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.05);
        border: 1px solid #e1e1e3;
        display: flex;
        align-items: center;
        gap: 8px;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        color: #202020;
        
        pointer-events: auto; 
        width: max-content;
        max-width: 80vw; 
        box-sizing: border-box;

        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .nexus-message-icon {
        font-size: 16px;
        display: flex;
        align-items: center;
        flex-shrink: 0;
    } 
    .nexus-message-enter-from,
    .nexus-message-leave-to {
        opacity: 0;
        transform: translateY(-20px);
    }

    .nexus-message-leave-active {
        position: absolute; 
        left: 0;
        right: 0;
        margin: 0 auto; 
        width: fit-content; 
        width: fit-content; 
        
        z-index: -1;
    }

    .nexus-message-move {
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
`
  document.head.appendChild(style)
}

// 使用泛型定义 ref
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

              switch (msg.type) {
                case 'success':
                  iconClass = 'ph-fill ph-check-circle'
                  iconColor = '#2e7d32'
                  break
                case 'error':
                  iconClass = 'ph-fill ph-x-circle'
                  iconColor = '#d72c0d'
                  break
                case 'warning':
                  iconClass = 'ph-fill ph-warning-circle'
                  iconColor = '#faad14'
                  break
                case 'loading':
                  iconClass = 'ph ph-spinner ph-spin'
                  iconColor = '#000000'
                  break
                default: // info
                  iconClass = 'ph-fill ph-info'
                  iconColor = '#1890ff'
              }

              return h('div', { key: msg.id, class: 'nexus-message-item' }, [
                h('i', { class: [iconClass, 'nexus-message-icon'], style: { color: iconColor } }),
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
  document.body.appendChild(container)
  // createVNode 不需要泛型，它会自动推断
  const vnode = createVNode(MessageComponent)
  render(vnode, container)
}

/**
 * 添加消息的核心函数
 */
const addMessage = (type: MessageType, content: string, duration?: number): CloseMessage => {
  if (typeof window === 'undefined') {
    // SSR 安全处理：如果是服务端渲染，返回空函数
    return () => {}
  }

  mountContainer()
  const id = seed++

  // 如果是 loading，默认 duration 为 0 (不自动关闭)，其他默认 3000ms
  const finalDuration = duration !== undefined ? duration : type === 'loading' ? 0 : 3000

  const msgObj: MessageItem = { id, type, content }
  messages.value.push(msgObj)

  // 定义关闭函数
  const close: CloseMessage = () => {
    const index = messages.value.findIndex((m) => m.id === id)
    if (index !== -1) {
      messages.value.splice(index, 1)
    }
  }

  // 如果有持续时间，则设定定时器
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
