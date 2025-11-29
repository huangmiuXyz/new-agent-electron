<script setup lang="ts">
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useSettingsStore } from '@renderer/stores/settings'
import { useIcon } from '@renderer/composables/useIcon'
import { useForm } from '@renderer/composables/useForm'
import { useModal } from '@renderer/composables/useModal'
import SettingFormContainer from '@renderer/components/SettingFormContainer.vue'
import Button from '@renderer/components/Button.vue'
import Switch from '@renderer/components/Switch.vue'

const { mcpServers } = storeToRefs(useSettingsStore())
const { Plus, Pencil, Trash } = useIcon(['Plus', 'Pencil', 'Trash'])
const { confirm } = useModal()

const openAddModal = () => {
    const initialData = {
        id: crypto.randomUUID(),
        name: '',
        command: '',
        args: [],
        env: {},
        active: true
    }

    const [FormComponent, formActions] = useForm({
        title: '添加 MCP 服务器',
        showHeader: false,
        initialData,
        fields: [
            {
                name: 'name',
                type: 'text',
                label: '服务器名称',
                placeholder: '例如：我的服务器',
                required: true
            },
            {
                name: 'command',
                type: 'text',
                label: '命令',
                placeholder: '例如：npx 或 python',
                required: true
            },
            {
                name: 'active',
                type: 'boolean',
                label: '启用服务器'
            }
        ],
        onSubmit: (data) => {
            mcpServers.value.push({ ...data })
        }
    })

    confirm({
        title: '添加 MCP 服务器',
        content: FormComponent
    }).then((result) => {
        if (result) {
            // 表单提交逻辑已在 useForm 的 onSubmit 中处理
        }
    })
}

const openEditModal = (server: McpServer) => {
    const initialData = { ...server }

    const [FormComponent, formActions] = useForm({
        title: '编辑 MCP 服务器',
        showHeader: false,
        initialData,
        fields: [
            {
                name: 'name',
                type: 'text',
                label: '服务器名称',
                placeholder: '例如：我的服务器',
                required: true
            },
            {
                name: 'command',
                type: 'text',
                label: '命令',
                placeholder: '例如：npx 或 python',
                required: true
            }
        ],
        onSubmit: (data) => {
            const index = mcpServers.value.findIndex(s => s.id === server.id)
            if (index !== -1) {
                mcpServers.value[index] = { ...data }
            }
        }
    })

    confirm({
        title: '编辑 MCP 服务器',
        content: FormComponent
    }).then((result) => {
        if (result) {
            // 表单提交逻辑已在 useForm 的 onSubmit 中处理
        }
    })
}

const handleDelete = (id: string) => {
    const index = mcpServers.value.findIndex(s => s.id === id)
    if (index !== -1) {
        mcpServers.value.splice(index, 1)
    }
}

const toggleActive = (server: McpServer) => {
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
                    <Button size="sm" @click="openAddModal">
                        <template #icon>
                            <Plus />
                        </template>
                        添加服务器
                    </Button>
                </div>

                <div class="server-list">
                    <div v-for="server in mcpServers" :key="server.id" class="server-card">
                        <div class="card-header">
                            <div class="server-info">
                                <div class="server-name">{{ server.name }}</div>
                                <div class="server-command">{{ server.command }}</div>
                            </div>
                            <div class="server-actions">
                                <Switch :model-value="server.active" @update:model-value="toggleActive(server)" />
                                <Button size="sm" variant="text" @click="openEditModal(server)">
                                    <template #icon>
                                        <Pencil />
                                    </template>
                                </Button>
                                <Button size="sm" variant="text" class="delete-btn" @click="handleDelete(server.id)">
                                    <template #icon>
                                        <Trash />
                                    </template>
                                </Button>
                            </div>
                        </div>
                        <div class="card-details">
                            <div v-if="server.args.length" class="detail-item">
                                <span class="label">参数:</span>
                                <span class="value">{{ server.args.join(' ') }}</span>
                            </div>
                            <div v-if="Object.keys(server.env).length" class="detail-item">
                                <span class="label">Env:</span>
                                <span class="value">{{ Object.keys(server.env).length }} 个变量</span>
                            </div>
                        </div>
                    </div>

                    <div v-if="mcpServers.length === 0" class="empty-state">
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
    margin-bottom: 12px;
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
