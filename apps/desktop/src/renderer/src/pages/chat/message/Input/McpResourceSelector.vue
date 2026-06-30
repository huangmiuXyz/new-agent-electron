<script setup lang="ts">
import { useIncremark } from '@incremark/vue'
import IncremarkRenderer from '@renderer/components/IncremarkRenderer.vue'
import { defineComponent, h } from 'vue'

const settingsStore = useSettingsStore()
const chatsStore = useChatsStores()

const updateChatMcpResources = (chatId: string, selectedMcpResources: Record<string, string[]>) => {
  const summary = chatsStore.chatSummaries.find((s) => s.id === chatId)
  if (!summary) return
  summary.selectedMcpResources = selectedMcpResources
}

const { Document: DocumentIcon, Eye: EyeIcon } = useIcon(['Document', 'Eye'])

interface ResourceItem {
  uri: string
  name: string
  description?: string
  mimeType?: string
  serverName: string
  key: string
  size?: number
  title?: string
}

const isPopupOpen = ref(false)
const resources = ref<ResourceItem[]>([])
const errorMessage = ref('')
const loading = ref(false)
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

const loadResources = () => {
  if (!currentChat.value) return
  const agentId = currentChat.value.agentId
  if (!agentId) return

  const cache = settingsStore.mcpResourceCache
  errorMessage.value = ''
  const items: ResourceItem[] = []
  for (const [serverName, uris] of Object.entries(cache)) {
    for (const [uri, value] of Object.entries(uris)) {
      // 兼容旧持久化格式（ReadResourceResult vs {content, name, ...}）
      const hasMeta = 'content' in value
      const shortUri = uri.replace(/^[a-z]+:\/\//, '')
      items.push({
        uri,
        name: hasMeta ? (value.title || value.name || shortUri) : shortUri,
        description: hasMeta ? [value.description, value.mimeType].filter(Boolean).join(' · ') : value.mimeType || '',
        mimeType: hasMeta ? value.mimeType : value.mimeType,
        serverName,
        key: `${serverName}::${uri}`,
        size: hasMeta ? value.size : undefined,
        title: hasMeta ? value.title : undefined,
      })
    }
  }
  resources.value = items
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

watch(isPopupOpen, (val) => {
  if (val) {
    restoreSelection()
    loadResources()
  }
})

const totalSelectedLabel = computed(() => {
  const count = totalSelected.value
  if (count === 0) return '引用资源'
  return `资源 (${count})`
})

const hasSelectedResources = computed(() => totalSelected.value > 0)

const formatSize = (bytes?: number) => {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const PreviewContent = defineComponent({
  props: { text: { type: String, default: '' } },
  setup(props) {
    const incremark = useIncremark({ gfm: true })
    watch(() => props.text, (text) => {
      incremark.reset()
      if (text) {
        incremark.append(text)
        incremark.finalize()
      }
    }, { immediate: true })
    return () => h(IncremarkRenderer, { blocks: incremark.blocks.value, style: 'padding:16px;max-height:60vh;overflow:auto' })
  }
})

const openPreview = (item: ResourceItem) => {
  const cached = settingsStore.mcpResourceCache?.[item.serverName]?.[item.uri]
  if (!cached) return
  const parts = cached.content?.contents || []
  const texts = parts.filter((c: any) => c.text).map((c: any) => c.text)
  const blobs = parts.filter((c: any) => c.blob)
  const content = texts.length > 0
    ? texts.join('\n\n---\n\n')
    : blobs.length > 0
      ? '```\n[二进制内容，MIME: ' + (item.mimeType || '未知') + '，大小: ' + formatSize(item.size) + ']\n```'
      : '_(无内容)_'
  useModal().confirm({
    title: item.name,
    width: '60%',
    maxHeight: '80vh',
    showFooter: false,
    content: () => h(PreviewContent, { text: content })
  })
}
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
      <div v-if="errorMessage" class="resource-status resource-error">
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
              :desc="item.description || ''"
              :desc2="formatSize(item.size)"
              clickable
              :class="{ 'sr--selected': selectedKeys.has(item.key) }"
              @click="toggleResource(item.key)"
            >
              <template #icon>
                <span class="resource-emoji">{{ getResourceIcon(item.mimeType) }}</span>
              </template>
              <template #actions>
                <Button size="sm" variant="text" class="action-btn" @click.stop="openPreview(item)" title="预览内容">
                  <template #icon><EyeIcon /></template>
                </Button>
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

.action-btn {
  opacity: 0;
  transition: opacity 0.15s;
}
.sr--selected .action-btn,
.settings-row:hover .action-btn {
  opacity: 1;
}
</style>
