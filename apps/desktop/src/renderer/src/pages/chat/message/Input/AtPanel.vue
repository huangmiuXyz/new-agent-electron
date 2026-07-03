<script setup lang="ts">
import { type VNode } from 'vue'
import SelectorPopover from '@renderer/components/SelectorPopover.vue'
import List from '@renderer/components/List.vue'
import { discoverSkills, type SkillMetadata } from '@renderer/services/skillsService'
import { useIcon } from '@renderer/composables/useIcon'
import { debounce } from '@renderer/utils'
import {
  getWorkspaceEntry,
  listWorkspaceEntries,
  normalizeWorkspacePath,
  searchWorkspaceEntries,
  type WorkspaceFileEntry
} from '@renderer/services/fileMentionsService'
import {
  formatNoteMentionPath,
  listNoteEntries,
  searchNoteEntries,
  type NoteMentionEntry
} from '@renderer/services/noteMentionsService'

interface Props {
  mobile?: boolean
  emptyText?: string
}

interface MentionRange {
  start: number
  end: number
}

type MentionScope = 'all' | 'skills' | 'files' | 'notes' | 'agents'

type MentionItemData =
  | { type: 'skill'; skill: SkillMetadata }
  | { type: 'file'; entry: WorkspaceFileEntry }
  | { type: 'file-nav'; targetDir: string }
  | { type: 'note'; entry: NoteMentionEntry }
  | { type: 'note-nav'; targetFolderId: string | null }
  | { type: 'agent'; agent: Agent }

export interface MentionApplyPayload {
  message: string
  cursor: number
}

export interface MentionKeydownResult {
  handled: boolean
  payload?: MentionApplyPayload | null
}

const props = withDefaults(defineProps<Props>(), {
  mobile: false,
  emptyText: '未找到匹配项'
})

const emit = defineEmits<{
  apply: [payload: MentionApplyPayload]
  preview: [payload: MentionApplyPayload]
}>()

const chatStore = useChatsStores()
const agentStore = useAgentStore()
const canvasStore = useCanvasStore()
const panelRef = useTemplateRef<HTMLDivElement>('panelRef')

const currentChatAgent = computed(() => {
  const agentId = chatStore.currentChat?.agentId
  return agentId ? agentStore.getAgentById(agentId) : null
})

// ── Regex patterns ──
const SKILL_MENTION_NAMESPACE_REGEX = /(^|[\s\S])@(skills|技能):([a-z0-9-]*)$/i
const FILE_MENTION_NAMESPACE_REGEX =
  /(^|[\s\S])@(file|文件):(?:"([^"\n\r]*)"|'([^'\n\r]*)'|([^\s]*))$/i
const NOTE_MENTION_NAMESPACE_REGEX =
  /(^|[\s\S])@(note|笔记):(?:"([^"\n\r]*)"|'([^'\n\r]*)'|([^\s]*))$/i
const AGENT_MENTION_NAMESPACE_REGEX = /(^|[\s\S])@(agent|智能体):([a-z0-9-\u4e00-\u9fa5]*)$/i
const PARTIAL_MENTION_REGEX = /(^|[\s\S])@([^\s]*)$/i

// ── Data sources ──
const availableSkills = computed<SkillMetadata[]>(() => {
  void currentChatAgent.value?.id
  void currentChatAgent.value?.skillDirectory
  void chatStore.currentChat?.id
  return discoverSkills()
})

const availableAgents = computed<Agent[]>(() => {
  return agentStore.allAgents
})

// ── Ref state ──
const isOpen = ref(false)
const mentionScope = ref<MentionScope>('all')
const query = ref('')
const mentionRange = ref<MentionRange | null>(null)
const sourceMessage = ref('')
const previewMessage = ref('')
const suppressedMessage = ref<string | null>(null)
const previewScope = ref<Exclude<MentionScope, 'all'> | null>(null)
const rootPreviewScope = ref<Exclude<MentionScope, 'all'> | null>(null)
const allowPreviewOnActiveChange = ref(false)
const activeIndex = ref(0)

