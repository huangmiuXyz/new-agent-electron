// 菜单项配置接口
export interface MenuItem<T = unknown> {
  label?: string;
  icon?: VNode;
  action?: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  type?: 'divider';
  onClick?: (data: T) => void;
}

// 全局单例状态
const visible = ref(false);
const position = reactive({ x: 0, y: 0 });
const contextData = ref<unknown>(null); // 存储触发右键时的业务数据（如消息对象）
const menuOptions = ref<MenuItem<any>[]>([]); // 存储当前要渲染的菜单项配置

export function useContextMenu<T = unknown>() {

  /**
   * 打开菜单
   * @param {MouseEvent} event - 鼠标事件
   * @param {Array} options - 菜单配置项数组
   * @param {unknown} data - 需要传递给回调的业务数据
   */
  const showContextMenu = (event: MouseEvent, options: MenuItem<T>[], data: T = null as T) => {
    event.preventDefault();
    event.stopPropagation();

    menuOptions.value = options;
    contextData.value = data;

    position.x = event.clientX;
    position.y = event.clientY;

    visible.value = true;
  };

  const hideContextMenu = () => {
    visible.value = false;
  };

  return {
    visible,
    position,
    contextData,
    menuOptions,
    showContextMenu,
    hideContextMenu
  } as {
    visible: typeof visible;
    position: typeof position;
    contextData: typeof contextData;
    menuOptions: typeof menuOptions;
    showContextMenu: (event: MouseEvent, options: MenuItem<T>[], data?: T) => void;
    hideContextMenu: () => void;
  };
}
