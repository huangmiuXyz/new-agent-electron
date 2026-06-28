<script setup lang="ts">
import { useSettingsStore } from '@renderer/stores/settings'
import { useAgentStore } from '@renderer/stores/agent'

const chatsStore = useChatsStores()
const settingsStore = useSettingsStore()
const agentStore = useAgentStore()

const updateChatMcpResources = (chatId: string, selectedMcpResources: Record<string, string[]>) => {
  const summary = chatsStore.chatSummaries.find((s) => s.id === chatId)
  if (!summary) return
  summary.selectedMcpResources = selectedMcpResources
}

const { mcpServers } = storeToRefs(settingsStore)
const DocumentIcon = useIcon('Document')

interface ResourceItem {
  uri: string
  name: string
  description?: string
  mimeType?: string
  serverName: string
  key: string
}

const isPopupOpen = ref(false)
const resources = ref<ResourceItem[]>([])
const loading = ref(false)
const errorMessage = ref('')
const selectedKeys = ref<Set<string>>(new Set())

const currentChat = computed(() => chatsStore.currentChat)

const resourceIcons: Record<string, string> = {
  'text/plain': '📄',
  'text/markdown': '📝',
  'text/html': '🌐',
  'application/json': '📋',
  'application/xml': '📋',
  'image/': '🖼️',
  'video/': '🎬',
  'audio/': '🎵',
  'application/pdf': '📕',
  'inode/directory': '📁'
}

const getResourceIcon = (mimeType?: string) => {
  if (!mimeType) return '📄'
  for (const [key, icon] of Object.entries(resourceIcons)) {
    if (mimeType.startsWith(key)) return icon
  }
  return '📄'
}

const loadResources = async () => {
  if (!currentChat.value) return
  const agentId = currentChat.value.agentId
  if (!agentId) return

  const mcpClient = agentStore.getMcpByAgent(agentId).mcpServers
  const activeServers = Object.keys(mcpClient).filter((key) => mcpClient[key]?.active !== false)
  if (activeServers.length === 0) {
    resources.value = []
    return
  }

  loading.value = true
  errorMessage.value = ''
  try {
    const allResources = await window.api.list_mcp_resources(JSON.parse(JSON.stringify(mcpClient)), false)
    resources.value = allResources
      .filter((r) => activeServers.includes(r.serverName))
      .map((r) => ({
        ...r,
        key: `${r.serverName}::${r.uri}`
      }))
  } catch (error) {
    errorMessage.value = (error as Error).message
  } finally {
    loading.value = false
  }
}

const groupedResources = computed(() => {
  const groups = new Map<string, ResourceItem[]>()
  resources.value.forEach((r) => {
    const list = groups.get(r.serverName) || []
    list.push(r)
    groups.set(r.serverName, list)
  })
  return groups
})

const totalSelected = computed(() => selectedKeys.value.size)

const toggleResource = (key: string) => {
  const next = new Set(selectedKeys.value)
  if (next.has(key)) {
    next.delete(key)
  } else {
    next.add(key)
  }
  selectedKeys.value = next
  applySelection()
}

const selectAllServer = (serverName: string, checked: boolean) => {
  const next = new Set(selectedKeys.value)
  const serverResources = groupedResources.value.get(serverName) || []
  serverResources.forEach((r) => {
    if (checked) {
      next.add(r.key)
    } else {
      next.delete(r.key)
    }
  })
  selectedKeys.value = next
  applySelection()
}

const serverSelectedCount = (serverName: string) => {
  const serverResources = groupedResources.value.get(serverName) || []
  return serverResources.filter((r) => selectedKeys.value.has(r.key)).length
}

const serverTotalCount = (serverName: string) => {
  return (groupedResources.value.get(serverName) || []).length
}

const serverAllSelected = (serverName: string) => {
  return serverSelectedCount(serverName) === serverTotalCount(serverName) && serverTotalCount(serverName) > 0
}

const applySelection = () => {
  if (!currentChat.value) return
  const selected: Record<string, string[]> = {}
  selectedKeys.value.forEach((key) => {
    const [serverName, ...uriParts] = key.split('::')
    const uri = uriParts.join('::')
    if (!selected[serverName]) selected[serverName] = []
    selected[serverName].push(uri)
  })
  updateChatMcpResources(currentChat.value.id, selected)
}