// File directory state
const currentFileDirectory = ref('')
const fileListStrategy = ref<'search' | 'directory'>('directory')
const currentNoteFolderId = ref<string | null>(null)
const noteListStrategy = ref<'search' | 'directory'>('directory')

let closeTimer: ReturnType<typeof setTimeout> | null = null

const currentWorkPath = computed(() => {
  const workPath = canvasStore.getWorkPath(chatStore.currentChat?.id)
  return workPath ? normalizeWorkspacePath(workPath) : ''
})

// ── Computed search results ──

/** Filtered skills based on query */
const filteredSkills = computed(() => {
  const normalizedQuery = query.value.trim().toLowerCase()
  const exactMatches = availableSkills.value.filter(
    (skill) => skill.name.toLowerCase() === normalizedQuery
  )
  const fuzzyMatches = availableSkills.value.filter((skill) => {
    const name = skill.name.toLowerCase()
    const description = skill.description.toLowerCase()
    if (!normalizedQuery) return true
    return name.includes(normalizedQuery) || description.includes(normalizedQuery)
  })

  return normalizedQuery
    ? [...exactMatches, ...fuzzyMatches.filter((skill) => !exactMatches.includes(skill))]
    : fuzzyMatches
})

/** Filtered agents based on query */
const filteredAgents = computed(() => {
  const normalizedQuery = query.value.trim().toLowerCase()
  if (!normalizedQuery) return availableAgents.value
  return availableAgents.value.filter((agent) => {
    const name = agent.name.toLowerCase()
    const description = (agent.description || '').toLowerCase()
    return name.includes(normalizedQuery) || description.includes(normalizedQuery)
  })
})

/** File entries for current directory or search results */
const fileEntries = ref<WorkspaceFileEntry[]>([])

const refreshFileEntries = (nextQuery: string) => {
  if (!currentWorkPath.value) {
    fileEntries.value = []
    return
  }

  const isDirNav = nextQuery.endsWith('/')
  if (isDirNav) {
    // Directory navigation: show contents of the directory path
    const dirPath = nextQuery.replace(/[\\/]+$/, '')
    const dirEntry = dirPath ? getWorkspaceEntry(currentWorkPath.value, dirPath) : null
    if (!dirEntry || dirEntry.kind !== 'directory') {
      fileEntries.value = []
      return
    }
    currentFileDirectory.value = dirEntry.relativePath
    fileListStrategy.value = 'directory'
    fileEntries.value = listWorkspaceEntries(currentWorkPath.value, dirEntry.relativePath)
    return
  }

  const isAllScopeSearch = mentionScope.value === 'all' && Boolean(nextQuery)
  const shouldSearch = isAllScopeSearch || (Boolean(nextQuery) && fileListStrategy.value === 'search')
  fileEntries.value = shouldSearch
    ? searchWorkspaceEntries(currentWorkPath.value, nextQuery, { limit: 80 })
    : listWorkspaceEntries(currentWorkPath.value, currentFileDirectory.value)
}

const debouncedRefreshFileEntries = debounce((nextQuery: string) => {
  refreshFileEntries(nextQuery)
}, 200)

/** Note entries for current folder or search results */
const noteEntries = ref<NoteMentionEntry[]>([])

const getParentDirectory = (relativePath: string) => {
  if (!relativePath) return ''
  return relativePath.split('/').slice(0, -1).join('/')
}

const formatFileMentionPath = (relativePath: string) => {
  if (!/\s/.test(relativePath)) {
    return relativePath
  }
  return `"${relativePath.replaceAll('"', '\\"')}"`
}

