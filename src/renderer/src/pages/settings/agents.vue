<script setup lang="ts">

const { agents } = storeToRefs(useAgentStore())
const { mcpServers } = storeToRefs(useSettingsStore())
const { getValidTools } = useSettingsStore()
const { knowledgeBases } = storeToRefs(useKnowledgeStore())

const { Plus, Pencil, Trash } = useIcon(['Plus', 'Pencil', 'Trash'])
const { openAgentModal, handleDelete, selectAgent } = useAgent()

// 根据知识库ID获取知识库名称
const getKnowledgeBaseName = (kbId: string) => {
    const kb = knowledgeBases.value.find(k => k.id === kbId)
    return kb ? kb.name : kbId
}

</script>

<template>
    <SettingFormContainer header-title="智能体管理">
        <template #content>
            <div class="agents-container">
                <div class="agents-header">
                    <div class="description">
                        创建和管理AI智能体，每个智能体可以有不同的系统提示词和MCP服务器配置。
                    </div>
                    <Button size="sm" @click="openAgentModal()">
                        <template #icon>
                            <Plus />
                        </template>
                        创建智能体
                    </Button>
                </div>

                <div class="agent-list">
                    <div v-for="agent in agents" :key="agent.id" class="agent-card" @click="selectAgent(agent.id)">
                        <div class="card-header">
                            <div class="agent-info">
                                <div class="agent-name-row">
                                    <div class="agent-name">{{ agent.name }}</div>
                                </div>
                                <div class="agent-description" v-if="agent.description">
                                    {{ agent.description }}
                                </div>
                            </div>
                            <div class="agent-actions" @click.stop>
                                <Button size="sm" variant="text" @click="openAgentModal(agent)" title="编辑">
                                    <template #icon>
                                        <Pencil />
                                    </template>
                                </Button>
                                <Button v-if="agent.id !== 'default'" size="sm" variant="text" class="delete-btn"
                                    @click="handleDelete(agent.id)" title="删除">
                                    <template #icon>
                                        <Trash />
                                    </template>
                                </Button>
                            </div>
                        </div>

                        <div class="card-body">
                            <div class="system-prompt-preview">
                                <div class="preview-label">系统提示词:</div>
                                <div class="preview-text">{{ agent.systemPrompt }}</div>
                            </div>

                            <div v-if="agent.mcpServers.filter(name => mcpServers[name] && mcpServers[name].active).length > 0"
                                class="mcp-list">
                                <div class="mcp-list-label">MCP 服务器:</div>
                                <div class="mcp-tags">
                                    <span
                                        v-for="serverName in agent.mcpServers.filter(name => mcpServers[name] && mcpServers[name].active)"
                                        :key="serverName" class="mcp-tag">
                                        {{ serverName }}
                                    </span>
                                </div>
                            </div>

                            <div v-if="getValidTools(agent.tools).length > 0" class="tools-list">
                                <div class="tools-list-label">工具:</div>
                                <div class="tools-tags">
                                    <span v-for="tool in getValidTools(agent.tools)" :key="tool" class="tool-tag">
                                        {{ tool }}
                                    </span>
                                </div>
                            </div>
                            <div v-if="agent.builtinTools && agent.builtinTools.length > 0" class="tools-list">
                                <div class="tools-list-label">内置工具:</div>
                                <div class="tools-tags">
                                    <span v-for="tool in agent.builtinTools" :key="tool" class="tool-tag">
                                        {{ tool }}
                                    </span>
                                </div>
                            </div>
                            <div v-if="agent.knowledgeBaseIds && agent.knowledgeBaseIds.length > 0"
                                class="knowledge-list">
                                <div class="knowledge-list-label">关联知识库:</div>
                                <div class="knowledge-tags">
                                    <span v-for="kbId in agent.knowledgeBaseIds" :key="kbId" class="knowledge-tag">
                                        {{ getKnowledgeBaseName(kbId) }}
                                    </span>
                                </div>
                            </div>
                            <div v-if="agent.ragEnabled" class="rag-status">
                                <div class="rag-status-label">RAG:</div>
                                <div class="rag-status-value">已启用</div>
                            </div>
                        </div>
                    </div>

                    <div v-if="agents.length === 0" class="empty-state">
                        尚未创建智能体。点击"创建智能体"开始配置。
                    </div>
                </div>
            </div>
        </template>
    </SettingFormContainer>
