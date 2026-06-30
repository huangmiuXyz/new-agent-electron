<script setup lang="ts">
import { useContextMenu, type MenuItem } from '@renderer/composables/useContextMenu'
import ContextMenu from '@renderer/components/ContextMenu.vue'
import MiniSearch from 'minisearch'
import { pinyin } from 'pinyin-pro'

const addPinyin = (text: string) => {
  if (!text) return text
  const initials = pinyin(text, { pattern: 'first', toneType: 'none' }).replace(/\s/g, '')
  return initials ? `${text} ${initials}` : text
}

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
const agentSelectorWrapperRef = ref<HTMLElement>()
const focusedIndex = ref(-1)

const visibleAgents = computed(() => [...favoriteAgents.value, ...regularAgents.value])

const focusSearchInput = () => {
  const input = document.querySelector<HTMLElement>(
    '.selector-tray .search-input__field, .selector-tray .selector-search-input input'
  )
  input?.focus()
}

const handleKeydown = (e: KeyboardEvent) => {
  if (!isPopupOpen.value) return
  if ((e.target as HTMLElement).closest('.context-menu')) return
  const items = visibleAgents.value
  if (items.length === 0) return

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      if (focusedIndex.value < items.length - 1) {
        focusedIndex.value++
      } else {
        focusedIndex.value = 0
      }
      focusSearchInput()
      break
    case 'ArrowUp':
      e.preventDefault()
      if (focusedIndex.value > 0) {
        focusedIndex.value--
      } else {
        focusedIndex.value = items.length - 1
      }
      focusSearchInput()
      break
    case 'Enter':
      e.preventDefault()
      if (focusedIndex.value >= 0 && focusedIndex.value < items.length) {
        selectAgent(items[focusedIndex.value].id)
      }
      break
  }
}

// Listen globally since tray is Teleported to body
onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))
const { Robot, ChevronDown, Wrench20Regular, Check, Edit, Plus, Copy, Delete, Settings } = useIcon([
  'Wrench20Regular',
  'Robot',
  'ChevronDown',
  'Server',
  'Check',
  'Edit',
  'Plus',
  'Copy',
  'Delete',
  'Settings'
])

const { showContextMenu } = useContextMenu<Agent>()

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

const agentSearch = new MiniSearch({
  fields: ['name', 'description'],
  storeFields: ['id'],
  searchOptions: { fuzzy: 0.2, prefix: true }
})

const rebuildAgentIndex = (agents: Agent[]) => {
  agentSearch.removeAll()
  agentSearch.addAll(
    agents.map((a) => ({ id: a.id, name: addPinyin(a.name), description: addPinyin(a.description || '') }))
  )
}

onMounted(() => rebuildAgentIndex(allAgents.value))
watch(allAgents, (agents) => rebuildAgentIndex(agents))

const filteredAgents = computed(() => {
  const query = searchQuery.value.trim()
  if (!query) return allAgents.value
  const results = agentSearch.search(query)
  const ids = new Set(results.map((r) => r.id))
  return allAgents.value.filter((a) => ids.has(a.id))
})

const favoriteAgentSet = computed(() => new Set(favoriteAgentIds.value))

const getAgentToolCount = (agent: Agent) => {
  return settingsStore.getValidTools(agent.tools).length + (agent.builtinTools?.length || 0)
}

const hasAgentTools = (agent: Agent) => getAgentToolCount(agent) > 0

const getAgentTags = (agent: Agent) => {
  if (agent.id === 'default') {
    return agent.tags?.length ? agent.tags : ['默认']
  }
  return agent.tags || []
}

const favoriteAgents = computed(() =>
  filteredAgents.value.filter((agent) => favoriteAgentSet.value.has(agent.id))
)

const regularAgents = computed(() =>
  filteredAgents.value.filter((agent) => !favoriteAgentSet.value.has(agent.id))
)

