<script setup lang="ts">
const agentStore = useAgentStore()
const { allAgents, selectedAgentId, tempAgents } = storeToRefs(agentStore)
const settingsStore = useSettingsStore()
const { mcpServers } = storeToRefs(settingsStore)
withDefaults(defineProps<{
    type: 'icon' | 'select'
}>(), {
    type: 'select'
})
const isPopupOpen = ref(false)
const searchQuery = ref('')
const { Robot, ChevronDown, Wrench20Regular, Check, Edit } = useIcon(['Wrench20Regular', 'Robot', 'ChevronDown', 'Server', 'Check', 'Edit'])

const selectedAgentLabel = computed(() => {
    const agent = agentStore.selectedAgent
    if (!agent) return '选择智能体'
    return agent.name + (tempAgents.value.some(a => a.id === agent.id) ? ' (临时)' : '')
})

const filteredAgents = computed(() => {
    const query = searchQuery.value.toLowerCase()
    if (!query) return allAgents.value

    return allAgents.value.filter(
        (agent) =>
            agent.name.toLowerCase().includes(query) ||
            agent.description?.toLowerCase().includes(query)
    )
})

watch(isPopupOpen, (val) => {
    if (!val) {
        searchQuery.value = ''
    }
})

const selectAgent = (agentId: string) => {
    agentStore.selectAgent(agentId)
    isPopupOpen.value = false
}

const isAgentSelected = (agentId: string) => {
    return agentId === selectedAgentId.value
}
const { openAgentModal } = useAgent()
</script>

<template>
    <SelectorPopover v-model="isPopupOpen" v-model:searchQuery="searchQuery" placeholder="搜索智能体..."
        noResultsText="未找到智能体" :hasResults="filteredAgents.length > 0" width="500px">
        <template #trigger>
            <div class="agent-btn" v-if="type === 'select'" :title="selectedAgentLabel">
                <Robot />
                <span class="agent-name">{{ selectedAgentLabel }}</span>
                <ChevronDown class="arrow-icon" />
            </div>
            <Button v-else variant="icon" size="sm">
                <Robot />
            </Button>
        </template>

        <div class="agent-list">
            <div v-for="agent in filteredAgents" :key="agent.id" class="agent-item"
                :class="{ selected: isAgentSelected(agent.id) }" @click="selectAgent(agent.id)">
                <div class="agent-content">
                    <div class="agent-title">
                        {{ agent.name }}
                        <span v-if="tempAgents.some(a => a.id === agent.id)" class="temp-tag">临时</span>
                    </div>
                    <div v-if="agent.description" class="agent-desc">{{ agent.description }}</div>
                </div>
                <div class="agent-check">
                    <div v-if="agent.mcpServers.filter(name => mcpServers[name]).length > 0" class="agent-mcp">
                        <Wrench20Regular />
                        <span style="white-space: nowrap;">{{ settingsStore.getValidTools(agent.tools).length +
                            agent.builtinTools?.length }}
                        </span>
                    </div>
                    <Check v-if="isAgentSelected(agent.id)" />
                    <Button @click="openAgentModal(agent)" variant="icon" size="sm">
                        <template #icon>
                            <Edit />
                        </template>
                    </Button>
                </div>
            </div>
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
    background: rgba(0, 0, 0, 0.03);
    border: 1px solid transparent;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-primary);
    transition: all 0.2s;
    max-width: 180px;
}

.agent-btn:hover {
    background: rgba(0, 0, 0, 0.06);
}

.agent-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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

.agent-item:hover {
    background: rgba(0, 0, 0, 0.05);
}

.agent-item.selected {
    background: rgba(0, 0, 0, 0.08);
}

.agent-icon {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.agent-icon :deep(svg) {
    font-size: 18px;
    color: #fff;
}

.agent-content {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 4px;
}

.agent-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.agent-desc {
    font-size: 11px;
    color: var(--text-tertiary);
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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

.agent-check :deep(svg) {
    font-size: 14px;
    color: var(--accent-color);
    transition: opacity 0.15s;
}

.temp-tag {
    font-size: 10px;
    background: #f3f4f6;
    color: #6b7280;
    padding: 1px 4px;
    border-radius: 4px;
    margin-left: 4px;
    font-weight: normal;
}
</style>
