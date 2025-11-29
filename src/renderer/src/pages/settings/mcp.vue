<script setup lang="ts">
const { mcpServers } = storeToRefs(useSettingsStore())
const { Plus, Pencil, Trash } = useIcon(['Plus', 'Pencil', 'Trash'])
const { confirm, remove } = useModal()

const openServerModal = async (server?: McpServers[string]) => {
    const isEdit = !!server
    const modalTitle = isEdit ? '编辑 MCP 服务器' : '添加 MCP 服务器'

    const initialData: McpServers[string] = server ? { ...server } : {
        command: '',
        args: [],
        env: {},
        name: '',
        active: true,
        transport: 'stdio',
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
                placeholder: '名称',
                required: true
            },
            {
                name: 'description',
                type: 'textarea',
                label: '描述',
                placeholder: '描述',
            },
            {
                name: 'transport',
                type: 'select',
                label: '类型',
                required: true,
                options: [
                    { label: 'stdio', value: 'stdio' },
                    { label: 'http', value: 'http' },
                    { label: 'sse', value: 'sse' }
                ]
            },
            {
                name: 'command',
                type: 'text',
                label: '命令',
                placeholder: '例如：npx 或 python',
                required: true,
                ifShow: (data) => data.transport === 'stdio'
            },
            {
                name: 'args',
                type: 'array',
                label: '参数',
                placeholder: '参数值',
                ifShow: (data) => data.transport === 'stdio'
            },
            {
                name: 'env',
                type: 'object',
                label: '环境变量',
                keyPlaceholder: '变量名',
                valuePlaceholder: '变量值',
                ifShow: (data) => data.transport === 'stdio'
            },
            {
                name: 'url',
                type: 'text',
                label: 'URL',
                placeholder: 'http://localhost:3000/mcp',
                required: true,
                ifShow: (data) => data.transport === 'sse' || data.transport === 'http'
            },
        ],
        onSubmit: (data) => {
            mcpServers.value[data.name!] = data
        }
    })

    confirm({
        title: modalTitle,
        content: FormComponent,
        maxHeight: '70vh',
        width: '50%',
        onOk: async () => {
            if (formActions.submit()) remove()
        }
    })
}

const handleDelete = (name: string) => {
    delete mcpServers.value[name]
}

const toggleActive = (server: McpServers[string]) => {
    server.active = !server.active
}
</script>

<template>
    <SettingFormContainer header-title="MCP 服务器">
        <template #content>
            <div class="mcp-container">
                <div class="mcp-header">
                    <div class="description">
                        配置模型上下文协议 (MCP) 服务器以扩展功能。
                    </div>
                    <Button size="sm" @click="openServerModal()">
                        <template #icon>
                            <Plus />
                        </template>
                        添加服务器
                    </Button>
                </div>

                <div class="server-list">
                    <div v-for="(server, name) of mcpServers" :key="name" class="server-card">
                        <template v-if="server.transport === 'stdio'">
                            <div class="card-header">
                                <div class="server-info">
                                    <div class="server-name">{{ name }}</div>
                                    <div class="server-command">{{ server.command }}</div>
                                </div>
                                <div class="server-actions">
                                    <Switch :model-value="server.active" @update:model-value="toggleActive(server)" />
                                    <Button size="sm" variant="text" @click="openServerModal(server)">
                                        <template #icon>
                                            <Pencil />
                                        </template>
                                    </Button>
                                    <Button size="sm" variant="text" class="delete-btn" @click="handleDelete(name)">
                                        <template #icon>
                                            <Trash />
                                        </template>
                                    </Button>
                                </div>
                            </div>
                            <div class="card-details">
                                <div v-if="server.args?.length" class="detail-item">
                                    <span class="label">参数:</span>
                                    <span class="value">{{ server.args.join(' ') }}</span>
                                </div>
                                <div v-if="server.env?.length" class="detail-item">
                                    <span class="label">Env:</span>
                                    <span class="value">{{ server.env.length }} 个变量</span>
                                </div>
                            </div>
                        </template>
                    </div>

                    <div v-if="Object.keys(mcpServers).length === 0" class="empty-state">
                        尚未配置 MCP 服务器。点击"添加服务器"开始配置。
                    </div>
                </div>
            </div>
        </template>
    </SettingFormContainer>
</template>

<style scoped>
.mcp-container {
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.mcp-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
}

.description {
    font-size: 13px;
    color: var(--text-secondary);
}

.server-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.server-card {
    background: #fff;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    padding: 16px;
    transition: all 0.2s;
}

.server-card:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    border-color: var(--border-hover, #d1d1d1);
}

.card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 8px;
}

.server-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.server-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
}

.server-command {
    font-size: 12px;
    color: var(--text-tertiary);
    font-family: monospace;
    background: #f5f5f5;
    padding: 2px 6px;
    border-radius: 4px;
    align-self: flex-start;
    margin-top: 4px;
}

.server-actions {
    display: flex;
    align-items: center;
    gap: 8px;
}

.delete-btn {
    color: var(--text-tertiary);
}

.delete-btn:hover {
    color: #ff4757;
}

.card-details {
    display: flex;
    gap: 16px;
    font-size: 12px;
    color: var(--text-secondary);
    border-top: 1px solid #f5f5f5;
    padding-top: 12px;
}

.detail-item {
    display: flex;
    gap: 6px;
}

.detail-item .label {
    color: var(--text-tertiary);
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
</style>
