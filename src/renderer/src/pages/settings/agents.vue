<script setup lang="ts">
const agentStore = useAgentStore()
const { agents } = storeToRefs(agentStore)
const settingsStore = useSettingsStore()
const { mcpServers } = storeToRefs(settingsStore)

const { Plus, Pencil, Trash } = useIcon(['Plus', 'Pencil', 'Trash'])
const { confirm, remove } = useModal()

// 获取所有MCP服务器的选项列表
const mcpServerOptions = computed(() => {
    return Object.entries(mcpServers.value).map(([name, server]) => {
        const desc = server.description || (server as any).command || (server as any).url || server.transport || ''
        return {
            label: name,
            value: name,
            description: desc
        }
    })
})

const openAgentModal = async (agent?: Agent) => {
    const isEdit = !!agent
    const modalTitle = isEdit ? '编辑智能体' : '创建智能体'

    const initialData: Partial<Agent> = agent
        ? { ...agent }
        : {
            name: '',
            description: '',
            systemPrompt: '你是一个有帮助的AI助手。',
            mcpServers: []
        }

    const [FormComponent, formActions] = useForm({
        title: modalTitle,
        showHeader: false,
        initialData,
        fields: [
            {
                name: 'name',
                type: 'text',
                label: '名称',
                placeholder: '智能体名称',
                required: true
            },
            {
                name: 'description',
                type: 'textarea',
                label: '描述',
                placeholder: '简单描述智能体的功能',
                rows: 2
            },
            {
                name: 'systemPrompt',
                type: 'textarea',
                label: '系统提示词',
                placeholder: '定义智能体的行为和角色...',
                required: true,
                rows: 6
            },
            {
                name: 'mcpServers',
                type: 'checkboxGroup',
                label: 'MCP 服务器',
                options: mcpServerOptions.value
            }
        ],
        onSubmit: (data) => {
            if (isEdit && agent) {
                agentStore.updateAgent(agent.id, data as Partial<Agent>)
            } else {
                agentStore.createAgent(data as Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>)
            }
        }
    })

    confirm({
        title: modalTitle,
        content: FormComponent,
        maxHeight: '80vh',
        width: '600px',
        onOk: async () => {
            if (formActions.submit()) remove()
        }
    })
}

const handleDelete = (id: string) => {
    if (id === 'default') {
        alert('默认智能体不能删除')
        return
    }
    agentStore.deleteAgent(id)
}

const selectAgent = (agentId: string) => {
    agentStore.selectAgent(agentId)
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
                                    <div class="selected-badge" v-if="agentStore.selectedAgentId === agent.id">
                                        当前
                                    </div>
                                </div>
                                <div class="agent-description" v-if="agent.description">
                                    {{ agent.description }}
                                </div>
                                <div class="agent-meta">
                                    <div v-if="agent.mcpServers.length > 0" class="meta-item">
                                        <i class="ph ph-puzzle-piece"></i>
                                        <span>{{ agent.mcpServers.length }} 个MCP服务</span>
                                    </div>
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

                            <div v-if="agent.mcpServers.length > 0" class="mcp-list">
                                <div class="mcp-list-label">MCP 服务器:</div>
                                <div class="mcp-tags">
                                    <span v-for="serverName in agent.mcpServers" :key="serverName" class="mcp-tag">
                                        {{ serverName }}
                                    </span>
                                </div>
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
    margin-left: 46px;
}

.agent-meta {
    display: flex;
    gap: 16px;
    margin-left: 46px;
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
