<script setup lang="ts">
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useSettingsStore } from '@renderer/stores/settings'
import { useIcon } from '@renderer/composables/useIcon'
import SettingFormContainer from '@renderer/components/SettingFormContainer.vue'
import Button from '@renderer/components/Button.vue'
import Switch from '@renderer/components/Switch.vue'
import BaseModal from '@renderer/components/BaseModal.vue'
import McpServerEdit from '@renderer/components/McpServerEdit.vue'

const { mcpServers } = storeToRefs(useSettingsStore())
const { Plus, Pencil, Trash } = useIcon(['Plus', 'Pencil', 'Trash'])

const showModal = ref(false)
const isEditing = ref(false)
const currentServer = ref<McpServer>({
    id: '',
    name: '',
    command: '',
    args: [],
    env: {},
    active: true
})

const openAddModal = () => {
    currentServer.value = {
        id: crypto.randomUUID(),
        name: '',
        command: '',
        args: [],
        env: {},
        active: true
    }
    isEditing.value = false
    showModal.value = true
}

const openEditModal = (server: McpServer) => {
    currentServer.value = JSON.parse(JSON.stringify(server))
    isEditing.value = true
    showModal.value = true
}

const handleSave = () => {
    if (!currentServer.value.name || !currentServer.value.command) {
        // Basic validation
        return
    }

    if (isEditing.value) {
        const index = mcpServers.value.findIndex(s => s.id === currentServer.value.id)
        if (index !== -1) {
            mcpServers.value[index] = { ...currentServer.value }
        }
    } else {
        mcpServers.value.push({ ...currentServer.value })
    }
    showModal.value = false
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
    <SettingFormContainer header-title="MCP Servers">
        <template #content>
            <div class="mcp-container">
                <div class="mcp-header">
                    <div class="description">
                        Configure Model Context Protocol (MCP) servers to extend capabilities.
                    </div>
                    <Button size="sm" @click="openAddModal">
                        <template #icon>
                            <Plus />
                        </template>
                        Add Server
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
                                <span class="label">Args:</span>
                                <span class="value">{{ server.args.join(' ') }}</span>
                            </div>
                            <div v-if="Object.keys(server.env).length" class="detail-item">
                                <span class="label">Env:</span>
                                <span class="value">{{ Object.keys(server.env).length }} variables</span>
                            </div>
                        </div>
                    </div>

                    <div v-if="mcpServers.length === 0" class="empty-state">
                        No MCP servers configured. Click "Add Server" to get started.
                    </div>
                </div>
            </div>
        </template>
    </SettingFormContainer>

    <BaseModal v-if="showModal" :title="isEditing ? 'Edit MCP Server' : 'Add MCP Server'" :visible="showModal"
        @resolve="(val) => val ? handleSave() : (showModal = false)">
        <McpServerEdit v-model="currentServer" />
    </BaseModal>
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