const refreshNoteEntries = (nextQuery: string) => {
  const isAllScopeSearch = mentionScope.value === 'all' && Boolean(nextQuery)
  const isNotesScopeSearch = mentionScope.value === 'notes' && Boolean(nextQuery) && noteListStrategy.value === 'search'
  if (isAllScopeSearch || isNotesScopeSearch) {
    noteEntries.value = searchNoteEntries(nextQuery, { limit: 80 })
  } else {
    noteEntries.value = listNoteEntries(currentNoteFolderId.value)
  }
}

const debouncedRefreshNoteEntries = debounce((nextQuery: string) => {
  refreshNoteEntries(nextQuery)
}, 100)

// ── Section groups (source for listItems) ──

interface SectionItem {
  id: string
  label: string
  description?: string
  data: MentionItemData
}

interface SectionGroup {
  key: string
  title: string
  items: SectionItem[]
}

const sectionGroups = computed((): SectionGroup[] => {
  const nq = query.value.trim()
  const isAllScope = mentionScope.value === 'all'
  const isDirNav = isAllScope && nq.endsWith('/')
  const groups: SectionGroup[] = []

  // Skills section
  if (mentionScope.value === 'all' || mentionScope.value === 'skills') {
    const skills = filteredSkills.value
    if (skills.length > 0) {
      groups.push({
        key: 'skills',
        title: '技能',
        items: skills.map((skill) => ({
          id: `skill:${skill.name}`,
          label: `${skill.name}`,
          description: skill.description,
          data: { type: 'skill', skill } satisfies MentionItemData
        }))
      })
    }
  }

  // Files section
  if (mentionScope.value === 'all' || mentionScope.value === 'files') {
    if (currentWorkPath.value) {
      const fileItems: SectionItem[] = []

      if (isDirNav) {
        const dirPath = nq.replace(/[\\\/]+$/, '')
        if (dirPath) {
          const parentDir = getParentDirectory(dirPath)
          if (parentDir !== currentFileDirectory.value) {
            fileItems.push({
              id: 'file-nav:parent',
              label: '..',
              description: '返回上级目录',
              data: { type: 'file-nav', targetDir: parentDir } satisfies MentionItemData
            })
          }
        }
        for (const entry of fileEntries.value) {
          fileItems.push({
            id: `file:${entry.relativePath}`,
            label: entry.kind === 'directory' ? `${entry.name}/` : entry.name,
            description: entry.kind === 'directory' ? '文件夹' : entry.relativePath,
            data: { type: 'file', entry } satisfies MentionItemData
          })
        }
      } else if (!isAllScope || !nq) {
        for (const entry of fileEntries.value) {
          fileItems.push({
            id: `file:${entry.relativePath}`,
            label: entry.kind === 'directory' ? `${entry.name}/` : entry.name,
            description: entry.kind === 'directory' ? '文件夹' : entry.relativePath,
            data: { type: 'file', entry } satisfies MentionItemData
          })
        }
      } else {
        for (const entry of fileEntries.value) {
          fileItems.push({
            id: `file:${entry.relativePath}`,
            label: entry.kind === 'directory' ? `${entry.name}/` : entry.name,
            description: entry.relativePath,
            data: { type: 'file', entry } satisfies MentionItemData
          })
        }
      }

      if (fileItems.length > 0) {
        groups.push({ key: 'files', title: '文件', items: fileItems })
      }
    }
  }

  // Notes section
  if (!isDirNav && (mentionScope.value === 'all' || mentionScope.value === 'notes')) {
    const noteItems: SectionItem[] = []
    for (const entry of noteEntries.value) {
      noteItems.push({
        id: `note:${entry.kind}:${entry.id}`,
        label: entry.kind === 'folder' ? `${entry.name}/` : entry.name,
        description: entry.path,
        data: { type: 'note', entry } satisfies MentionItemData
      })
    }
    if (noteItems.length > 0) {
      groups.push({ key: 'notes', title: '笔记', items: noteItems })
    }
  }

  // Agents section
  if (!isDirNav && (mentionScope.value === 'all' || mentionScope.value === 'agents')) {
    const agents = filteredAgents.value
    if (agents.length > 0) {
      groups.push({
        key: 'agents',
        title: '智能体',
        items: agents.map((agent) => ({
          id: `agent:${agent.id}`,
          label: `${agent.name}`,
          description: agent.description || '暂无描述',
          data: { type: 'agent', agent } satisfies MentionItemData
        }))
      })
    }
  }

  return groups
})

