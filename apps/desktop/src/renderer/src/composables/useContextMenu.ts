export interface MenuItem<T = unknown> {
  label?: string
  icon?: VNode
  action?: string
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  type?: 'divider'
  onClick?: (data: T) => void
  children?: MenuItem<T>[] 
  ifShow?: (data: T) => boolean
}


const visible = ref(false)
const position = reactive({ x: 0, y: 0 })
const contextData = ref<unknown>(null) 
const menuOptions = ref<MenuItem<any>[]>([]) 
const submenuVisible = ref(false) 
const submenuPosition = reactive({ x: 0, y: 0 }) 
const submenuOptions = ref<MenuItem<any>[]>([]) 
const parentItem = ref<MenuItem<any> | null>(null) 

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
    submenuVisible.value = false 
  }

  const showSubmenu = (itemElement: HTMLElement, item: MenuItem<T>) => {
    if (!item.children || item.children.length === 0) {
      return
    }

    
    if (!itemElement) {
      return
    }

    submenuOptions.value = item.children
    parentItem.value = item

    
    const rect = itemElement.getBoundingClientRect()
    submenuPosition.x = rect.right 
    submenuPosition.y = rect.top 

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
