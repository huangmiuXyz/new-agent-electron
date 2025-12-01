<script setup lang="ts">
const agentStore = useAgentStore()
const { agents, selectedAgentId } = storeToRefs(agentStore)

const isPopupOpen = ref(false)
const searchQuery = ref('')
const { Robot, ChevronDown, Server, Check } = useIcon(['Robot', 'ChevronDown', 'Server', 'Check'])

const selectedAgentLabel = computed(() => {
    const agent = agentStore.selectedAgent
    return agent ? agent.name : '选择智能体'
})

const filteredAgents = computed(() => {
    const query = searchQuery.value.toLowerCase()
    if (!query) return agents.value

    return agents.value.filter(
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
</script>

<template>
    <SelectorPopover v-model="isPopupOpen" v-model:searchQuery="searchQuery" placeholder="搜索智能体..."
        noResultsText="未找到智能体" :hasResults="filteredAgents.length > 0" width="500px">
        <template #trigger>
            <div class="agent-btn" :title="selectedAgentLabel">
                <Robot />
                <span class="agent-name">{{ selectedAgentLabel }}</span>
                <ChevronDown class="arrow-icon" />
            </div>
        </template>

        <div class="agent-list">
            <div v-for="agent in filteredAgents" :key="agent.id" class="agent-item"
                :class="{ selected: isAgentSelected(agent.id) }" @click="selectAgent(agent.id)">
                <div class="agent-content">
                    <div class="agent-title">{{ agent.name }}</div>
                    <div v-if="agent.description" class="agent-desc">{{ agent.description }}</div>
                    <div v-if="agent.mcpServers.length > 0" class="agent-mcp">
                        <Server />
                        <span style="white-space: nowrap;">{{ agent.mcpServers.length }} 个MCP服务</span>
                    </div>
                </div>
                <div class="agent-check">
                    <Check :style="{
                        opacity: isAgentSelected(agent.id) ? 1 : 0
                    }" />
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
    margin-bottom: 2px;
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
    width: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.agent-check :deep(svg) {
    font-size: 14px;
    color: var(--accent-color);
    transition: opacity 0.15s;
}
</style>
