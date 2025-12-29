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
  Branch,
  X,
  Terminal,
  ArrowLeft,
  TextBold,
  TextItalic,
  TextUnderline,
  TextStrikethrough,
  Code,
  Quotes,
  ListBulleted,
  ListNumbered,
  TextAlignLeft,
  TextAlignCenter,
  TextAlignRight,
  TextAlignJustify,
  Undo,
  Redo,
  Link,
  Erase,
  Image,
  Table,
  Checkmark,
  SubtractAlt
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
  ChevronRight,
  Dots,
  Robot,
  LayoutSidebar,
  LayoutSidebarLeftCollapse,
  LayoutSidebarLeftExpand,
  FileUpload,
  FileText,
  FileCode,
  FileZip,
  FileMusic,
  File,
  FileCertificate,
  FileAnalytics,
  FileInvoice,
  Markdown,
  Video,
  Box,
  Language,
  Folder,
  Photo,
  Bulb,
  Eye,
  EyeOff,
  InfoCircle
} from '@vicons/tabler'
import {
  CommentAdd16Regular,
  ErrorCircle24Filled,
  Library16Filled,
  Mic16Filled,
  Wrench20Regular
} from '@vicons/fluent'
import { Mic, MicOff, Sparkles } from '@vicons/ionicons5'
import { ArrowBackIosNewSharp } from '@vicons/material'
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
  ChevronRight,
  MoreHorizontal: Dots,
  CommentAdd16Regular,
  FileUpload,
  FileText,
  FileCode,
  FileZip,
  FileMusic,
  File,
  FileCertificate,
  FileAnalytics,
  FileInvoice,
  Markdown,
  Video,
  Mic16Filled,
  Box,
  Language,
  Wrench20Regular,
  Library16Filled,
  Folder,
  FileImage: Photo,
  Sparkles,
  Bulb,
  Eye,
  EyeOff,
  ErrorCircle24Filled,
  InfoCircle,
  X,
  Terminal,
  ArrowBackIosNewSharp,
  Document: FileText,
  ArrowLeft,
  Mic,
  MicOff,
  FormatBold: TextBold,
  FormatItalic: TextItalic,
  FormatUnderlined: TextUnderline,
  FormatStrikethrough: TextStrikethrough,
  FormatCode: Code,
  FormatQuote: Quotes,
  FormatListBulleted: ListBulleted,
  FormatListNumbered: ListNumbered,
  FormatAlignLeft: TextAlignLeft,
  FormatAlignCenter: TextAlignCenter,
  FormatAlignRight: TextAlignRight,
  FormatAlignJustify: TextAlignJustify,
  Undo,
  Redo,
  Link,
  LinkOff: Link,
  FormatClear: Erase,
  FormatImage: Image,
  FormatHorizontalRule: SubtractAlt,
  FormatTable: Table,
  CheckCircle: Checkmark
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