const skillIcon = useIcon('Wrench20Regular')
const fileIcon = useIcon('FileText')
const noteIcon = useIcon('NoteAdd24Regular')
const agentIcon = useIcon('Robot')

const typeIconVNodes: Record<string, VNode> = {
  skill: skillIcon,
  file: fileIcon,
  note: noteIcon,
  agent: agentIcon
}

/** Flatten all section items into a single list (no grouping) */
const flatSelectableItems = computed((): SectionItem[] => {
  const items: SectionItem[] = []
  for (const section of sectionGroups.value) {
    for (const item of section.items) {
      items.push(item)
    }
  }
  return items
})

const clampedActiveIndex = computed(() => {
  const len = flatSelectableItems.value.length
  if (len === 0) return -1
  return Math.min(Math.max(activeIndex.value, 0), len - 1)
})
// ── List item conversion ──

interface ListItemData {
  key: string
  name: string
  description: string
  _isDir: boolean
  _data: MentionItemData
  logo?: VNode | null
  isIcon?: boolean
}

const toListItems = (items: SectionItem[]): ListItemData[] => {
  return items.map((item) => ({
    key: item.id,
    name: item.label,
    description: item.description || '',
    _isDir: item.data.type === 'file' && item.data.entry.kind === 'directory',
    _data: item.data,
    logo: typeIconVNodes[item.data.type] ?? null,
    isIcon: true
  }))
}

/** Resolve the currently active item's key */
const activeItemId = computed((): string | undefined => {
  const idx = clampedActiveIndex.value
  if (idx < 0) return undefined
  return flatSelectableItems.value[idx]?.id
})

const handleListSelect = (key: string) => {
  for (const item of flatSelectableItems.value) {
    if (item.id === key) {
      handleItemClick(item.data)
      return
    }
  }
}

// Keep scrollActiveIntoView working for the List component
const scrollActiveIntoView = () => {
  nextTick(() => {
    if (!panelRef.value) return
    const scrollArea = panelRef.value.querySelector('.list-scroll-area')
    if (!scrollArea) return
    const active = scrollArea.querySelector('.is-active, .mention-item--active')
    if (!active) return
    active.scrollIntoView({ block: 'nearest' })
  })
}

// ── Helper functions ──

const resolveMentionStart = (match: RegExpMatchArray, cursor: number) => {
  const leadingToken = match[1] || ''
  return cursor - (match[0]?.length || 0) + leadingToken.length
}

const resolveMentionStartFromBeforeCursor = (beforeCursor: string, fallbackMatch: RegExpMatchArray, cursor: number) => {
  const mentionStart = beforeCursor.lastIndexOf('@')
  return mentionStart >= 0 ? mentionStart : resolveMentionStart(fallbackMatch, cursor)
}

let _panelOpened = false

const closePanel = (options?: { suppressCurrentMessage?: boolean }) => {
  // Panel just opened in this tick — don't let syncMentionState(keydown) close it
  if (!_panelOpened && !isOpen.value) return
  _panelOpened = false
  suppressedMessage.value = options?.suppressCurrentMessage
    ? (previewMessage.value || sourceMessage.value || suppressedMessage.value)
    : null
  isOpen.value = false
  mentionScope.value = 'all'
  query.value = ''
  mentionRange.value = null
  sourceMessage.value = ''
  previewMessage.value = ''
  previewScope.value = null
  rootPreviewScope.value = null
  allowPreviewOnActiveChange.value = false
  activeIndex.value = 0
  currentFileDirectory.value = ''
  fileListStrategy.value = 'directory'
  currentNoteFolderId.value = null
  noteListStrategy.value = 'directory'
  fileEntries.value = []
  noteEntries.value = []
}

