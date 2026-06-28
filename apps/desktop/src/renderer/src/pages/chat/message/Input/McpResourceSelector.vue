<script setup lang="ts">
import { useAgentStore } from '@renderer/stores/agent'

const chatsStore = useChatsStores()
const agentStore = useAgentStore()

const updateChatMcpResources = (chatId: string, selectedMcpResources: Record<string, string[]>) => {
  const summary = chatsStore.chatSummaries.find((s) => s.id === chatId)
  if (!summary) return
  summary.selectedMcpResources = selectedMcpResources
}

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
  <SelectorPopover v-model:visible="isPopupOpen" desktop-presentation="tray" title="选择 MCP 资源"
    tray-anchor=".input-container">
    <template #trigger>
      <Button variant="icon" size="sm" :class="{ 'resource-active': hasSelectedResources }" :title="totalSelectedLabel">
        <DocumentIcon />
      </Button>
    </template>
    <template #content>
      <div v-if="loading" class="resource-status">
        <Loading size="small" /> 加载资源中...
      </div>
      <div v-else-if="errorMessage" class="resource-status resource-error">
        {{ errorMessage }}
      </div>
      <div v-else>
        <SettingsList v-if="groupedResources.size">
          <SettingsGroup v-for="[serverName, items] in groupedResources" :key="serverName" :label="serverName">
            <div class="rg-bar">
              <Checkbox :model-value="serverAllSelected(serverName)"
                :indeterminate="serverSelectedCount(serverName) > 0 && !serverAllSelected(serverName)"
                @update:model-value="(v: boolean) => selectAllServer(serverName, v)" />
              <span class="rg-count">{{ serverSelectedCount(serverName) }}/{{ serverTotalCount(serverName) }}</span>
            </div>
            <SettingsRow
              v-for="item in items"
              :key="item.key"
              :name="item.name"
              :desc="item.description || item.mimeType || ''"
              clickable
              :class="{ 'sr--selected': selectedKeys.has(item.key) }"
              @click="toggleResource(item.key)"
            >
              <template #icon>
                <span class="resource-emoji">{{ getResourceIcon(item.mimeType) }}</span>
              </template>
              <template #actions>
                <Checkbox :model-value="selectedKeys.has(item.key)" @update:model-value="toggleResource(item.key)" />
              </template>
            </SettingsRow>
          </SettingsGroup>
        </SettingsList>
        <div v-else class="resource-status">暂无可用资源</div>
      </div>
    </template>
  </SelectorPopover>
</template>

<style scoped>
.resource-status {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  font-size: 12px;
  color: var(--text-tertiary);
  gap: 8px;
  min-height: 120px;
}

.resource-error {
  color: var(--color-danger);
}

.resource-emoji {
  font-size: 15px;
  line-height: 1;
}

.rg-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-subtle);
}

.rg-count {
  font-size: 10px;
  color: var(--text-tertiary);
  font-weight: 500;
  margin-left: auto;
}

.sr--selected {
  background: rgba(var(--accent-rgb, 47, 116, 255), 0.06);
}

.sr--selected:hover {
  background: rgba(var(--accent-rgb, 47, 116, 255), 0.1);
}
</style>
