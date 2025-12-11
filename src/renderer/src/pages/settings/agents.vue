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

const getAllToolOptions = (selectedMcpServers: string[]) => {
    const toolOptions: { label: string; value: string; description?: string }[] = []

    selectedMcpServers.forEach(serverName => {
        const server = mcpServers.value[serverName]
        if (server && server.tools && Object.keys(server.tools).length > 0) {
            Object.entries(server.tools).forEach(([toolName, tool]) => {
                toolOptions.push({
                    label: `${serverName}.${toolName}`,
                    value: `${serverName}.${toolName}`,
                    description: tool.description || ''
                })
            })
        }
    })

    return toolOptions
}

const openAgentModal = async (agent?: Agent) => {
    const isEdit = !!agent
    const modalTitle = isEdit ? '编辑智能体' : '创建智能体'

    const initialData: Partial<Agent> = agent
        ? { ...agent }
        : {
            name: '',
            description: '',
            systemPrompt: '你是一个有帮助的AI助手。',
            mcpServers: [],
            tools: []
        }

    // 保存之前的服务器状态，用于比较变化
    let previousMcpServers = initialData.mcpServers || []

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
            },
            {
                name: 'tools',
                type: 'checkboxGroup',
                label: '工具',
                options: [],
                ifShow: (data) => data.mcpServers! && data.mcpServers!.length > 0
            }
        ],
        onChange: (field, value, formData) => {
            if (field === 'mcpServers') {
                const selectedMcpServers = value as string[]
                const newToolOptions = getAllToolOptions(selectedMcpServers)
                formActions.updateFieldProps('tools', {
                    options: newToolOptions
                })
                const addedServers = selectedMcpServers.filter(server => !previousMcpServers.includes(server))
                const removedServers = previousMcpServers.filter(server => !selectedMcpServers.includes(server))
                let currentTools = formData.tools as string[] || []
                addedServers.forEach(serverName => {
                    const server = mcpServers.value[serverName]
                    if (server && server.tools) {
                        Object.keys(server.tools).forEach(toolName => {
                            const toolId = `${serverName}.${toolName}`
                            if (!currentTools.includes(toolId)) {
                                currentTools.push(toolId)
                            }
                        })
                    }
                })
                removedServers.forEach(serverName => {
                    currentTools = currentTools.filter(toolId => !toolId.startsWith(`${serverName}.`))
                })
                formActions.setFieldValue('tools', currentTools)
                previousMcpServers = [...selectedMcpServers]
            }
        },
        onSubmit: (data) => {
            if (isEdit && agent) {
                agentStore.updateAgent(agent.id, data as Partial<Agent>)
            } else {
                agentStore.createAgent(data as Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>)
            }
        }
    })

    formActions.updateFieldProps('tools', {
        options: getAllToolOptions(initialData.mcpServers || [])
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

                            <div v-if="agent.mcpServers.filter(name => mcpServers[name]).length > 0" class="mcp-list">
                                <div class="mcp-list-label">MCP 服务器:</div>
                                <div class="mcp-tags">
                                    <span v-for="serverName in agent.mcpServers.filter(name => mcpServers[name])"
                                        :key="serverName" class="mcp-tag">
                                        {{ serverName }}
                                    </span>
                                </div>
                            </div>

                            <div v-if="agent.tools && agent.tools.length > 0" class="tools-list">
                                <div class="tools-list-label">工具:</div>
                                <div class="tools-tags">
                                    <span v-for="tool in agent.tools.slice(0, 5)" :key="tool" class="tool-tag">
                                        {{ tool }}
                                    </span>
                                    <span v-if="agent.tools.length > 5" class="tool-more">
                                        +{{ agent.tools.length - 5 }} 更多
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