const openPanel = () => {
  _panelOpened = true
  isOpen.value = true
  nextTick(() => { _panelOpened = false })
}

const clearCloseTimer = () => {
  if (!closeTimer) return
  clearTimeout(closeTimer)
  closeTimer = null
}

const scheduleClose = () => {
  clearCloseTimer()
  closeTimer = setTimeout(() => {
    closePanel({ suppressCurrentMessage: true })
  }, 120)
}

const applyMentionParseResult = (
  scope: MentionScope,
  nextQuery: string,
  nextRange: MentionRange
) => {
  const shouldResetDirectory =
    mentionScope.value !== scope ||
    mentionRange.value?.start !== nextRange.start

  mentionScope.value = scope
  query.value = nextQuery
  mentionRange.value = nextRange
  activeIndex.value = 0

  if (shouldResetDirectory) {
    currentFileDirectory.value = ''
    currentNoteFolderId.value = null
  }

  const normalizedQuery = nextQuery.trim()
  if (scope === 'files' && normalizedQuery) {
    const trailingSlashQuery = normalizedQuery.replace(/[\\/]+$/, '')
    const shouldEnterDirectory = trailingSlashQuery.length > 0 && trailingSlashQuery !== normalizedQuery

    if (shouldEnterDirectory && currentWorkPath.value) {
      const directoryEntry = getWorkspaceEntry(currentWorkPath.value, trailingSlashQuery)
      if (directoryEntry?.kind === 'directory') {
        currentFileDirectory.value = directoryEntry.relativePath
        fileListStrategy.value = 'directory'
        return
      }
    }
  }

  fileListStrategy.value = scope === 'files' && normalizedQuery ? 'search' : 'directory'
  noteListStrategy.value = scope === 'notes' && normalizedQuery ? 'search' : 'directory'
}

// ── Payload builders ──

const buildSkillMentionPayload = (skill: SkillMetadata): MentionApplyPayload | null => {
  const range = mentionRange.value
  if (!range) return null

  const mentionText = `@skills:${skill.name} `
  const nextMessage = `${sourceMessage.value.slice(0, range.start)}${mentionText}${sourceMessage.value.slice(range.end)}`
  const cursor = range.start + mentionText.length

  previewMessage.value = nextMessage
  previewScope.value = 'skills'
  rootPreviewScope.value = null

  return { message: nextMessage, cursor }
}

const buildFileMentionPayload = (entry: WorkspaceFileEntry): MentionApplyPayload | null => {
  const range = mentionRange.value
  if (!range) return null

  const mentionText = `@file:${formatFileMentionPath(entry.relativePath)} `
  const nextMessage = `${sourceMessage.value.slice(0, range.start)}${mentionText}${sourceMessage.value.slice(range.end)}`
  const cursor = range.start + mentionText.length

  previewMessage.value = nextMessage
  previewScope.value = 'files'
  rootPreviewScope.value = null

  return { message: nextMessage, cursor }
}

const buildNoteMentionPayload = (entry: NoteMentionEntry): MentionApplyPayload | null => {
  const range = mentionRange.value
  if (!range) return null

  const mentionText = `@note:${formatNoteMentionPath(entry.path || entry.id)} `
  const nextMessage = `${sourceMessage.value.slice(0, range.start)}${mentionText}${sourceMessage.value.slice(range.end)}`
  const cursor = range.start + mentionText.length

  previewMessage.value = nextMessage
  previewScope.value = 'notes'
  rootPreviewScope.value = null

  return { message: nextMessage, cursor }
}

