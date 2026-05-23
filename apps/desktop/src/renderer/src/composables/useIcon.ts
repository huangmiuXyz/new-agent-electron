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
  CheckmarkFilled,
  RadioButton,
  SubtractAlt,
  Pause,
  RotateCounterclockwise,
  RotateClockwise,
  Filter,
  Continue,
  Keyboard
} from '@vicons/carbon'
import {
  Cpu,
  Refresh,
  Copy,
  Search,
  Check,
  Server,
  ChevronUp,
  ArrowBarToUp,
  ArrowBarToDown,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
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
  Artboard,
  Box,
  Language,
  Folder,
  Photo,
  Bulb,
  Eye,
  EyeOff,
  InfoCircle,
  Puzzle,
  X,
  Download,
  Moon,
  Sun,
  Bell,
  Volume,
  Volume2,
  Volume3,
  ZoomIn,
  ZoomOut,
  Dice,
  Database,
  History,
  Maximize as Fullscreen,
  Minimize as FullscreenExit,
  Send
} from '@vicons/tabler'
import {
  ErrorCircle24Filled,
  Library16Filled,
  Mic16Filled,
  Wrench20Regular,
  NoteAdd24Regular,
  Speaker224Regular,
  PeopleTeam20Regular
} from '@vicons/fluent'
import { Globe, Mic, MicOff, Sparkles, VolumeMute, VolumeMedium } from '@vicons/ionicons5'
import { ArrowBackIosNewSharp, EditNoteFilled, UploadOutlined } from '@vicons/material'

const CommentAdd16Regular = defineComponent({
  name: 'CommentAdd16Regular',
  render() {
    return h(
      'svg',
      {
        viewBox: '-192 -192 1408 1408',
        xmlns: 'http://www.w3.org/2000/svg',
        fill: 'currentColor',
        'aria-hidden': 'true'
      },
      [
        h('path', {
          d: 'M153.599886 102.399924a51.199962 51.199962 0 0 0-51.199962 51.199962v543.999596a51.199962 51.199962 0 0 0 51.199962 51.199962h99.213926a51.199962 51.199962 0 0 1 51.199962 51.199962v89.969933l271.473799-135.736899a51.552962 51.552962 0 0 1 22.897983-5.432996H870.399354a51.199962 51.199962 0 0 0 51.199962-51.199962V511.99962a51.199962 51.199962 0 1 1 102.399924 0v185.599862a153.599886 153.599886 0 0 1-153.599886 153.599886H610.502547l-334.847752 167.423876a51.199962 51.199962 0 0 1-74.039945-45.795966V851.199368H153.599886A153.599886 153.599886 0 0 1 0 697.599482v-543.999596A153.599886 153.599886 0 0 1 153.599886 0h300.799777a51.199962 51.199962 0 0 1 0 102.399924H153.599886zM771.213428 0a51.199962 51.199962 0 0 1 51.199962 51.199962v121.59991h121.599909a51.199962 51.199962 0 0 1 0 102.399924h-121.599909v121.59991a51.199962 51.199962 0 1 1-102.399924 0V275.199796h-121.59991a51.199962 51.199962 0 0 1 0-102.399924h121.57191V51.199962a51.199962 51.199962 0 0 1 51.199962-51.199962h0.028z'
        })
      ]
    )
  }
})

export const icons = {
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
  ArrowBarToUp,
  ArrowBarToDown,
  ChevronRight,
  ChevronLeft,
  ZoomIn,
  ZoomOut,
  RotateLeft: RotateCounterclockwise,
  RotateRight: RotateClockwise,
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
  Artboard,
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
  CheckCircle: Checkmark,
  Active: CheckmarkFilled,
  Inactive: RadioButton,
  EditNoteFilled,
  Plugin: Puzzle,
  Dismiss: X,
  Download,
  Moon,
  Sun,
  NoteAdd24Regular,
  Globe,
  Code,
  Bell,
  Volume,
  Volume2,
  Volume3,
  VolumeMedium,
  VolumeMute,
  UploadOutlined,
  Upload: UploadOutlined,
  Speaker224Regular,
  PeopleTeam20Regular,
  Pause,
  Image,
  Dices: Dice,
  Database,
  HistoryClock: History,
  Filter,
  Continue,
  Fullscreen,
  FullscreenExit,
  Keyboard,
  RotateCounterclockwise,
  Send
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