</template>

<style scoped>
.agents-container {
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.agents-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
}

.description {
    font-size: 13px;
    color: var(--text-secondary);
    max-width: 600px;
}

.agent-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.agent-card {
    background: #fff;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    padding: 16px;
    transition: all 0.2s;
    cursor: pointer;
}

.agent-card:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    border-color: var(--border-hover, #d1d1d1);
}

.agent-card.selected {
    border-color: var(--accent-color, #000);
    background: #fafafa;
}

.card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 4px;
}

.agent-info {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
}

.agent-name-row {
    display: flex;
    align-items: center;
    gap: 4px;
}

.agent-icon {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.agent-icon i {
    font-size: 20px;
    color: #fff;
}

.agent-name {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
}

.selected-badge {
    font-size: 10px;
    background: var(--accent-color, #000);
    color: #fff;
    padding: 2px 8px;
    border-radius: 10px;
    font-weight: 500;
}

.agent-description {
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.4;
}

.agent-meta {
    display: flex;
    gap: 16px;
    margin-top: 4px;
}

.meta-item {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--text-tertiary);
}

.meta-item i {
    font-size: 12px;
}

.agent-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: 16px;
}

.delete-btn {
    color: var(--text-tertiary);
}

.delete-btn:hover {
    color: #ff4757;
}

.card-body {
    border-top: 1px solid #f5f5f5;
    padding-top: 4px;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.system-prompt-preview {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.preview-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.preview-text {
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.5;
    background: #f9f9f9;
    padding: 4px;
    border-radius: 6px;
    border: 1px solid #eee;
    max-height: 80px;
    overflow-y: auto;
}

.mcp-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.mcp-list-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.mcp-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.mcp-tag {
    font-size: 11px;
    background: #e6f7ff;
    color: #1890ff;
    padding: 3px 8px;
    border-radius: 4px;
    border: 1px solid #91d5ff;
}

.tools-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.tools-list-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.tools-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.tool-tag {
    font-size: 10px;
    background: #f0f9ff;
    color: #0369a1;
    padding: 2px 6px;
    border-radius: 3px;
    border: 1px solid #bae6fd;
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.tool-more {
    font-size: 10px;
    background: #f5f5f5;
    color: var(--text-tertiary);
    padding: 2px 6px;
    border-radius: 3px;
    border: 1px solid #e0e0e0;
}

.knowledge-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.knowledge-list-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.knowledge-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.knowledge-tag {
    font-size: 11px;
    background: #f6ffed;
    color: #52c41a;
    padding: 3px 8px;
    border-radius: 4px;
    border: 1px solid #b7eb8f;
}

.rag-status {
    display: flex;
    align-items: center;
    gap: 6px;
}

.rag-status-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.rag-status-value {
    font-size: 11px;
    background: #fff7e6;
    color: #fa8c16;
    padding: 3px 8px;
    border-radius: 4px;
    border: 1px solid #ffd591;
}

.empty-state {
    text-align: center;
    padding: 40px;
    color: var(--text-tertiary);
    background: #fafafa;
    border-radius: 8px;
    border: 1px dashed var(--border-subtle);
    font-size: 13px;
}

/* 滚动条样式 */
.preview-text::-webkit-scrollbar {
    width: 4px;
}

.preview-text::-webkit-scrollbar-track {
    background: transparent;
}

.preview-text::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.1);
    border-radius: 2px;
}

.preview-text::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 0, 0, 0.2);
}
</style>
