<script setup lang="ts">
const agentStore = useAgentStore()
const { agents, selectedAgentId } = storeToRefs(agentStore)

// 弹窗状态
const isPopupOpen = ref(false)
const searchQuery = ref('')

// 计算属性
const selectedAgentLabel = computed(() => {
    const agent = agentStore.selectedAgent
    return agent ? agent.name : '选择智能体'
})

// 过滤后的智能体列表
const filteredAgents = computed(() => {
    const query = searchQuery.value.toLowerCase()
    if (!query) return agents.value

    return agents.value.filter(
        (agent) =>
            agent.name.toLowerCase().includes(query) ||
            agent.description?.toLowerCase().includes(query)
    )
})

// 方法
const togglePopup = () => {
    isPopupOpen.value = !isPopupOpen.value
    if (isPopupOpen.value) {
        nextTick(() => {
            document.addEventListener('click', handleClickOutside)
        })
    } else {
        document.removeEventListener('click', handleClickOutside)
    }
}

const closePopup = () => {
    isPopupOpen.value = false
    document.removeEventListener('click', handleClickOutside)
    searchQuery.value = ''
}

const handleClickOutside = (event: MouseEvent) => {
    const target = event.target as HTMLElement
    if (!target.closest('.agent-selector-wrapper')) {
        closePopup()
    }
}

const selectAgent = (agentId: string) => {
    agentStore.selectAgent(agentId)
    closePopup()
}

const isAgentSelected = (agentId: string) => {
    return agentId === selectedAgentId.value
}

onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
    <div class="agent-selector-wrapper">
        <!-- 智能体选择按钮 -->
        <div class="agent-btn" @click="togglePopup" :title="selectedAgentLabel">
            <i class="ph-bold ph-robot"></i>
            <span class="agent-name">{{ selectedAgentLabel }}</span>
            <i class="ph-bold ph-caret-down arrow-icon"></i>
        </div>

        <!-- 智能体选择弹窗 -->
        <div class="agent-popup" :class="{ show: isPopupOpen }">
            <!-- 搜索框 -->
            <div class="agent-search">
                <i class="ph ph-magnifying-glass"></i>
                <input v-model="searchQuery" type="text" placeholder="搜索智能体..." autocomplete="off" />
            </div>

            <!-- 智能体列表 -->
            <div class="agent-list-container">
                <!-- 无结果提示 -->
                <div v-if="filteredAgents.length === 0" class="no-results">未找到智能体</div>

                <!-- 智能体列表 -->
                <div v-else class="agent-list">
                    <div v-for="agent in filteredAgents" :key="agent.id" class="agent-item"
                        :class="{ selected: isAgentSelected(agent.id) }" @click="selectAgent(agent.id)">
                        <div class="agent-content">
                            <div class="agent-title">{{ agent.name }}</div>
                            <div v-if="agent.description" class="agent-desc">{{ agent.description }}</div>
                            <div v-if="agent.mcpServers.length > 0" class="agent-mcp">
                                <i class="ph ph-puzzle-piece"></i>
                                <span>{{ agent.mcpServers.length }} 个MCP服务</span>
                            </div>
                        </div>
                        <div class="agent-check">
                            <i class="ph-bold ph-check" :style="{
                                opacity: isAgentSelected(agent.id) ? 1 : 0
                            }"></i>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.agent-selector-wrapper {
    position: relative;
}

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

.agent-popup {
    position: absolute;
    bottom: 38px;
    left: 0;
    width: 320px;
    background: rgba(255, 255, 255, 0.85);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(0, 0, 0, 0.08);
    border-radius: 10px;
    box-shadow:
        0 4px 20px rgba(0, 0, 0, 0.12),
        0 1px 4px rgba(0, 0, 0, 0.05);
    display: none;
    flex-direction: column;
    overflow: hidden;
    z-index: 100;
    transform-origin: bottom left;
}

.agent-popup.show {
    display: flex;
    animation: popupFadeIn 0.15s cubic-bezier(0.2, 0.8, 0.2, 1);
}

@keyframes popupFadeIn {
    from {
        opacity: 0;
        transform: scale(0.96) translateY(4px);
    }

    to {
        opacity: 1;
        transform: scale(1) translateY(0);
    }
}

.agent-search {
    padding: 8px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    display: flex;
    align-items: center;
    gap: 6px;
}

.agent-search input {
    border: none;
    background: transparent;
    width: 100%;
    outline: none;
    font-size: 12px;
    color: var(--text-primary);
    padding: 0;
    font-family: var(--font-stack);
}

.agent-search i {
    color: var(--text-tertiary);
    font-size: 14px;
}

.agent-list-container {
    max-height: 320px;
    overflow-y: auto;
}

.agent-list {
    padding: 4px;
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

.agent-icon i {
    font-size: 18px;
    color: #fff;
}

.agent-content {
    flex: 1;
    min-width: 0;
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
    margin-bottom: 4px;
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

.agent-mcp i {
    font-size: 10px;
}

.agent-check {
    flex-shrink: 0;
    width: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.agent-check i {
    font-size: 14px;
    color: var(--accent-color);
    transition: opacity 0.15s;
}

.no-results {
    padding: 20px;
    text-align: center;
    color: var(--text-tertiary);
    font-size: 12px;
}

/* 滚动条样式 */
.agent-list-container::-webkit-scrollbar {
    width: 6px;
}

.agent-list-container::-webkit-scrollbar-track {
    background: transparent;
}

.agent-list-container::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.1);
    border-radius: 3px;
}

.agent-list-container::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 0, 0, 0.2);
}
</style>
