<script setup lang="ts">
import CascaderPanel from './CascaderPanel.vue'
import type { CascaderPanelItem, CascaderPanelSelectResult } from './CascaderPanel.types'
import { discoverSkills, type SkillMetadata } from '@renderer/services/skillsService'
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
  emptyText: '未找到匹配技能'
})

const emit = defineEmits<{
  apply: [payload: MentionApplyPayload]
  preview: [payload: MentionApplyPayload]
}>()

const chatStore = useChatsStores()
const agentStore = useAgentStore()
const canvasStore = useCanvasStore()
const cascaderPanelRef = useTemplateRef<{
  handleKeydown: (event: KeyboardEvent) => CascaderPanelSelectResult
  resetActiveIndexAtDepth: (depth: number, focus?: boolean, index?: number) => void
  getActivePath: () => CascaderPanelItem[]
}>('cascaderPanelRef')

const currentChatAgent = computed(() => {
  const agentId = chatStore.currentChat?.agentId
  return agentId ? agentStore.getAgentById(agentId) : null
})

const SKILL_MENTION_REGEX = /(^|[\s([{"'`"'])@([a-z0-9-]*)$/i
const SKILL_MENTION_NAMESPACE_REGEX = /(^|[\s([{"'`"'])@(skills|技能):([a-z0-9-]*)$/i
const FILE_MENTION_NAMESPACE_REGEX =
  /(^|[\s([{"'`"'])@(file|文件):(?:"([^"\n\r]*)"|'([^'\n\r]*)'|([^\s]*))$/i
const NOTE_MENTION_NAMESPACE_REGEX =
  /(^|[\s([{"'`"'])@(note|笔记):(?:"([^"\n\r]*)"|'([^'\n\r]*)'|([^\s]*))$/i
const AGENT_MENTION_NAMESPACE_REGEX = /(^|[\s([{"'`"'])@(agent|智能体):([a-z0-9-\u4e00-\u9fa5]*)$/i
const PARTIAL_MENTION_REGEX = /(^|[\s([{"'`"'])@([^\s]*)$/i

const availableSkills = computed<SkillMetadata[]>(() => {
  void currentChatAgent.value?.id
  void currentChatAgent.value?.skillDirectory
  void chatStore.currentChat?.id
  return discoverSkills()
})

const availableAgents = computed<Agent[]>(() => {
  return agentStore.allAgents
})

const filteredAgents = computed(() => {
  const normalizedQuery = query.value.trim().toLowerCase()
  if (!normalizedQuery) return availableAgents.value
  return availableAgents.value.filter((agent) => {
    const name = agent.name.toLowerCase()
    const description = (agent.description || '').toLowerCase()
    return name.includes(normalizedQuery) || description.includes(normalizedQuery)
  })
})

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
const lastActivePathKeys = ref<string[]>([])
const fileItems = ref<CascaderPanelItem[]>([])
const currentFileDirectory = ref('')
const fileListStrategy = ref<'search' | 'directory'>('directory')
const noteItems = ref<CascaderPanelItem[]>([])
const currentNoteFolderId = ref<string | null>(null)
const noteListStrategy = ref<'search' | 'directory'>('directory')
let closeTimer: ReturnType<typeof setTimeout> | null = null

const currentWorkPath = computed(() => {
  const workPath = canvasStore.getWorkPath(chatStore.currentChat?.id)
  return workPath ? normalizeWorkspacePath(workPath) : ''
})

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

const resolveMentionStart = (match: RegExpMatchArray, cursor: number) => {
  const leadingToken = match[1] || ''
  return cursor - (match[0]?.length || 0) + leadingToken.length
}

const getFileMentionQuery = (match: RegExpMatchArray) => {
  return match[3] || match[4] || match[5] || ''
}

const getNoteMentionQuery = (match: RegExpMatchArray) => {
  return match[3] || match[4] || match[5] || ''
}

const formatFileMentionPath = (relativePath: string) => {
  if (!/\s/.test(relativePath)) {
    return relativePath
  }

  return `"${relativePath.replaceAll('"', '\\"')}"`
}

const getParentDirectory = (relativePath: string) => {
  if (!relativePath) return ''
  return relativePath.split('/').slice(0, -1).join('/')
}

const enterDirectory = (relativePath: string) => {
  currentFileDirectory.value = relativePath
  fileListStrategy.value = 'directory'
}

const buildFileDescription = (entry: WorkspaceFileEntry) => {
  const normalizedQuery = query.value.trim()
  const parentPath = entry.relativePath.includes('/')
    ? entry.relativePath.slice(0, entry.relativePath.lastIndexOf('/'))
    : ''

  if (!normalizedQuery || fileListStrategy.value === 'directory') {
    return entry.kind === 'directory' ? '文件夹' : '文件'
  }

  if (entry.kind === 'directory') {
    return `文件夹 · ${entry.relativePath}`
  }

  return parentPath || entry.relativePath
}

const buildParentDirectoryItem = (): CascaderPanelItem | null => {
  if (!currentFileDirectory.value) return null

  const parentDir = getParentDirectory(currentFileDirectory.value)
  return {
    key: 'file-nav:parent',
    label: '..',
    description: '返回上级目录',
    onKeydown: ({ event }) => {
      if (event.key === 'Enter' || event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        enterDirectory(parentDir)
        return { action: 'stay' }
      }

      return undefined
    },
    data: {
      type: 'file-nav',
      targetDir: parentDir
    } satisfies MentionItemData
  }
}

const buildFileItem = (entry: WorkspaceFileEntry): CascaderPanelItem => {
  return {
    key: `file:${entry.relativePath}`,
    label: entry.name,
    description: buildFileDescription(entry),
    onKeydown: ({ event }) => {
      if (event.key === 'ArrowLeft' && currentFileDirectory.value) {
        enterDirectory(getParentDirectory(currentFileDirectory.value))
        return { action: 'stay' }
      }

      if (entry.kind === 'directory' && event.key === 'ArrowRight') {
        enterDirectory(entry.relativePath)
        return { action: 'stay' }
      }

      if (entry.kind === 'directory' && event.key === 'Enter') {
        return { action: 'select' }
      }

      return undefined
    },
    data: {
      type: 'file',
      entry
    } satisfies MentionItemData
  }
}

const refreshFileItems = (nextQuery: string) => {
  if (!currentWorkPath.value) {
    fileItems.value = []
    return
  }

  const shouldSearch = fileListStrategy.value === 'search' && Boolean(nextQuery)
  const entries = shouldSearch
    ? searchWorkspaceEntries(currentWorkPath.value, nextQuery, { limit: 80 })
    : listWorkspaceEntries(currentWorkPath.value, currentFileDirectory.value)

  const parentItem = shouldSearch ? null : buildParentDirectoryItem()
  fileItems.value = [
    ...(parentItem ? [parentItem] : []),
    ...entries.map(buildFileItem)
  ]
}

const resetFileListSelection = () => {
  nextTick(() => {
    const activePath = cascaderPanelRef.value?.getActivePath?.() || []
    const isWorkspaceActive =
      mentionScope.value === 'files' || activePath[0]?.key === 'workspace'

    if (!isWorkspaceActive) return
    const firstSelectableIndex = fileItems.value[0]?.key === 'file-nav:parent' ? 1 : 0
    cascaderPanelRef.value?.resetActiveIndexAtDepth?.(1, true, firstSelectableIndex)
  })
}

const debouncedRefreshFileItems = debounce((nextQuery: string) => {
  refreshFileItems(nextQuery)
  resetFileListSelection()
}, 140)

const enterNoteFolder = (folderId: string | null) => {
  currentNoteFolderId.value = folderId
  noteListStrategy.value = 'directory'
}

const buildNoteParentItem = (): CascaderPanelItem | null => {
  if (!currentNoteFolderId.value) return null

  const notesStore = useNotesStore()
  const currentFolder = notesStore.folders.find((folder) => folder.id === currentNoteFolderId.value)
  const parentId = currentFolder?.parentId || null

  return {
    key: 'note-nav:parent',
    label: '..',
    description: '返回上级文件夹',
    onKeydown: ({ event }) => {
      if (event.key === 'Enter' || event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        enterNoteFolder(parentId)
        return { action: 'stay' }
      }

      return undefined
    },
    data: {
      type: 'note-nav',
      targetFolderId: parentId
    } satisfies MentionItemData
  }
}

const buildNoteDescription = (entry: NoteMentionEntry) => {
  const normalizedQuery = query.value.trim()
  if (!normalizedQuery || noteListStrategy.value === 'directory') {
    return entry.kind === 'folder' ? '笔记文件夹' : '笔记'
  }

  return entry.path
}

const buildNoteItem = (entry: NoteMentionEntry): CascaderPanelItem => {
  return {
    key: `note:${entry.kind}:${entry.id}`,
    label: entry.name,
    description: buildNoteDescription(entry),
    onKeydown: ({ event }) => {
      if (event.key === 'ArrowLeft' && currentNoteFolderId.value) {
        const notesStore = useNotesStore()
        const currentFolder = notesStore.folders.find((folder) => folder.id === currentNoteFolderId.value)
        enterNoteFolder(currentFolder?.parentId || null)
        return { action: 'stay' }
      }

      if (entry.kind === 'folder' && event.key === 'ArrowRight') {
        enterNoteFolder(entry.id)
        return { action: 'stay' }
      }

      if (entry.kind === 'folder' && event.key === 'Enter') {
        return { action: 'select' }
      }

      return undefined
    },
    data: {
      type: 'note',
      entry
    } satisfies MentionItemData
  }
}

const refreshNoteItems = (nextQuery: string) => {
  const shouldSearch = noteListStrategy.value === 'search' && Boolean(nextQuery)
  const entries = shouldSearch
    ? searchNoteEntries(nextQuery, { limit: 80 })
    : listNoteEntries(currentNoteFolderId.value)

  const parentItem = shouldSearch ? null : buildNoteParentItem()
  noteItems.value = [
    ...(parentItem ? [parentItem] : []),
    ...entries.map(buildNoteItem)
  ]
}

const resetNoteListSelection = () => {
  nextTick(() => {
    const activePath = cascaderPanelRef.value?.getActivePath?.() || []
    const isNotesActive = mentionScope.value === 'notes' || activePath[0]?.key === 'notes'

    if (!isNotesActive) return
    const firstSelectableIndex = noteItems.value[0]?.key === 'note-nav:parent' ? 1 : 0
    cascaderPanelRef.value?.resetActiveIndexAtDepth?.(1, true, firstSelectableIndex)
  })
}

const debouncedRefreshNoteItems = debounce((nextQuery: string) => {
  refreshNoteItems(nextQuery)
  resetNoteListSelection()
}, 140)

const skillsRootItem = reactive<CascaderPanelItem>({
  key: 'skills',
  label: '技能',
  icon: 'split',
  children: () => filteredSkills.value.map((skill) => ({
    key: skill.path,
    label: `@${skill.name}`,
    description: skill.description,
    data: {
      type: 'skill',
      skill
    } satisfies MentionItemData
  }))
})

const workspaceRootItem = reactive<CascaderPanelItem>({
  key: 'workspace',
  label: '工作',
  icon: 'split',
  description: currentWorkPath.value || '未设置工作路径',
  children: () => fileItems.value
})

const notesRootItem = reactive<CascaderPanelItem>({
  key: 'notes',
  label: '笔记',
  icon: 'split',
  description: '引用笔记内容',
  children: () => noteItems.value
})

const agentsRootItem = reactive<CascaderPanelItem>({
  key: 'agents',
  label: '智能体',
  icon: 'split',
  children: () => filteredAgents.value.map((agent) => ({
    key: agent.id,
    label: `@${agent.name}`,
    description: agent.description || '暂无描述',
    data: {
      type: 'agent',
      agent
    } satisfies MentionItemData
  }))
})

const cascaderItems = ref<CascaderPanelItem[]>([skillsRootItem, workspaceRootItem, notesRootItem, agentsRootItem])

const syncCascaderItems = () => {
  workspaceRootItem.description = currentWorkPath.value || '未设置工作路径'

  if (mentionScope.value === 'files') {
    cascaderItems.value = [workspaceRootItem]
    return
  }

  if (mentionScope.value === 'skills') {
    cascaderItems.value = [skillsRootItem]
    return
  }

  if (mentionScope.value === 'agents') {
    cascaderItems.value = [agentsRootItem]
    return
  }

  if (mentionScope.value === 'notes') {
    cascaderItems.value = [notesRootItem]
    return
  }

  cascaderItems.value = [skillsRootItem, workspaceRootItem, notesRootItem, agentsRootItem]
}

const panelEmptyText = computed(() => {
  if (mentionScope.value === 'files') {
    if (!currentWorkPath.value) {
      return '当前智能体未设置工作路径'
    }

    return query.value.trim() && fileListStrategy.value === 'search' ? '未找到匹配文件' : '当前目录为空'
  }

  if (mentionScope.value === 'agents') {
    return query.value.trim() ? '未找到匹配智能体' : '暂无可用智能体'
  }

  if (mentionScope.value === 'notes') {
    return query.value.trim() && noteListStrategy.value === 'search' ? '未找到匹配笔记' : '当前文件夹为空'
  }

  if (mentionScope.value === 'all') {
    return '暂无可用选项'
  }

  return props.emptyText
})

const closePanel = (options?: { suppressCurrentMessage?: boolean }) => {
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
  lastActivePathKeys.value = []
  currentFileDirectory.value = ''
  fileListStrategy.value = 'directory'
  currentNoteFolderId.value = null
  noteListStrategy.value = 'directory'
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

const isStickyNamespacePrefix = (scope: Exclude<MentionScope, 'all'>, token: string) => {
  const normalizedToken = token.toLowerCase()
  if (scope === 'files') {
    return 'file'.startsWith(normalizedToken) || '文件'.startsWith(token)
  }

  if (scope === 'agents') {
    return 'agent'.startsWith(normalizedToken) || '智能体'.startsWith(token) || '助手'.startsWith(token)
  }

  if (scope === 'notes') {
    return 'note'.startsWith(normalizedToken) || '笔记'.startsWith(token)
  }

  return 'skills'.startsWith(normalizedToken) || '技能'.startsWith(token)
}

const getStickyMentionParseResult = (beforeCursor: string, cursor: number) => {
  const preferredScope =
    previewScope.value ?? (mentionScope.value === 'all' ? null : mentionScope.value)

  if (!preferredScope) return null

  const match = beforeCursor.match(PARTIAL_MENTION_REGEX)
  if (!match) return null

  const token = match[2] || ''
  if (!token || token.includes(':') || !isStickyNamespacePrefix(preferredScope, token)) {
    return null
  }

  return {
    scope: preferredScope,
    query: '',
    range: {
      start: resolveMentionStart(match, cursor),
      end: cursor
    }
  }
}

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
    if (message === suppressedMessage.value) {
      return
    }

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

  if (
    message === previewMessage.value &&
    mentionScope.value === 'all' &&
    rootPreviewScope.value &&
    cursor === message.length
  ) {
    query.value = ''
    isOpen.value = true
    return
  }

  const fileMatch = beforeCursor.match(FILE_MENTION_NAMESPACE_REGEX)

  if (fileMatch) {
    applyMentionParseResult('files', getFileMentionQuery(fileMatch), {
      start: resolveMentionStart(fileMatch, cursor),
      end: cursor
    })
    isOpen.value = true
    return
  }

  const noteMatch = beforeCursor.match(NOTE_MENTION_NAMESPACE_REGEX)

  if (noteMatch) {
    applyMentionParseResult('notes', getNoteMentionQuery(noteMatch), {
      start: resolveMentionStart(noteMatch, cursor),
      end: cursor
    })
    isOpen.value = true
    return
  }

  const agentMatch = beforeCursor.match(AGENT_MENTION_NAMESPACE_REGEX)

  if (agentMatch) {
    applyMentionParseResult('agents', agentMatch[3] || '', {
      start: resolveMentionStart(agentMatch, cursor),
      end: cursor
    })
    isOpen.value = availableAgents.value.length > 0
    return
  }

  const namespacedMatch = beforeCursor.match(SKILL_MENTION_NAMESPACE_REGEX)

  if (namespacedMatch) {
    applyMentionParseResult('skills', namespacedMatch[3] || '', {
      start: resolveMentionStart(namespacedMatch, cursor),
      end: cursor
    })
    isOpen.value = availableSkills.value.length > 0
    return
  }

  const stickyMatch = getStickyMentionParseResult(beforeCursor, cursor)
  if (stickyMatch) {
    applyMentionParseResult(stickyMatch.scope, stickyMatch.query, stickyMatch.range)
    isOpen.value = stickyMatch.scope === 'files'
      ? Boolean(currentWorkPath.value)
      : stickyMatch.scope === 'notes'
        ? true
      : availableSkills.value.length > 0
    return
  }

  const match = beforeCursor.match(SKILL_MENTION_REGEX)
  if (!match) {
    closePanel()
    return
  }

  applyMentionParseResult('all', match[2] || '', {
    start: resolveMentionStart(match, cursor),
    end: cursor
  })
  isOpen.value = true
}

const buildSkillMentionPayload = (skill: SkillMetadata): MentionApplyPayload | null => {
  const range = mentionRange.value
  if (!range) return null

  const mentionText = `@skills:${skill.name} `
  const nextMessage = `${sourceMessage.value.slice(0, range.start)}${mentionText}${sourceMessage.value.slice(range.end)}`
  const cursor = range.start + mentionText.length

  previewMessage.value = nextMessage
  previewScope.value = 'skills'
  rootPreviewScope.value = null

  return {
    message: nextMessage,
    cursor
  }
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

  return {
    message: nextMessage,
    cursor
  }
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

  return {
    message: nextMessage,
    cursor
  }
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

  return {
    message: nextMessage,
    cursor
  }
}

const buildScopePreviewPayload = (item: CascaderPanelItem, path: CascaderPanelItem[]): MentionApplyPayload | null => {
  const range = mentionRange.value
  if (!range) return null

  let mentionText = ''

  if (item.key === 'skills' && path.length === 1) {
    mentionText = '@skills:'
  } else if (item.key === 'workspace' && path.length === 1) {
    mentionText = '@file:'
  } else if (item.key === 'notes' && path.length === 1) {
    mentionText = '@note:'
  } else if (item.key === 'agents' && path.length === 1) {
    mentionText = '@agent:'
  } else {
    return null
  }

  const nextMessage = `${sourceMessage.value.slice(0, range.start)}${mentionText}${sourceMessage.value.slice(range.end)}`
  const cursor = range.start + mentionText.length
  previewMessage.value = nextMessage
  if (item.key === 'workspace') {
    previewScope.value = 'files'
  } else if (item.key === 'notes') {
    previewScope.value = 'notes'
  } else if (item.key === 'agents') {
    previewScope.value = 'agents'
  } else {
    previewScope.value = 'skills'
  }
  rootPreviewScope.value = mentionScope.value === 'all' && path.length === 1
    ? previewScope.value
    : null

  return {
    message: nextMessage,
    cursor
  }
}

const getMentionItemData = (item?: CascaderPanelItem | null) => {
  const data = item?.data
  return data ? (data as MentionItemData) : null
}

const isHorizontalArrowKey = (event: KeyboardEvent) => {
  return event.key === 'ArrowLeft' || event.key === 'ArrowRight'
}

const isMentionPanelOpen = () => isOpen.value

const buildMentionPayload = (data: MentionItemData): MentionApplyPayload | null => {
  if (data.type === 'skill') {
    return buildSkillMentionPayload(data.skill)
  }

  if (data.type === 'file') {
    return buildFileMentionPayload(data.entry)
  }

  if (data.type === 'note') {
    return buildNoteMentionPayload(data.entry)
  }

  if (data.type === 'agent') {
    return buildAgentMentionPayload(data.agent)
  }

  return null
}

const applyMentionItem = (data: MentionItemData) => {
  if (data.type === 'file-nav') {
    enterDirectory(data.targetDir)
    return null
  }

  if (data.type === 'note-nav') {
    enterNoteFolder(data.targetFolderId)
    return null
  }

  const payload = buildMentionPayload(data)
  if (!payload) return null
  emit('apply', payload)
  closePanel({ suppressCurrentMessage: true })
  return payload
}

const handleCascaderSelect = ({ item }: { item: CascaderPanelItem }) => {
  const data = getMentionItemData(item)
  if (!data) return
  applyMentionItem(data)
}

const handleCascaderActiveChange = ({ item, path }: { item: CascaderPanelItem | null, path: CascaderPanelItem[] }) => {
  const previousPathKeys = lastActivePathKeys.value
  const nextPathKeys = path.map((pathItem) => pathItem.key)
  lastActivePathKeys.value = nextPathKeys

  const enteredWorkspaceFromRoot =
    mentionScope.value === 'all' &&
    previousPathKeys.length === 1 &&
    previousPathKeys[0] === 'workspace' &&
    nextPathKeys.length === 2 &&
    nextPathKeys[0] === 'workspace'

  if (enteredWorkspaceFromRoot && currentFileDirectory.value) {
    currentFileDirectory.value = ''
    fileListStrategy.value = 'directory'
    resetFileListSelection()
  }

  if (!item || !mentionRange.value || !allowPreviewOnActiveChange.value) return

  if (
    mentionScope.value === 'all' &&
    !query.value.trim() &&
    item.key === 'skills' &&
    !previewMessage.value
  ) {
    return
  }

  const data = getMentionItemData(item)
  if (data?.type === 'file' || data?.type === 'file-nav' || data?.type === 'note' || data?.type === 'note-nav' || data?.type === 'agent') {
    return
  }

  const payload = data
    ? buildMentionPayload(data)
    : buildScopePreviewPayload(item, path)

  if (!payload) return
  emit('preview', payload)
}

const handleKeydown = (
  event: KeyboardEvent,
  message: string,
  cursorSource?: MentionCursorSource
): MentionKeydownResult => {
  syncMentionState(message, cursorSource)

  if (!isOpen.value) return { handled: false }

  if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault()
    return { handled: true }
  }

  allowPreviewOnActiveChange.value = [
    'ArrowDown',
    'ArrowUp',
    'ArrowLeft',
    'ArrowRight',
    'Tab'
  ].includes(event.key)

  const result = cascaderPanelRef.value?.handleKeydown(event)
  if (!result?.handled) {
    if (isHorizontalArrowKey(event)) {
      event.preventDefault()
      return { handled: true }
    }

    return { handled: false }
  }

  if (result.requestClose) {
    closePanel({ suppressCurrentMessage: true })
    return { handled: true }
  }

  const data = getMentionItemData(result.item)
  if (!data) return { handled: true }

  if (data.type === 'file-nav' || data.type === 'note-nav') {
    applyMentionItem(data)
    return { handled: true }
  }

  const payload = buildMentionPayload(data)
  if (payload) {
    closePanel({ suppressCurrentMessage: true })
  }

  return {
    handled: true,
    payload
  }
}

watch(availableSkills, (skills) => {
  if (mentionScope.value !== 'skills') return
  if (skills.length > 0) return
  closePanel()
})

watch(
  [mentionScope, currentWorkPath],
  () => {
    syncCascaderItems()
  },
  { immediate: true }
)

watch(
  [isOpen, mentionScope, query, currentWorkPath, currentFileDirectory, fileListStrategy],
  ([open, scope, nextQuery, workPath]) => {
    debouncedRefreshFileItems.cancel?.()

    if (!open || (scope !== 'files' && scope !== 'all')) {
      fileItems.value = []
      return
    }

    if (!workPath) {
      fileItems.value = []
      return
    }

    const normalizedQuery = nextQuery.trim()
    if (scope !== 'files' || fileListStrategy.value !== 'search' || !normalizedQuery) {
      refreshFileItems('')
      resetFileListSelection()
      return
    }

    debouncedRefreshFileItems(normalizedQuery)
  },
  { immediate: true }
)

watch(
  [isOpen, mentionScope, query, currentNoteFolderId, noteListStrategy],
  ([open, scope, nextQuery]) => {
    debouncedRefreshNoteItems.cancel?.()

    if (!open || (scope !== 'notes' && scope !== 'all')) {
      noteItems.value = []
      return
    }

    const normalizedQuery = nextQuery.trim()
    if (scope !== 'notes' || noteListStrategy.value !== 'search' || !normalizedQuery) {
      refreshNoteItems('')
      resetNoteListSelection()
      return
    }

    debouncedRefreshNoteItems(normalizedQuery)
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  clearCloseTimer()
  debouncedRefreshFileItems.cancel?.()
  debouncedRefreshNoteItems.cancel?.()
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
  <CascaderPanel
    ref="cascaderPanelRef"
    :visible="isOpen"
    :mobile="mobile"
    :empty-text="panelEmptyText"
    :items="cascaderItems"
    :auto-expand-first="mentionScope !== 'all'"
    @mouseenter="clearCloseTimer"
    @active-change="handleCascaderActiveChange"
    @select="handleCascaderSelect"
  />
</template>
