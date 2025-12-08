import { Icon } from '@vicons/utils'
import {
  Edit,
  Add,
  TrashCan,
  Close,
  Settings,
  Screen,
  Delete,
  Play,
  Stop,
  Chat,
  Menu,
  Branch
} from '@vicons/carbon'
import {
  Cpu,
  Refresh,
  Copy,
  Search,
  Check,
  Server,
  ChevronDown,
  ChevronUp,
  Robot,
  LayoutSidebar,
  LayoutSidebarLeftCollapse,
  LayoutSidebarLeftExpand
} from '@vicons/tabler'
import { CommentAdd20Filled } from '@vicons/fluent'
const icons = {
  Edit,
  Pencil: Edit,
  Plus: Add,
  Trash: TrashCan,
  Close,
  Settings,
  Cpu,
  Chat,
  Branch,
  Screen,
  Refresh,
  Delete,
  Copy,
  Search,
  Check,
  Server,
  Robot,
  Play,
  Stop,
  Menu,
  Panel: LayoutSidebar,
  PanelClose: LayoutSidebarLeftCollapse,
  PanelOpen: LayoutSidebarLeftExpand,
  ChevronDown,
  ChevronUp,
  CommentAdd20Filled
}

type IconResult<T extends keyof typeof icons | (keyof typeof icons)[]> =
  T extends (keyof typeof icons)[]
    ? { [K in T[number]]?: ReturnType<typeof h> }
    : ReturnType<typeof h>

export const useIcon = <T extends keyof typeof icons | (keyof typeof icons)[]>(
  iconName: T
): IconResult<T> => {
  if (Array.isArray(iconName)) {
    const result = {} as { [key: string]: ReturnType<typeof h> | null }

    iconName.forEach((name) => {
      const IconComponent = icons[name]
      result[name as string] = h(
        Icon,
        {},
        {
          default: () => h(IconComponent)
        }
      )
    })

    return result as IconResult<T>
  }

  const IconComponent = icons[iconName as keyof typeof icons]

  const icon = h(
    Icon,
    {},
    {
      default: () => h(IconComponent)
    }
  )

  return icon as IconResult<T>
}
