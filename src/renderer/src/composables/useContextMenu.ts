// 菜单项配置接口
export interface MenuItem<T = unknown> {
  label?: string
  icon?: VNode
  action?: string
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  type?: 'divider'
  onClick?: (data: T) => void
  children?: MenuItem<T>[] // 子菜单项
  ifShow?: (data: T) => boolean
}

// 全局单例状态
const visible = ref(false)
const position = reactive({ x: 0, y: 0 })
const contextData = ref<unknown>(null) // 存储触发右键时的业务数据（如消息对象）
const menuOptions = ref<MenuItem<any>[]>([]) // 存储当前要渲染的菜单项配置
const submenuVisible = ref(false) // 子菜单是否可见
const submenuPosition = reactive({ x: 0, y: 0 }) // 子菜单位置
const submenuOptions = ref<MenuItem<any>[]>([]) // 子菜单项配置
const parentItem = ref<MenuItem<any> | null>(null) // 当前子菜单的父菜单项

export function useContextMenu<T = unknown>() {
  /**
   * 打开菜单
   * @param {MouseEvent} event - 鼠标事件
   * @param {Array} options - 菜单配置项数组
   * @param {unknown} data - 需要传递给回调的业务数据
   */
  const showContextMenu = (event: MouseEvent, options: MenuItem<T>[], data: T = null as T) => {
    event.preventDefault()
    event.stopPropagation()

    menuOptions.value = options
    contextData.value = data

    position.x = event.clientX
    position.y = event.clientY

    visible.value = true
  }

  const hideContextMenu = () => {
    visible.value = false
    submenuVisible.value = false // 隐藏主菜单时也隐藏子菜单
  }

  const showSubmenu = (itemElement: HTMLElement, item: MenuItem<T>) => {
    if (!item.children || item.children.length === 0) {
      return
    }

    // 检查菜单项元素是否存在
    if (!itemElement) {
      return
    }

    submenuOptions.value = item.children
    parentItem.value = item

    // 计算子菜单位置，基于菜单项元素的位置
    const rect = itemElement.getBoundingClientRect()
    submenuPosition.x = rect.right // 父菜单项的右侧
    submenuPosition.y = rect.top // 与父菜单项顶部对齐

    submenuVisible.value = true
  }

  const hideSubmenu = () => {
    submenuVisible.value = false
  }

  return {
    visible,
    position,
    contextData,
    menuOptions,
    submenuVisible,
    submenuPosition,
    submenuOptions,
    parentItem,
    showContextMenu,
    hideContextMenu,
    showSubmenu,
    hideSubmenu
  } as {
    visible: typeof visible
    position: typeof position
    contextData: typeof contextData
    menuOptions: typeof menuOptions
    submenuVisible: typeof submenuVisible
    submenuPosition: typeof submenuPosition
    submenuOptions: typeof submenuOptions
    parentItem: typeof parentItem
    showContextMenu: (event: MouseEvent, options: MenuItem<T>[], data?: T) => void
    hideContextMenu: () => void
    showSubmenu: (itemElement: HTMLElement, item: MenuItem<T>) => void
    hideSubmenu: () => void
  }
}