const restoreSelection = () => {
  selectedKeys.value = new Set()
  const saved = currentChat.value?.selectedMcpResources
  if (!saved) return
  Object.entries(saved).forEach(([serverName, uris]) => {
    uris.forEach((uri) => {
      selectedKeys.value.add(`${serverName}::${uri}`)
    })
  })
}

watch(isPopupOpen, async (val) => {
  if (val) {
    restoreSelection()
    await loadResources()
  }
})

const totalSelectedLabel = computed(() => {
  const count = totalSelected.value
  if (count === 0) return '引用资源'
  return `资源 (${count})`
})

const hasSelectedResources = computed(() => totalSelected.value > 0)
</script>

<template>
  <SelectorPopover v-model:visible="isPopupOpen" :data="resources" desktop-presentation="tray" width="420px"
    title="选择 MCP 资源" :show-search="false" no-results-text="该智能体关联的 MCP 服务器暂无可用资源"
    :has-results="resources.length > 0 || loading" tray-anchor=".input-container">
    <template #trigger>
      <Button variant="icon" size="sm" :class="{ 'resource-active': hasSelectedResources }" :title="totalSelectedLabel">
        <DocumentIcon />
      </Button>
    </template>

    <div class="resource-selector">
      <div v-if="loading" class="resource-loading">
        <Loading size="small" /> 加载资源中...
      </div>
      <div v-else-if="errorMessage" class="resource-error">
        {{ errorMessage }}
      </div>
      <div v-else-if="groupedResources.size === 0" class="resource-empty">
        暂无可用资源
      </div>
      <div v-else class="resource-groups">
        <div v-for="[serverName, items] in groupedResources" :key="serverName" class="resource-group">
          <div class="group-header">
            <div class="group-header-left">
              <Checkbox :model-value="serverAllSelected(serverName)"
                :indeterminate="serverSelectedCount(serverName) > 0 && !serverAllSelected(serverName)"
                @update:model-value="(v: boolean) => selectAllServer(serverName, v)" />
              <span class="group-server-name">{{ serverName }}</span>
            </div>
            <span class="group-count">{{ serverSelectedCount(serverName) }}/{{ serverTotalCount(serverName) }}</span>
          </div>
          <div class="resource-items">
            <div v-for="item in items" :key="item.key" class="resource-item"
              :class="{ selected: selectedKeys.has(item.key) }" @click="toggleResource(item.key)">
              <Checkbox :model-value="selectedKeys.has(item.key)" />
              <span class="resource-icon">{{ getResourceIcon(item.mimeType) }}</span>
              <div class="resource-body">
                <span class="resource-name">{{ item.name }}</span>
                <span v-if="item.description" class="resource-desc">{{ item.description }}</span>
              </div>
              <span v-if="item.mimeType" class="resource-mime">{{ item.mimeType }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </SelectorPopover>
</template>

<style scoped>
.resource-selector {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 150px;
}

.resource-loading,
.resource-error,
.resource-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  font-size: 12px;
  color: var(--text-tertiary);
  gap: 8px;
}

.resource-error {
  color: var(--color-danger);
}

.resource-groups {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 360px;
  overflow-y: auto;
}

.resource-group {
  background: var(--bg-hover);
  border-radius: 8px;
  overflow: hidden;
}

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-active);
  border-bottom: 1px solid var(--border-subtle);
}

.group-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.group-server-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-count {
  font-size: 10px;
  color: var(--text-tertiary);
  font-weight: 500;
}

.resource-items {
  display: flex;
  flex-direction: column;
}

.resource-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  cursor: pointer;
  transition: background-color 0.12s ease;
  border-bottom: 1px solid var(--border-subtle);
}

.resource-item:last-child {
  border-bottom: none;
}

.resource-item:hover {
  background: var(--bg-hover);
}

.resource-item.selected {
  background: rgba(var(--accent-rgb, 47, 116, 255), 0.05);
}

.resource-icon {
  font-size: 14px;
  flex-shrink: 0;
  width: 18px;
  text-align: center;
}

.resource-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.resource-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resource-desc {
  font-size: 10px;
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resource-mime {
  font-size: 10px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

</style>