const buildAgentMentionPayload = (agent: Agent): MentionApplyPayload | null => {
  const range = mentionRange.value
  if (!range) return null

  const mentionText = `@agent:${agent.name} `
  const nextMessage = `${sourceMessage.value.slice(0, range.start)}${mentionText}${sourceMessage.value.slice(range.end)}`
  const cursor = range.start + mentionText.length

  previewMessage.value = nextMessage
  previewScope.value = 'agents'
  rootPreviewScope.value = null

  return { message: nextMessage, cursor }
}

const buildMentionPayload = (data: MentionItemData): MentionApplyPayload | null => {
  if (data.type === 'skill') return buildSkillMentionPayload(data.skill)
  if (data.type === 'file') return buildFileMentionPayload(data.entry)
  if (data.type === 'note') return buildNoteMentionPayload(data.entry)
  if (data.type === 'agent') return buildAgentMentionPayload(data.agent)
  return null
}

// ── Navigation helpers ──

const getActiveData = (): MentionItemData | null => {
  const idx = clampedActiveIndex.value
  if (idx < 0) return null
  return flatSelectableItems.value[idx]?.data ?? null
}

// ── Core state sync ──

type MentionCursorSource = HTMLTextAreaElement | number | null | undefined
const CONFIRMED_MENTION_LOOKUP_REGEX = /<\|at_start\|>[\s\S]*?<\|at_end\|>/g

const resolveMentionCursor = (message: string, cursorSource?: MentionCursorSource) => {
  if (typeof cursorSource === 'number') {
    return Math.min(Math.max(cursorSource, 0), message.length)
  }
  return cursorSource?.selectionStart ?? message.length
}

const syncMentionState = (message: string, cursorSource?: MentionCursorSource) => {
  if (suppressedMessage.value) {
    if (message === suppressedMessage.value) return
    suppressedMessage.value = null
  }

  allowPreviewOnActiveChange.value = false
  if (message !== previewMessage.value) {
    sourceMessage.value = message
    rootPreviewScope.value = null
  }
  clearCloseTimer()

  if (cursorSource == null) {
    closePanel()
    return
  }

  const cursor = resolveMentionCursor(message, cursorSource)
  const beforeCursor = message
    .slice(0, cursor)
    .replace(CONFIRMED_MENTION_LOOKUP_REGEX, (match) => ' '.repeat(match.length))

  if (
    message === previewMessage.value &&
    isOpen.value &&
    mentionRange.value &&
    cursor === message.length
  ) {
    return
  }

  // 1. Check namespaced mentions first (backward compat)
  const fileMatch = beforeCursor.match(FILE_MENTION_NAMESPACE_REGEX)
  if (fileMatch) {
    applyMentionParseResult('files', fileMatch[3] || fileMatch[4] || fileMatch[5] || '', {
      start: resolveMentionStartFromBeforeCursor(beforeCursor, fileMatch, cursor),
      end: cursor
    })
    openPanel()
    return
  }

  const noteMatch = beforeCursor.match(NOTE_MENTION_NAMESPACE_REGEX)
  if (noteMatch) {
    applyMentionParseResult('notes', noteMatch[3] || noteMatch[4] || noteMatch[5] || '', {
      start: resolveMentionStartFromBeforeCursor(beforeCursor, noteMatch, cursor),
      end: cursor
    })
    openPanel()
    return
  }

  const agentMatch = beforeCursor.match(AGENT_MENTION_NAMESPACE_REGEX)
  if (agentMatch) {
    applyMentionParseResult('agents', agentMatch[3] || '', {
      start: resolveMentionStartFromBeforeCursor(beforeCursor, agentMatch, cursor),
      end: cursor
    })
    if (availableAgents.value.length > 0) openPanel()
    return
  }

  const namespacedMatch = beforeCursor.match(SKILL_MENTION_NAMESPACE_REGEX)
  if (namespacedMatch) {
    applyMentionParseResult('skills', namespacedMatch[3] || '', {
      start: resolveMentionStartFromBeforeCursor(beforeCursor, namespacedMatch, cursor),
      end: cursor
    })
    if (availableSkills.value.length > 0) openPanel()
    return
  }

  // 2. Check if this is a bare @ mention → unified search
  const match = beforeCursor.match(PARTIAL_MENTION_REGEX)
  if (!match) {
    closePanel()
    return
  }

  applyMentionParseResult('all', match[2] || '', {
    start: resolveMentionStartFromBeforeCursor(beforeCursor, match, cursor),
    end: cursor
  })
  openPanel()
}

