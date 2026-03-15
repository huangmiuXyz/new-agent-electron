<script setup lang="ts">
const agentStore = useAgentStore()
const chatsStore = useChatsStores()
const { allAgents, tempAgents } = storeToRefs(agentStore)
const settingsStore = useSettingsStore()
const { favoriteAgentIds } = storeToRefs(settingsStore)
withDefaults(
  defineProps<{
    type: 'icon' | 'select'
  }>(),
  {
    type: 'select'
  }
)
const isPopupOpen = ref(false)
const searchQuery = ref('')
const { Robot, ChevronDown, Wrench20Regular, Check, Edit, Plus } = useIcon([
  'Wrench20Regular',
  'Robot',
  'ChevronDown',
  'Server',
  'Check',
  'Edit',
  'Plus'
])

const selectedAgent = computed(() => {
  const currentAgentId = chatsStore.currentChat?.agentId
  if (!currentAgentId) return null
  return agentStore.getAgentById(currentAgentId) || null
})

const selectedAgentLabel = computed(() => {
  const agent = selectedAgent.value
  if (!agent) return '选择智能体'
  return agent.name + (tempAgents.value.some((a) => a.id === agent.id) ? ' (临时)' : '')
})

const filteredAgents = computed(() => {
  const query = searchQuery.value.toLowerCase()
  if (!query) return allAgents.value

  return allAgents.value.filter(
    (agent) =>
      agent.name.toLowerCase().includes(query) || agent.description?.toLowerCase().includes(query)
  )
})

const favoriteAgentSet = computed(() => new Set(favoriteAgentIds.value))
const getAgentToolCount = (agent: Agent) => {
  return settingsStore.getValidTools(agent.tools).length + (agent.builtinTools?.length || 0)
}
const hasAgentTools = (agent: Agent) => getAgentToolCount(agent) > 0

const favoriteAgents = computed(() =>
  filteredAgents.value.filter((agent) => favoriteAgentSet.value.has(agent.id))
)

const regularAgents = computed(() =>
  filteredAgents.value.filter((agent) => !favoriteAgentSet.value.has(agent.id))
)

watch(isPopupOpen, (val) => {
  if (!val) {
    searchQuery.value = ''
  }
})

const selectAgent = (agentId: string) => {
  let currentChatId = chatsStore.currentChat?.id
  if (!currentChatId) {
    chatsStore.createChat('新的聊天', { agentId })
    isPopupOpen.value = false
    return
  }
  chatsStore.setChatAgent(currentChatId, agentId)
  isPopupOpen.value = false
}

const isAgentSelected = (agentId: string) => {
  return agentId === chatsStore.currentChat?.agentId
}
const { openAgentModal } = useAgent()

const openCreateAgentModal = () => {
  openAgentModal()
}

const toggleFavoriteAgent = (agentId: string, event: MouseEvent) => {
  event.stopPropagation()
  settingsStore.toggleFavoriteAgent(agentId)
}
</script>

