<script setup lang="ts">
import CascaderPanel from './CascaderPanel.vue'
import type { CascaderPanelItem, CascaderPanelSelectResult } from './CascaderPanel.types'
import { discoverSkills, type SkillMetadata } from '@renderer/services/skillsService'
import { debounce } from '@renderer/utils'
import {
  listWorkspaceEntries,
  normalizeWorkspacePath,
  searchWorkspaceEntries,
  type WorkspaceFileEntry
} from '@renderer/services/fileMentionsService'

interface Props {
  mobile?: boolean
  emptyText?: string
}

interface MentionRange {
  start: number
  end: number
}

type MentionScope = 'all' | 'skills' | 'files'

type MentionItemData =
  | { type: 'skill'; skill: SkillMetadata }
  | { type: 'file'; entry: WorkspaceFileEntry }
  | { type: 'file-nav'; targetDir: string }

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
}>()

const chatStore = useChatsStores()
const agentStore = useAgentStore()
const cascaderPanelRef = useTemplateRef<{
  handleKeydown: (event: KeyboardEvent) => CascaderPanelSelectResult
  resetActiveIndexAtDepth: (depth: number, focus?: boolean) => void
  getActivePath: () => CascaderPanelItem[]
}>('cascaderPanelRef')

const currentChatAgent = computed(() => {
  const agentId = chatStore.currentChat?.agentId
  return agentId ? agentStore.getAgentById(agentId) : null
})