// ── Event handlers ──

const selectActiveItem = () => {
  const data = getActiveData()
  if (!data) return

  if (data.type === 'file-nav') {
    currentFileDirectory.value = data.targetDir
    fileListStrategy.value = 'directory'
    const dirPath = data.targetDir || ''
    refreshFileEntries(dirPath + '/')
    return
  }

  if (data.type === 'note-nav') {
    currentNoteFolderId.value = data.targetFolderId
    noteListStrategy.value = 'directory'
    refreshNoteEntries('')
    return
  }

  const payload = buildMentionPayload(data)
  if (!payload) return
  emit('apply', payload)
  closePanel({ suppressCurrentMessage: true })
}

const handleItemClick = (data: MentionItemData) => {
  if (data.type === 'file-nav') {
    currentFileDirectory.value = data.targetDir
    fileListStrategy.value = 'directory'
    const dirPath = data.targetDir || ''
    refreshFileEntries(dirPath + '/')
    return
  }

  if (data.type === 'note-nav') {
    currentNoteFolderId.value = data.targetFolderId
    noteListStrategy.value = 'directory'
    refreshNoteEntries('')
    return
  }

  const payload = buildMentionPayload(data)
  if (!payload) return
  emit('apply', payload)
  closePanel({ suppressCurrentMessage: true })
}

// unused - handled by List component

// unused - handled by List component

const isMentionPanelOpen = () => isOpen.value

const NAVIGATION_KEYS = new Set([
  'Escape',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Enter',
  'Tab',
  'Home',
  'End'
])

const handleKeydown = (
  event: KeyboardEvent,
  message: string,
  cursorSource?: MentionCursorSource
): MentionKeydownResult => {
  // 面板已打开时，纯导航按键无需重新 sync 状态，避免 syncMentionState 重置 activeIndex
  if (isOpen.value && NAVIGATION_KEYS.has(event.key)) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closePanel({ suppressCurrentMessage: true })
      return { handled: true }
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (flatSelectableItems.value.length > 0) {
        activeIndex.value = (clampedActiveIndex.value + 1) % flatSelectableItems.value.length
        scrollActiveIntoView()
      }
      return { handled: true }
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (flatSelectableItems.value.length > 0) {
        activeIndex.value = (clampedActiveIndex.value - 1 + flatSelectableItems.value.length) % flatSelectableItems.value.length
        scrollActiveIntoView()
      }
      return { handled: true }
    }

    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      selectActiveItem()
      return { handled: true }
    }

    // Directory navigation: ArrowRight to enter a directory, ArrowLeft to go up
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      const data = getActiveData()
      if (data?.type === 'file' && data.entry.kind === 'directory') {
        currentFileDirectory.value = data.entry.relativePath
        fileListStrategy.value = 'directory'
        refreshFileEntries(data.entry.relativePath + '/')
        activeIndex.value = 0
      }
      return { handled: true }
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      if (currentFileDirectory.value) {
        const parentDir = getParentDirectory(currentFileDirectory.value)
        currentFileDirectory.value = parentDir
        fileListStrategy.value = 'directory'
        refreshFileEntries(parentDir ? parentDir + '/' : '/')
        activeIndex.value = 0
      }
      return { handled: true }
    }

    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      return { handled: true }
    }
  }

  // keydown fires before the char is in DOM. Simulate @ to let syncMentionState open immediately.
  if (event.key === '@') {
    syncMentionState(message + '@', (resolveMentionCursor(message, cursorSource) || 0) + 1)
  } else {
    syncMentionState(message, cursorSource)
  }

  if (!isOpen.value) return { handled: false }

  return { handled: false }
}