watch(isPopupOpen, (val) => {
  if (val) {
    nextTick(() => {
      const currentAgentId = chatsStore.currentChat?.agentId
      const idx = visibleAgents.value.findIndex((a) => a.id === currentAgentId)
      focusedIndex.value = idx >= 0 ? idx : 0
    })
  } else {
    searchQuery.value = ''
    focusedIndex.value = -1
  }
})

watch(focusedIndex, (idx) => {
  if (idx < 0) return
  nextTick(() => {
    const items = document.querySelectorAll('.selector-tray .agent-item')
    if (items[idx]) {
      items[idx].scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  })
})

const selectAgent = (agentId: string) => {
  const currentChatId = chatsStore.currentChat?.id
  if (!currentChatId) {
    chatsStore.createChat('新的聊天', { agentId })
    isPopupOpen.value = false
    return
  }

  // 切换智能体时，使用新智能体的默认模型
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

const toggleFavoriteAgent = (agentId: string, event?: MouseEvent) => {
  event?.stopPropagation()
  settingsStore.toggleFavoriteAgent(agentId)
}

const copyAgent = (agent: Agent) => {
  const clonedId = agentStore.cloneAgent(agent.id)
  if (!clonedId) return

  // 拷贝成功后关闭弹窗并选中新拷贝的智能体
  isPopupOpen.value = false
  const currentChatId = chatsStore.currentChat?.id
  if (currentChatId) {
    chatsStore.setChatAgent(currentChatId, clonedId)
  } else {
    chatsStore.createChat('新的聊天', { agentId: clonedId })
  }
}


const handleAgentContextMenu = (event: MouseEvent, agent: Agent) => {
  event.preventDefault()
  event.stopPropagation()

  const isBuiltinAgent = agentStore.isBuiltinAgent(agent.id)

  const menuItems: MenuItem<Agent>[] = [
    {
      label: favoriteAgentSet.value.has(agent.id) ? '取消收藏' : '收藏智能体',
      icon: favoriteAgentSet.value.has(agent.id) ? Check : undefined,
      action: 'favorite',
      onClick: (data: Agent) => {
        if (data) toggleFavoriteAgent(data.id)
      }
    },
    {
      type: 'divider'
    },
    {
      label: '拷贝智能体',
      icon: Copy,
      action: 'copy',
      disabled: false,
      onClick: (data: Agent) => {
        if (data) copyAgent(data)
      }
    },
    {
      label: '配置智能体',
      icon: Edit,
      action: 'edit',
      onClick: (data: Agent) => {
        if (data) openAgentModal(data)
      }
    },
    {
      type: 'divider'
    },
    {
      label: '删除智能体',
      icon: Delete,
      action: 'delete',
      danger: true,
      disabled: isBuiltinAgent,
      onClick: (data: Agent) => {
        if (data && !agentStore.isBuiltinAgent(data.id)) {
          agentStore.deleteAgent(data.id)
          // 如果删除的是当前智能体，切换到默认智能体
          const currentChatId = chatsStore.currentChat?.id
          if (currentChatId && chatsStore.currentChat?.agentId === data.id) {
            chatsStore.setChatAgent(currentChatId, 'default')
          }
        }
      }
    }
  ]

  showContextMenu(event, menuItems, agent)
}
</script>

<template>
  <div ref="agentSelectorWrapperRef">
  <SelectorPopover v-model:visible="isPopupOpen" v-model:searchQuery="searchQuery" :data="allAgents"
    desktop-presentation="tray" placeholder="搜索智能体..." noResultsText="未找到智能体" :hasResults="filteredAgents.length > 0"
    width="420px" title="选择智能体" tray-anchor=".input-container">
    <template #search-action>
      <Button variant="icon" size="sm" title="添加智能体" @click.stop="openCreateAgentModal">
        <template #icon>
          <Plus />
        </template>
      </Button>
    </template>

    <template #trigger>
      <div v-if="type === 'select'" class="agent-btn" :title="selectedAgentLabel">
        <Image v-if="selectedAgent?.avatar" class="agent-avatar" :src="selectedAgent.avatar" alt="" />
        <Robot v-else />
        <span class="agent-name">{{ selectedAgentLabel }}</span>
        <Tags v-if="selectedAgent && getAgentTags(selectedAgent).length" :tags="getAgentTags(selectedAgent)"
          color="orange" size="sm" />
        <ChevronDown class="arrow-icon" />
      </div>
      <Button v-else variant="icon" size="sm">
        <Image v-if="selectedAgent?.avatar" class="agent-avatar" :src="selectedAgent.avatar" alt="" />
        <Robot v-else />
      </Button>
    </template>

    <div class="agent-list">
      <template v-if="favoriteAgents.length > 0">
        <div class="agent-section-title">收藏</div>
        <div v-for="(agent, i) in favoriteAgents" :key="`favorite-${agent.id}`" class="agent-item"
          :class="{ selected: isAgentSelected(agent.id), focused: focusedIndex === i }" @click="selectAgent(agent.id)"
          @contextmenu="handleAgentContextMenu($event, agent)">
          <div class="agent-item-body">
            <div class="agent-item-name">{{ agent.name }}</div>
            <div v-if="agent.description" class="agent-item-desc">{{ agent.description }}</div>
          </div>
          <div class="agent-item-tail">
            <Check v-if="isAgentSelected(agent.id)" class="agent-item-check" />
            <div v-if="hasAgentTools(agent)" class="agent-item-tools">
              <Wrench20Regular />
            </div>
          </div>
        </div>
      </template>

      <template v-if="regularAgents.length > 0">
        <div v-if="favoriteAgents.length > 0" class="agent-section-title">全部</div>
        <div v-for="(agent, i) in regularAgents" :key="agent.id" class="agent-item"
          :class="{ selected: isAgentSelected(agent.id), focused: focusedIndex === favoriteAgents.length + i }" @click="selectAgent(agent.id)"
          @contextmenu="handleAgentContextMenu($event, agent)">
          <div class="agent-item-body">
            <div class="agent-item-name">{{ agent.name }}</div>
            <div v-if="agent.description" class="agent-item-desc">{{ agent.description }}</div>
          </div>
          <div class="agent-item-tail">
            <div v-if="hasAgentTools(agent)" class="agent-item-tools">
              <Wrench20Regular />
            </div>
          </div>
        </div>
      </template>
    </div>
  </SelectorPopover>
  <ContextMenu />
  </div>
</template>

<style scoped>
/* ---- Trigger button ---- */
.agent-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--bg-hover);
  border: 1px solid transparent;
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-primary);
  transition: all 0.12s ease;
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
  min-width: 0;
}

