<script setup lang="ts">
import CascaderPanel from './CascaderPanel.vue'
import type { CascaderPanelItem, CascaderPanelSelectResult } from './CascaderPanel.types'
import { discoverSkills, type SkillMetadata } from '@renderer/services/skillsService'

interface Props {
  mobile?: boolean
  emptyText?: string
}

interface MentionRange {
  start: number
  end: number
}

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
}>('cascaderPanelRef')

const currentChatAgent = computed(() => {
  const agentId = chatStore.currentChat?.agentId
  return agentId ? agentStore.getAgentById(agentId) : null
})

const SKILL_MENTION_REGEX = /(^|[\s([{"'`“‘])@([a-z0-9-]*)$/i
const SKILL_MENTION_NAMESPACE_REGEX = /(^|[\s([{"'`“‘])@(skills|技能):([a-z0-9-]*)$/i

const availableSkills = computed<SkillMetadata[]>(() => {
  void currentChatAgent.value?.id
  void currentChatAgent.value?.skillDirectory
  void chatStore.currentChat?.id
  return discoverSkills()
})

const isOpen = ref(false)
const query = ref('')
const mentionRange = ref<MentionRange | null>(null)
const latestMessage = ref('')
let closeTimer: ReturnType<typeof setTimeout> | null = null

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

const cascaderItems = computed<CascaderPanelItem[]>(() => [
  {
    key: 'skills',
    label: '技能',
    icon: 'split',
    children: () => filteredSkills.value.map((skill) => ({
      key: skill.path,
      label: `@${skill.name}`,
      description: skill.description,
      data: skill
    }))
  }
])

const closePanel = () => {
  isOpen.value = false
  query.value = ''
  mentionRange.value = null
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

const syncMentionState = (message: string, textarea?: HTMLTextAreaElement | null) => {
  latestMessage.value = message
  clearCloseTimer()

  if (!textarea) {
    closePanel()
    return
  }

  const cursor = textarea.selectionStart ?? message.length
  const beforeCursor = message.slice(0, cursor)
  const namespacedMatch = beforeCursor.match(SKILL_MENTION_NAMESPACE_REGEX)

  if (namespacedMatch) {
    const nextQuery = namespacedMatch[3] || ''
    const start = cursor - nextQuery.length - namespacedMatch[2].length - 2
    query.value = nextQuery
    mentionRange.value = { start, end: cursor }
    isOpen.value = availableSkills.value.length > 0
    return
  }

  const match = beforeCursor.match(SKILL_MENTION_REGEX)
  if (!match) {
    closePanel()
    return
  }

  const nextQuery = match[2] || ''
  const start = cursor - nextQuery.length - 1
  query.value = nextQuery
  mentionRange.value = { start, end: cursor }
  isOpen.value = availableSkills.value.length > 0
}

const buildMentionPayload = (skill: SkillMetadata): MentionApplyPayload | null => {
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

const getSkillFromItem = (item?: CascaderPanelItem | null) => {
  const skill = item?.data
  return skill ? (skill as SkillMetadata) : null
}

const applySkill = (skill: SkillMetadata) => {
  const payload = buildMentionPayload(skill)
  if (!payload) return null
  emit('apply', payload)
  return payload
}

const handleCascaderSelect = ({ item }: { item: CascaderPanelItem }) => {
  const skill = getSkillFromItem(item)
  if (!skill) return
  applySkill(skill)
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

  const skill = getSkillFromItem(result.item)
  if (!skill) return { handled: true }

  return {
    handled: true,
    payload: buildMentionPayload(skill)
  }
}

watch(availableSkills, (skills) => {
  if (skills.length > 0) return
  closePanel()
})

onBeforeUnmount(() => {
  clearCloseTimer()
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
    :empty-text="props.emptyText"
    :items="cascaderItems"
    auto-expand-first
    @mouseenter="clearCloseTimer"
    @select="handleCascaderSelect"
  />
</template>