<template>
  <SelectorPopover
    v-model:visible="isPopupOpen"
    :data="allAgents"
    v-model:searchQuery="searchQuery"
    desktop-presentation="dialog"
    placeholder="搜索智能体..."
    noResultsText="未找到智能体"
    :hasResults="filteredAgents.length > 0"
    width="620px"
    title="选择智能体"
  >
    <template #search-action>
      <Button variant="icon" size="sm" title="添加智能体" @click.stop="openCreateAgentModal">
        <template #icon>
          <Plus />
        </template>
      </Button>
    </template>

    <template #trigger>
      <div class="agent-btn" v-if="type === 'select'" :title="selectedAgentLabel">
        <Image
          v-if="selectedAgent?.avatar"
          class="agent-avatar"
          :src="selectedAgent.avatar"
          alt=""
        />
        <Robot v-else />
        <span class="agent-name">{{ selectedAgentLabel }}</span>
        <ChevronDown class="arrow-icon" />
      </div>
      <Button v-else variant="icon" size="sm">
        <Image
          v-if="selectedAgent?.avatar"
          class="agent-avatar"
          :src="selectedAgent.avatar"
          alt=""
        />
        <Robot v-else />
      </Button>
    </template>

    <div class="agent-list">
      <template v-if="favoriteAgents.length > 0">
        <div class="agent-section-title">收藏</div>
        <div
          v-for="agent in favoriteAgents"
          :key="`favorite-${agent.id}`"
          class="agent-item"
          :class="{ selected: isAgentSelected(agent.id) }"
          @click="selectAgent(agent.id)"
        >
          <div class="agent-icon-container">
            <Image v-if="agent.avatar" class="agent-avatar-list" :src="agent.avatar" alt="" />
            <div v-else class="agent-icon">
              <Robot />
            </div>
          </div>
          <div class="agent-content" :class="{ 'agent-content--center': !agent.description }">
            <div class="agent-title" :title="agent.name">
              {{ agent.name }}
              <span v-if="tempAgents.some((a) => a.id === agent.id)" class="temp-tag">临时</span>
            </div>
            <div v-if="agent.description" class="agent-desc" :title="agent.description">{{ agent.description }}</div>
          </div>
          <div class="agent-check">
            <div v-if="hasAgentTools(agent)" class="agent-mcp">
              <Wrench20Regular />
              <span style="white-space: nowrap">{{ getAgentToolCount(agent) }}</span>
            </div>
            <button
              class="favorite-toggle"
              type="button"
              :class="{ active: favoriteAgentSet.has(agent.id) }"
              :title="favoriteAgentSet.has(agent.id) ? '取消收藏' : '收藏智能体'"
              @click="toggleFavoriteAgent(agent.id, $event)"
            >★</button>
            <Check v-if="isAgentSelected(agent.id)" />
            <Button @click.stop="openAgentModal(agent)" variant="icon" size="sm">
              <template #icon>
                <Edit />
              </template>
            </Button>
          </div>
        </div>
      </template>

      <template v-if="regularAgents.length > 0">
        <div v-if="favoriteAgents.length > 0" class="agent-section-title">全部</div>
        <div
          v-for="agent in regularAgents"
          :key="agent.id"
          class="agent-item"
          :class="{ selected: isAgentSelected(agent.id) }"
          @click="selectAgent(agent.id)"
        >
          <div class="agent-icon-container">
            <Image v-if="agent.avatar" class="agent-avatar-list" :src="agent.avatar" alt="" />
            <div v-else class="agent-icon">
              <Robot />
            </div>
          </div>
          <div class="agent-content" :class="{ 'agent-content--center': !agent.description }">
            <div class="agent-title" :title="agent.name">
              {{ agent.name }}
              <span v-if="tempAgents.some((a) => a.id === agent.id)" class="temp-tag">临时</span>
            </div>
            <div v-if="agent.description" class="agent-desc" :title="agent.description">{{ agent.description }}</div>
          </div>
          <div class="agent-check">
            <div v-if="hasAgentTools(agent)" class="agent-mcp">
              <Wrench20Regular />
              <span style="white-space: nowrap">{{ getAgentToolCount(agent) }}</span>
            </div>
            <button
              class="favorite-toggle"
              type="button"
              :class="{ active: favoriteAgentSet.has(agent.id) }"
              :title="favoriteAgentSet.has(agent.id) ? '取消收藏' : '收藏智能体'"
              @click="toggleFavoriteAgent(agent.id, $event)"
            >★</button>
            <Check v-if="isAgentSelected(agent.id)" />
            <Button @click.stop="openAgentModal(agent)" variant="icon" size="sm">
              <template #icon>
                <Edit />
              </template>
            </Button>
          </div>
        </div>
      </template>
    </div>
  </SelectorPopover>
</template>

<style scoped>
.agent-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--bg-hover);
  border: 1px solid transparent;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  transition: all 0.2s;
  max-width: 180px;
}

.agent-btn:hover {
  background: var(--border-color-light);
}

.agent-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-avatar {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  object-fit: cover;
}

.agent-avatar-list {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  object-fit: cover;
}

.agent-icon-container {
  flex-shrink: 0;
}

.arrow-icon {
  font-size: 10px;
  color: var(--text-tertiary);
}

.agent-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  margin-bottom: 2px;
}

.agent-section-title {
  padding: 8px 4px 6px;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-tertiary);
  letter-spacing: 0.06em;
}


.agent-item:hover {
  background: var(--bg-hover);
}

.agent-item.selected {
  background: var(--border-color-light);
}

.agent-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--accent-color) 0%, var(--accent-color) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.agent-icon :deep(svg) {
  font-size: 18px;
  color: var(--bg-card);
}

.agent-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
}

.agent-content--center {
  gap: 0;
}

.agent-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
}

.agent-desc {
  font-size: 11px;
  color: var(--text-tertiary);
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
}

.agent-mcp {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--text-secondary);
}

.agent-mcp :deep(svg) {
  font-size: 10px;
}

.agent-check {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.favorite-toggle {
  border: 0;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 16px;
  line-height: 1;
  padding: 0;
  cursor: pointer;
  transition: color 0.15s ease, transform 0.15s ease;
}

.favorite-toggle:hover {
  color: #f5b301;
  transform: scale(1.06);
}

.favorite-toggle.active {
  color: #f5b301;
}

.agent-check :deep(svg) {
  font-size: 14px;
  color: var(--accent-color);
  transition: opacity 0.15s;
}

.temp-tag {
  font-size: 10px;
  background: var(--bg-hover);
  color: var(--text-secondary);
  padding: 1px 4px;
  border-radius: 4px;
  margin-left: 4px;
  font-weight: normal;
}

:deep(.modal-body) .agent-list {
  padding-bottom: 4px;
}

:deep(.modal-body) .agent-item {
  padding: 12px;
  border-radius: 10px;
  margin-bottom: 6px;
  border: 1px solid transparent;
}

:deep(.modal-body) .agent-item:hover {
  border-color: rgba(var(--text-rgb), 0.06);
}

:deep(.modal-body) .agent-item.selected {
  background: color-mix(in srgb, var(--accent-color) 12%, var(--bg-card));
  border-color: color-mix(in srgb, var(--accent-color) 28%, transparent);
}

:deep(.modal-body) .agent-avatar-list,
:deep(.modal-body) .agent-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
}

:deep(.modal-body) .agent-title {
  font-size: 14px;
}

:deep(.modal-body) .agent-desc {
  font-size: 12px;
}
</style>