.agent-avatar {
  width: 14px;
  height: 14px;
  border-radius: 4px;
  object-fit: cover;
}

.arrow-icon {
  font-size: 10px;
  color: var(--text-tertiary);
}

/* ---- Agent list items (tray-style) ---- */
.agent-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  margin-bottom: 2px;
  cursor: pointer;
  transition: background-color 0.12s ease;
}

.agent-item:hover {
  background: var(--bg-hover);
}

.agent-item.focused {
  background: rgba(var(--accent-rgb, 47, 116, 255), 0.07);
}

.agent-item.selected {
  background: var(--sidebar-active-bg, var(--bg-active));
  position: relative;
}

.agent-item.selected::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 55%;
  background: var(--color-primary);
  border-radius: 2px;
}

/* Body: name + desc */
.agent-item-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.agent-item-name {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-item-desc {
  font-size: 10px;
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Tail: check + tools indicator */
.agent-item-tail {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.agent-item-check {
  font-size: 14px;
  color: var(--accent-color);
}

.agent-item-tools {
  display: flex;
  align-items: center;
  font-size: 12px;
  color: var(--text-tertiary);
}

/* Section title */
.agent-section-title {
  padding: 8px 8px 6px;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-tertiary);
  letter-spacing: 0.06em;
}

.agent-list {
}
</style>