const SKILL_MENTION_REGEX = /(^|[\s([{"'`“‘])@([a-z0-9-]*)$/i
const SKILL_MENTION_NAMESPACE_REGEX = /(^|[\s([{"'`“‘])@(skills|技能):([a-z0-9-]*)$/i
const FILE_MENTION_NAMESPACE_REGEX =
  /(^|[\s([{"'`“‘])@(file|文件):(?:"([^"\n\r]*)"|'([^'\n\r]*)'|([^\s]*))$/i

const availableSkills = computed<SkillMetadata[]>(() => {
  void currentChatAgent.value?.id
  void currentChatAgent.value?.skillDirectory
  void chatStore.currentChat?.id
  return discoverSkills()
})

const isOpen = ref(false)
const mentionScope = ref<MentionScope>('all')
const query = ref('')
const mentionRange = ref<MentionRange | null>(null)
const latestMessage = ref('')
const fileItems = ref<CascaderPanelItem[]>([])
const currentFileDirectory = ref('')
const fileListStrategy = ref<'search' | 'directory'>('directory')
let closeTimer: ReturnType<typeof setTimeout> | null = null

const currentWorkPath = computed(() => {
  const workPath = currentChatAgent.value?.workPath?.trim()
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
    cascaderPanelRef.value?.resetActiveIndexAtDepth?.(1, true)
  })
}

const debouncedRefreshFileItems = debounce((nextQuery: string) => {
  refreshFileItems(nextQuery)
  resetFileListSelection()
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

const cascaderItems = ref<CascaderPanelItem[]>([skillsRootItem, workspaceRootItem])

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

  cascaderItems.value = [skillsRootItem, workspaceRootItem]
}

const panelEmptyText = computed(() => {
  if (mentionScope.value === 'files') {
    if (!currentWorkPath.value) {
      return '当前智能体未设置工作路径'
    }

    return query.value.trim() && fileListStrategy.value === 'search' ? '未找到匹配文件' : '当前目录为空'
  }

  if (mentionScope.value === 'all') {
    return '暂无可用选项'
  }

  return props.emptyText
})

const closePanel = () => {
  isOpen.value = false
  mentionScope.value = 'all'
  query.value = ''
  mentionRange.value = null
  currentFileDirectory.value = ''
  fileListStrategy.value = 'directory'
}

const clearCloseTimer = () => {
  if (!closeTimer) return
  clearTimeout(closeTimer)
  closeTimer = null
}

const scheduleClose = () => {
  clearCloseTimer()
  closeTimer = setTimeout(() => {
    closePanel()
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
  }

  fileListStrategy.value = nextQuery.trim() ? 'search' : 'directory'
}

const syncMentionState = (message: string, textarea?: HTMLTextAreaElement | null) => {
  latestMessage.value = message
  clearCloseTimer()

  if (!textarea) {
    closePanel()
    return
  }

  const cursor = textarea.selectionStart ?? message.length
  const beforeCursor = message.slice(0, cursor)
  const fileMatch = beforeCursor.match(FILE_MENTION_NAMESPACE_REGEX)

  if (fileMatch) {
    applyMentionParseResult('files', getFileMentionQuery(fileMatch), {
      start: resolveMentionStart(fileMatch, cursor),
      end: cursor
    })
    isOpen.value = true
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

  const match = beforeCursor.match(SKILL_MENTION_REGEX)
  if (!match) {
    closePanel()
    return
  }

  applyMentionParseResult('all', match[2] || '', {
    start: resolveMentionStart(match, cursor),
    end: cursor
  })
  isOpen.value = availableSkills.value.length > 0 || Boolean(currentWorkPath.value)
}

const buildSkillMentionPayload = (skill: SkillMetadata): MentionApplyPayload | null => {
  const range = mentionRange.value
  if (!range) return null

  const mentionText = `@skills:${skill.name} `
  const nextMessage = `${latestMessage.value.slice(0, range.start)}${mentionText}${latestMessage.value.slice(range.end)}`
  const cursor = range.start + mentionText.length

  closePanel()

  return {
    message: nextMessage,
    cursor
  }
}

const buildFileMentionPayload = (entry: WorkspaceFileEntry): MentionApplyPayload | null => {
  const range = mentionRange.value
  if (!range) return null

  const mentionText = `@file:${formatFileMentionPath(entry.relativePath)} `
  const nextMessage = `${latestMessage.value.slice(0, range.start)}${mentionText}${latestMessage.value.slice(range.end)}`
  const cursor = range.start + mentionText.length

  closePanel()

  return {
    message: nextMessage,
    cursor
  }
}

const getMentionItemData = (item?: CascaderPanelItem | null) => {
  const data = item?.data
  return data ? (data as MentionItemData) : null
}

const buildMentionPayload = (data: MentionItemData): MentionApplyPayload | null => {
  if (data.type === 'skill') {
    return buildSkillMentionPayload(data.skill)
  }

  if (data.type === 'file') {
    return buildFileMentionPayload(data.entry)
  }

  return null
}

const applyMentionItem = (data: MentionItemData) => {
  if (data.type === 'file-nav') {
    enterDirectory(data.targetDir)
    return null
  }

  const payload = buildMentionPayload(data)
  if (!payload) return null
  emit('apply', payload)
  return payload
}

const handleCascaderSelect = ({ item }: { item: CascaderPanelItem }) => {
  const data = getMentionItemData(item)
  if (!data) return
  applyMentionItem(data)
}

const handleKeydown = (
  event: KeyboardEvent,
  message: string,
  textarea?: HTMLTextAreaElement | null
): MentionKeydownResult => {
  syncMentionState(message, textarea)

  if (!isOpen.value) return { handled: false }

  const result = cascaderPanelRef.value?.handleKeydown(event)
  if (!result?.handled) return { handled: false }

  if (result.requestClose) {
    closePanel()
    return { handled: true }
  }

  const data = getMentionItemData(result.item)
  if (!data) return { handled: true }

  if (data.type === 'file-nav') {
    applyMentionItem(data)
    return { handled: true }
  }

  return {
    handled: true,
    payload: buildMentionPayload(data)
  }
}

watch(availableSkills, (skills) => {
  if (mentionScope.value === 'files') return
  if (skills.length > 0 || currentWorkPath.value) return
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
    if (fileListStrategy.value !== 'search' || !normalizedQuery) {
      refreshFileItems('')
      resetFileListSelection()
      return
    }

    debouncedRefreshFileItems(normalizedQuery)
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  clearCloseTimer()
  debouncedRefreshFileItems.cancel?.()
})

defineExpose({
  syncMentionState,
  scheduleClose,
  clearCloseTimer,
  handleKeydown
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
    @select="handleCascaderSelect"
  />
</template>
