<script setup lang="ts">
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

const props = withDefaults(defineProps<Props>(), {
  mobile: false,
  emptyText: '未找到匹配技能'
})

const emit = defineEmits<{
  apply: [payload: MentionApplyPayload]
}>()

const chatStore = useChatsStores()
const agentStore = useAgentStore()

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
const childOpen = ref(false)
const query = ref('')
const activeIndex = ref(0)
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

const closePanel = () => {
  isOpen.value = false
  childOpen.value = false
  query.value = ''
  activeIndex.value = 0
  mentionRange.value = null
}

const openChild = () => {
  if (!isOpen.value) return
  childOpen.value = true
  if (activeIndex.value >= filteredSkills.value.length) {
    activeIndex.value = 0
  }
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
    childOpen.value = isOpen.value
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
  childOpen.value = isOpen.value
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

const applySkill = (skill: SkillMetadata) => {
  const payload = buildMentionPayload(skill)
  if (!payload) return null
  emit('apply', payload)
  return payload
}

const handleKeydown = (
  event: KeyboardEvent,
  message: string,
  textarea?: HTMLTextAreaElement | null
) => {
  syncMentionState(message, textarea)

  if (isOpen.value && childOpen.value && filteredSkills.value.length > 0) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      activeIndex.value = (activeIndex.value + 1) % filteredSkills.value.length
      return null
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      activeIndex.value =
        (activeIndex.value - 1 + filteredSkills.value.length) % filteredSkills.value.length
      return null
    }

    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      return applySkill(filteredSkills.value[activeIndex.value])
    }
  }

  if (event.key === 'Escape' && isOpen.value) {
    event.preventDefault()
    if (childOpen.value) {
      childOpen.value = false
      return null
    }
    closePanel()
  }

  return null
}

watch(filteredSkills, (skills) => {
  if (!skills.length) {
    activeIndex.value = 0
    return
  }

  if (activeIndex.value >= skills.length) {
    activeIndex.value = 0
  }
})

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
  <div
    v-if="isOpen"
    class="skill-mention-panel"
    :class="{ 'mobile-skill-mention-panel': mobile }"
    @mouseenter="clearCloseTimer"
  >
    <button
      class="skill-section-item"
      :class="{ 'is-active': childOpen }"
      type="button"
      @mousedown.prevent="openChild"
    >
      <span class="skill-section-icon">
        <span class="skill-section-icon-glyph"></span>
      </span>
      <div class="skill-section-copy">
        <span class="skill-section-title">技能</span>
      </div>
      <span class="skill-section-arrow">›</span>
    </button>

    <div
      v-if="childOpen"
      class="skill-mention-child-panel"
      :class="{ 'mobile-skill-mention-child-panel': mobile }"
    >
      <div class="skill-mention-list">
        <button
          v-for="(skill, index) in filteredSkills"
          :key="skill.path"
          class="skill-mention-item"
          :class="{ 'is-active': index === activeIndex }"
          type="button"
          @mousedown.prevent="applySkill(skill)"
        >
          <span class="skill-mention-name">@{{ skill.name }}</span>
          <span class="skill-mention-desc">{{ skill.description }}</span>
        </button>

        <div v-if="filteredSkills.length === 0" class="skill-mention-empty">
          {{ props.emptyText }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.skill-mention-panel {
  position: absolute;
  left: 0;
  bottom: calc(100% + 8px);
  z-index: 30;
  width: 138px;
  padding: 4px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-card);
  box-shadow:
    0 8px 18px rgba(var(--text-rgb), 0.1),
    0 1px 3px rgba(var(--text-rgb), 0.05);
  overflow: visible;
}

.skill-section-item {
  width: 100%;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  min-height: 30px;
  padding: 0 8px;
  border-radius: 6px;
  text-align: left;
  color: var(--text-primary);
  transition: background-color 0.14s ease;
}

.skill-section-item:hover,
.skill-section-item.is-active {
  background: var(--bg-hover);
}

.skill-section-icon {
  width: 12px;
  height: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.skill-section-icon-glyph {
  position: relative;
  display: inline-block;
  width: 10px;
  height: 8px;
  border: 1px solid currentColor;
  border-radius: 2px;
}

.skill-section-icon-glyph::before {
  content: '';
  position: absolute;
  left: 50%;
  top: -1px;
  bottom: -1px;
  width: 1px;
  background: currentColor;
  transform: translateX(-50%);
}

.skill-section-copy {
  min-width: 0;
  display: flex;
  flex: 1;
}

.skill-section-title {
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: 0.01em;
}

.skill-section-arrow {
  font-size: 13px;
  line-height: 1;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.skill-mention-child-panel {
  position: absolute;
  left: calc(100% + 4px);
  top: auto;
  bottom: -1px;
  width: min(248px, 20vw);
  max-height: min(220px, calc(100vh - 240px));
  padding: 4px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-card);
  box-shadow:
    0 8px 18px rgba(var(--text-rgb), 0.1),
    0 1px 3px rgba(var(--text-rgb), 0.05);
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}

.skill-mention-child-panel::before {
  content: '';
  position: absolute;
  left: -5px;
  top: auto;
  bottom: 11px;
  width: 10px;
  height: 10px;
  border-left: 1px solid rgba(var(--text-rgb), 0.08);
  border-bottom: 1px solid rgba(var(--text-rgb), 0.08);
  background: inherit;
  transform: rotate(45deg);
}

.skill-mention-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.skill-mention-item {
  width: 100%;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  padding: 0 8px;
  border-radius: 6px;
  text-align: left;
  color: var(--text-primary);
  transition: background-color 0.14s ease;
}

.skill-mention-item:hover,
.skill-mention-item.is-active {
  background: var(--bg-hover);
}

.skill-mention-name {
  font-size: 11px;
  font-weight: 600;
  line-height: 1.25;
  flex-shrink: 0;
}

.skill-mention-desc {
  font-size: 9px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
}

.skill-mention-empty {
  padding: 10px 6px;
  font-size: 10px;
  color: var(--text-tertiary);
  text-align: center;
  margin: auto 0;
}

.mobile-skill-mention-panel {
  bottom: calc(100% + 6px);
  width: min(138px, calc(100vw - 32px));
}

.mobile-skill-mention-child-panel {
  left: 0;
  right: 0;
  top: calc(100% + 8px);
  width: auto;
}

.mobile-skill-mention-child-panel::before {
  display: none;
}

@media (max-width: 767px) {
  .skill-mention-panel {
    width: min(138px, calc(100vw - 32px));
  }

  .skill-mention-child-panel {
    left: 0;
    right: 0;
    top: calc(100% + 8px);
    width: auto;
    max-height: 160px;
  }
}
</style>