// ── Watchers ──

watch([isOpen, mentionScope, query, currentWorkPath, currentFileDirectory, fileListStrategy], () => {
  debouncedRefreshFileEntries.cancel?.()
  if (!isOpen.value || (mentionScope.value !== 'files' && mentionScope.value !== 'all')) {
    fileEntries.value = []
    return
  }
  if (!currentWorkPath.value) {
    fileEntries.value = []
    return
  }

  const nq = query.value.trim()
  const isDirNav = nq.endsWith('/') && mentionScope.value === 'all'
  const isAllScopeSearch = mentionScope.value === 'all' && Boolean(nq) && !isDirNav
  const isFilesScopeSearch = mentionScope.value === 'files' && fileListStrategy.value === 'search' && Boolean(nq)

  if (isDirNav) {
    refreshFileEntries(nq)
  } else if (isAllScopeSearch || isFilesScopeSearch) {
    debouncedRefreshFileEntries(nq)
  } else {
    refreshFileEntries('')
  }
}, { immediate: true })

watch([isOpen, mentionScope, query, currentNoteFolderId, noteListStrategy], () => {
  debouncedRefreshNoteEntries.cancel?.()
  if (!isOpen.value || (mentionScope.value !== 'notes' && mentionScope.value !== 'all')) {
    noteEntries.value = []
    return
  }

  const nq = query.value.trim()
  if (nq && (mentionScope.value === 'all' || (mentionScope.value === 'notes' && noteListStrategy.value === 'search'))) {
    debouncedRefreshNoteEntries(nq)
  } else {
    refreshNoteEntries('')
  }
}, { immediate: true })

onBeforeUnmount(() => {
  clearCloseTimer()
  debouncedRefreshFileEntries.cancel?.()
  debouncedRefreshNoteEntries.cancel?.()
})

defineExpose({
  syncMentionState,
  scheduleClose,
  clearCloseTimer,
  handleKeydown,
  isMentionPanelOpen
})
</script>

<template>
  <SelectorPopover
    v-model:visible="isOpen"
    desktop-presentation="tray"
    :tray-anchor="'[data-mention-anchor=\'true\']'"
    tray-exclude-selector="[data-mention-anchor='true']"
    width="380px"
    title="快捷选项"
  >
    <template #content>
      <div ref="panelRef" class="mention-sections">
        <div v-if="flatSelectableItems.length > 0" class="mention-section">
          <List
            :items="toListItems(flatSelectableItems)"
            key-field="key"
            main-field="name"
            sub-field="description"
            :active-id="activeItemId"
            :selectable="true"
            :is-selected="() => false"
            @select="handleListSelect"
          >
            <template #actions="{ item }">
              <span
                v-if="item._isDir"
                style="flex-shrink:0;color:var(--text-tertiary);font-size:14px;opacity:0.5"
              >›</span>
            </template>
          </List>
        </div>
        <div v-else class="mention-empty">{{ query.trim() ? '未找到匹配项' : props.emptyText }}</div>
      </div>
    </template>
  </SelectorPopover>
</template>

<style scoped>
.mention-sections {
  display: flex;
  flex-direction: column;
}

.mention-section {
  display: flex;
  flex-direction: column;
}

:deep(.list-item) {
  background-color: transparent;
  border-radius: 6px !important;
  gap: 0 !important;
  padding: 2px 4px !important;
}

:deep(.list-item:hover) {
  background-color: var(--bg-hover) !important;
}

:deep(.main-text) {
  font-size: 12px;
}

:deep(.sub-text) {
  font-size: 10px;
}

:deep(.media-icon) {
  color: var(--text-tertiary);
}
.mention-empty {
  padding: 20px;
}
/* ── Override: content slot tray body padding to match default slot ── */
</style>
