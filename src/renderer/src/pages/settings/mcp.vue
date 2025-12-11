<script setup lang="ts">
const { mcpServers } = storeToRefs(useSettingsStore())
const { Plus, Pencil, Trash, Refresh, ChevronDown, ChevronUp } = useIcon(['Plus', 'Pencil', 'Trash', 'Refresh', 'ChevronDown', 'ChevronUp'])
const { confirm, remove } = useModal()

const expandedKeys = ref<Record<string, boolean>>({})

const openServerModal = async (server?: any) => {
    const isEdit = !!server
    const modalTitle = isEdit ? '编辑 MCP 服务器' : '添加 MCP 服务器'

    // 初始化数据结构
    const initialData = server ? { ...server } : {
        command: '',
        args: [],
        env: {},
        name: '',
        active: true,
        transport: 'stdio', // 默认类型
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
                placeholder: '给服务器起个名字',
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
                    { label: 'Stdio (本地进程)', value: 'stdio' },
                    { label: 'HTTP (远程)', value: 'http' },
                    { label: 'SSE (服务端推送)', value: 'sse' }
                ]
            },
            {
                name: 'command',
                type: 'text',
                label: '命令',
                placeholder: '例如：npx, python, node',
                required: true,
                // 仅 stdio 显示
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
                // http 或 sse 显示
                ifShow: (data) => data.transport === 'sse' || data.transport === 'http'
            },
            {
                name: 'headers',
                type: 'object',
                label: '请求头',
                keyPlaceholder: '键',
                valuePlaceholder: '值',
                ifShow: (data) => data.transport === 'sse' || data.transport === 'http'
            },
        ],
        onSubmit: (data) => {
            // 保存到 store
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
    delete expandedKeys.value[name]
}

const activeMcpLoading = ref<string | null>(null)

const fetchTools = async (server: ClientConfig[string]) => {
    activeMcpLoading.value = server.name
    try {
        const tools = await chatService().list_tools({
            [server.name]: JSON.parse(JSON.stringify(server)),
        }, false)
        server.tools = tools
        server.active = !server.active
    } catch (error) {
        messageApi.error((error as Error).message)
    } finally {
        activeMcpLoading.value = ''
    }
}

const toggleActive = async (server: any) => {
    if (!server.active) {
        await fetchTools(server)
    } else {
        server.active = !server.active
    }
}

const toggleExpand = (name: string) => {
    expandedKeys.value[name] = !expandedKeys.value[name]
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
                        <div class="card-header">
                            <div class="server-info">
                                <div class="server-name-row">
                                    <div class="server-name">{{ name }}</div>
                                    <div class="tool-count" v-if="server.tools?.length">
                                        {{ server.tools.length }} 个工具
                                    </div>
                                    <div class="server-transport-tag">{{ server.transport }}</div>
                                </div>

                                <!-- Stdio 信息 -->
                                <template v-if="server.transport === 'stdio'">
                                    <div class="server-command">{{ server.command }}</div>
                                </template>

                                <!-- HTTP/SSE 信息 -->
                                <template v-if="server.transport === 'http' || server.transport === 'sse'">
                                    <div class="server-url">{{ server.url }}</div>
                                </template>

                                <div class="server-description" v-if="server.description">
                                    {{ server.description }}
                                </div>
                            </div>

                            <div class="server-actions">
                                <Button size="sm" variant="text" @click="fetchTools(server)"
                                    :loading="activeMcpLoading === name" v-if="server.active" title="刷新工具列表">
                                    <template #icon>
                                        <Refresh />
                                    </template>
                                </Button>
                                <Switch :loading="activeMcpLoading === name" :model-value="server.active"
                                    @update:model-value="toggleActive(server)" />
                                <Button size="sm" variant="text" @click="openServerModal(server)">
                                    <template #icon>
                                        <Pencil />
                                    </template>
                                </Button>
                                <Button size="sm" variant="text" class="delete-btn"
                                    @click="handleDelete(name as string)">
                                    <template #icon>
                                        <Trash />
                                    </template>
                                </Button>
                                <Button size="sm" variant="text" @click="toggleExpand(name as string)"
                                    v-if="server.active && Object.keys(server.tools || {})?.length">
                                    <template #icon>
                                        <ChevronUp v-if="expandedKeys[name as string]" />
                                        <ChevronDown v-else />
                                    </template>
                                </Button>
                            </div>
                        </div>

                        <!-- 详情区域 -->
                        <div class="card-details" v-if="server.transport === 'stdio'">
                            <div v-if="server.args?.length" class="detail-item">
                                <span class="label">参数:</span>
                                <span class="value">{{ server.args.join(' ') }}</span>
                            </div>
                            <div v-if="server.env && Object.keys(server.env).length" class="detail-item">
                                <span class="label">Env:</span>
                                <span class="value">{{ Object.keys(server.env).length }} 个变量</span>
                            </div>
                        </div>

                        <!-- 工具列表区域 -->
                        <div class="tools-container" v-if="server.active && expandedKeys[name as string]">
                            <div class="tools-divider"></div>
                            <div class="tools-grid">
                                <div v-for="(tool, name) of server.tools" :key="name" class="tool-item">
                                    <div class="tool-head">
                                        <span class="tool-name-tag">{{ name }}</span>
                                    </div>
                                    <div class="tool-desc" :title="tool.description">{{ tool.description || '无描述' }}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div v-if="!mcpServers || Object.keys(mcpServers).length === 0" class="empty-state">
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
    flex: 1;
    overflow: hidden;
    /* 防止URL过长撑开 */
}

.server-name-row {
    display: flex;
    align-items: center;
    gap: 8px;
}

.server-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
}

.tool-count {
    font-size: 11px;
    background: #e6f7ff;
    color: #1890ff;
    padding: 1px 6px;
    border-radius: 10px;
    white-space: nowrap;
}

.server-transport-tag {
    font-size: 10px;
    text-transform: uppercase;
    background: #f0f0f0;
    color: #666;
    padding: 1px 4px;
    border-radius: 3px;
}

.server-description {
    font-size: 12px;
    color: var(--text-tertiary);
    margin-top: 2px;
}

.server-command,
.server-url {
    font-size: 12px;
    color: var(--text-tertiary);
    font-family: monospace;
    background: #f5f5f5;
    padding: 2px 6px;
    border-radius: 4px;
    align-self: flex-start;
    margin-top: 4px;
    word-break: break-all;
}

.server-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: 16px;
    flex-shrink: 0;
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
    margin-top: 8px;
}

.detail-item {
    display: flex;
    gap: 6px;
}

.detail-item .label {
    color: var(--text-tertiary);
}

.tools-container {
    margin-top: 12px;
}

.tools-divider {
    height: 1px;
    background: #f0f0f0;
    margin: 12px 0;
}

.tools-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 8px;
}

.tool-item {
    background: #fafafa;
    border: 1px solid #eaeaea;
    border-radius: 6px;
    padding: 10px;
    font-size: 12px;
}

.tool-head {
    margin-bottom: 4px;
}

.tool-name-tag {
    font-weight: 600;
    color: var(--text-primary);
    background: #fff;
    border: 1px solid #e0e0e0;
    padding: 2px 6px;
    border-radius: 4px;
}

.tool-desc {
    color: var(--text-secondary);
    line-height: 1.4;
    margin-bottom: 6px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
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