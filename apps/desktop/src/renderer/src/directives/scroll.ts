/**
 * v-scroll 指令
 * 用于解决 Electron 中滚轮事件无法正常触发滚动的问题
 *
 * 使用方式:
 * <div v-scroll>...</div>
 * <div v-scroll="{ selector: '.scroll-container' }">...</div>
 */

interface ScrollOptions {
  /** 指定滚动容器的选择器，默认为绑定元素本身 */
  selector?: string
}

type ScrollBinding = {
  value?: ScrollOptions
}

/**
 * 查找最近的滚动容器
 */
function findScrollContainer(el: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = el
  while (current) {
    const style = getComputedStyle(current)
    const overflowY = style.overflowY
    if (overflowY === 'auto' || overflowY === 'scroll') {
      return current
    }
    current = current.parentElement
  }
  return null
}

/**
 * 处理滚轮事件
 */
function handleWheel(event: WheelEvent, binding: ScrollBinding) {
  const target = event.target as HTMLElement
  const options = binding.value || {}

  // 查找滚动容器
  let container: HTMLElement | null = null

  if (options.selector) {
    // 使用指定的选择器查找容器
    container = target.closest(options.selector) as HTMLElement | null
  } else {
    // 查找最近的滚动容器
    container = findScrollContainer(target)
  }

  if (!container) return

  // 手动滚动
  const delta = event.deltaY
  container.scrollTop += delta

  // 阻止默认行为，防止页面滚动
  event.preventDefault()
}

/**
 * 获取或创建事件处理器
 */
const handlers = new WeakMap<HTMLElement, (event: WheelEvent) => void>()

function getHandler(el: HTMLElement, binding: ScrollBinding): (event: WheelEvent) => void {
  let handler = handlers.get(el)
  if (!handler) {
    handler = (event: WheelEvent) => handleWheel(event, binding)
    handlers.set(el, handler)
  }
  return handler
}

export const vScroll = {
  mounted(el: HTMLElement, binding: ScrollBinding) {
    const handler = getHandler(el, binding)
    el.addEventListener('wheel', handler, { passive: false })
  },

  updated(el: HTMLElement, binding: ScrollBinding) {
    // 更新时重新绑定处理器
    const oldHandler = handlers.get(el)
    if (oldHandler) {
      el.removeEventListener('wheel', oldHandler)
    }
    const handler = getHandler(el, binding)
    el.addEventListener('wheel', handler, { passive: false })
  },

  unmounted(el: HTMLElement) {
    const handler = handlers.get(el)
    if (handler) {
      el.removeEventListener('wheel', handler)
      handlers.delete(el)
    }
  }
}

// 导出类型
export type { ScrollOptions, ScrollBinding }
