<script setup lang="ts">
import { useContextMenu, type MenuItem } from '@renderer/composables/useContextMenu'
const { mcpServers } = storeToRefs(useSettingsStore())
const { Plus, Pencil, Trash, Refresh, Settings, FileCode } = useIcon([
  'Plus',
  'Pencil',
  'Trash',
  'Refresh',
  'Settings',
  'FileCode'
])
const { confirm, remove } = useModal()
const { showContextMenu } = useContextMenu()

const inferServerConfig = (serverName: string, serverConfig: any) => {
  const inferredConfig = { ...serverConfig }
  if (!inferredConfig.transport) {
    if (inferredConfig.command) {
      inferredConfig.transport = 'stdio'
    } else if (inferredConfig.url) {
      inferredConfig.transport =
        inferredConfig.url.includes('/sse') || inferredConfig.url.includes('/events')
          ? 'sse'
          : 'http'
    }
  }
  inferredConfig.name = serverName
  if (inferredConfig.active === undefined) {
    inferredConfig.active = false
  }
  return inferredConfig
}

const openJsonImport = () => {
  const initialData = { json: '' }

  const [FormComponent, formActions] = useForm({
    title: 'JSON 添加 MCP 服务器',
    showHeader: false,
    initialData,
    fields: [
      {
        name: 'json',
        type: 'textarea',
        label: 'JSON 配置',
        placeholder:
          '{\n  "mcpServers": {\n    "godot": {\n      "name": "godot",\n      "description": "",\n      "transport": "stdio",\n      "command": "npx",\n      "args": ["@coding-solo/godot-mcp"],\n      "env": {}\n    }\n  }\n}',
        required: true,
        rows: 20
      }
    ]
  })

  confirm({
    title: 'JSON 添加 MCP 服务器',
    content: FormComponent,
    maxHeight: '90vh',
    width: '60%',
    onOk: async () => {
      if (formActions.submit()) {
        const data = formActions.getData()
        try {
          const parsed = JSON.parse(data.json)
          if (parsed && parsed.mcpServers && typeof parsed.mcpServers === 'object') {
            const newServers = parsed.mcpServers
            const currentServers = mcpServers.value || {}
            for (const key in newServers) {
              newServers[key] = inferServerConfig(key, newServers[key])
              if (currentServers[key]) {
                newServers[key].tools = currentServers[key].tools
                newServers[key].active = currentServers[key].active
              }
            }
            mcpServers.value = { ...currentServers, ...newServers }
            remove()
          } else {
            messageApi.error('JSON 格式错误: 缺少 mcpServers 字段')
          }
        } catch (e) {
          messageApi.error('JSON 解析失败: ' + (e as Error).message)
        }
      }
    }
  })
}

const openServerModal = async (server?: any) => {
  const isEdit = !!server
  const modalTitle = isEdit ? '编辑 MCP 服务器' : '添加 MCP 服务器'

  const initialData = server
    ? { ...server }
    : {
      command: '',
      args: [],
      env: {},
      name: '',
      active: true,
      transport: 'stdio'
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
        placeholder: '描述'
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
      {
        name: 'headers',
        type: 'object',
        label: '请求头',
        keyPlaceholder: '键',
        valuePlaceholder: '值',
        ifShow: (data) => data.transport === 'sse' || data.transport === 'http'
      }
    ],
    onSubmit: (data) => {
      mcpServers.value[data.name!] = data
    }
  })

  confirm({
    title: modalTitle,
    content: FormComponent,
    maxHeight: '70vh',
    width: '60%',
    onOk: async () => {
      if (formActions.submit()) remove()
    }
  })
}

const handleAddServerMenu = (event: MouseEvent) => {
  const items: MenuItem[] = [
    {
      label: 'JSON 添加',
      icon: FileCode,
      onClick: () => openJsonImport()
    },
    {
      label: '手动添加',
      icon: Plus,
      onClick: () => openServerModal()
    }
  ]
  showContextMenu(event, items)
}

const handleDelete = (name: string) => {
  delete mcpServers.value[name]
}

const activeMcpLoading = ref<string | null>(null)
const activeMcpResourcesLoading = ref<string | null>(null)

const fetchTools = async (server: ClientConfig[string]) => {
  activeMcpLoading.value = server.name
  try {
    const tools = await chatService().list_tools(
      {
        [server.name]: JSON.parse(JSON.stringify(server))
      },
      false
    )
    server.tools = tools
    // 同时刷新资源缓存
    await fetchResources(server)
  } catch (error) {
    messageApi.error((error as Error).message)
  } finally {
    activeMcpLoading.value = ''
  }
}

const activateServer = async (server: any) => {
  server.active = true
  await fetchTools(server)
}

const fetchResources = async (server: any) => {
  activeMcpResourcesLoading.value = server.name
  try {
    const settingsStore = useSettingsStore()
    const allActiveServers = Object.fromEntries(
      Object.entries(mcpServers.value || {}).filter(
        ([, s]) => s.active || s.name === server.name
      )
    )
    const allContents = await window.api.cache_all_mcp_resources(
      JSON.parse(JSON.stringify(allActiveServers))
    )
    for (const [key, content] of Object.entries(allContents)) {
      const sep = key.indexOf('::')
      if (sep === -1) continue
      settingsStore.setMcpResourceCache(key.slice(0, sep), key.slice(sep + 2), content)
    }
  } catch (error) {
    messageApi.error((error as Error).message)
  } finally {
    activeMcpResourcesLoading.value = ''
  }
}

const toggleActive = async (server: any) => {
  if (!server.active) {
    await activateServer(server)
  } else {
    server.active = false
  }
}

const serverEntries = computed(() => {
  const servers = mcpServers.value || {}
  const active: [string, any][] = []
  const inactive: [string, any][] = []
  for (const [name, server] of Object.entries(servers)) {
    if (!matchesServer(name, server)) continue
    if (server.active) {
      active.push([name, server])
    } else {
      inactive.push([name, server])
    }
  }
  return { active, inactive, total: active.length + inactive.length }
})

const searchQuery = ref('')

const query = computed(() => searchQuery.value.toLowerCase().trim())

const matchesServer = (name: string, server: any) => {
  if (!query.value) return true
  const desc = server.description || server.command || server.url || server.transport || ''
  return (
    name.toLowerCase().includes(query.value) ||
    desc.toLowerCase().includes(query.value)
  )
}

const getServerDesc = (server: any) => {
  const parts: string[] = []
  if (server.transport === 'stdio' && server.command) {
    parts.push(server.command)
  } else if ((server.transport === 'http' || server.transport === 'sse') && server.url) {
    parts.push(server.url)
  } else {
    parts.push(server.transport || 'stdio')
  }
  if (server.tools?.length) {
    parts.push(`· ${server.tools.length} 工具`)
  }
  return parts.join('  ')
}
</script>

<template>
  <FormContainer header-title="MCP 服务器">
    <template #content>
      <div class="mcp-wrap">
        <SettingsList
          :count="serverEntries.total"
          count-label="个服务器"
          :search-term="searchQuery"
          :show-search="serverEntries.total > 0 || !!searchQuery"
          search-placeholder="搜索服务器"
          @update:search-term="searchQuery = $event"
        >
        <template #actions>
          <Button size="sm" @click="handleAddServerMenu">
            <template #icon><Plus /></template>
            添加服务器
          </Button>
        </template>
        <ContextMenu />

        <SettingsGroup v-if="serverEntries.active.length" label="已启用">
          <SettingsRow
            v-for="([name, server], i) in serverEntries.active"
            :key="name"
            :name="name"
            :desc="getServerDesc(server)"
            mono
            dot
            dot-color="var(--color-success)"
          >
            <template #icon>
              <div class="srv-icon"><Settings /></div>
            </template>
            <template #actions>
              <Button
                size="sm" variant="text" class="action-btn"
                :loading="activeMcpLoading === name"
                @click="fetchTools(server)"
                title="刷新工具列表"
              >
                <template #icon><Refresh /></template>
              </Button>
              <Switch
                :loading="activeMcpLoading === name || activeMcpResourcesLoading === name"
                :model-value="server.active"
                @update:model-value="toggleActive(server)"
              />
              <Button size="sm" variant="text" class="action-btn" @click="openServerModal(server)" title="编辑">
                <template #icon><Pencil /></template>
              </Button>
              <Button size="sm" variant="text" class="action-btn delete-btn" @click="handleDelete(name)" title="删除">
                <template #icon><Trash /></template>
              </Button>
            </template>
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup v-if="serverEntries.inactive.length" label="未启用">
          <SettingsRow
            v-for="([name, server], i) in serverEntries.inactive"
            :key="name"
            :name="name"
            :desc="getServerDesc(server)"
            mono
            muted
          >
            <template #icon>
              <div class="srv-icon srv-icon--dim"><Settings /></div>
            </template>
            <template #actions>
              <Switch
                :loading="activeMcpLoading === name"
                :model-value="server.active"
                @update:model-value="toggleActive(server)"
              />
              <Button size="sm" variant="text" class="action-btn" @click="openServerModal(server)" title="编辑">
                <template #icon><Pencil /></template>
              </Button>
              <Button size="sm" variant="text" class="action-btn delete-btn" @click="handleDelete(name)" title="删除">
                <template #icon><Trash /></template>
              </Button>
            </template>
          </SettingsRow>
        </SettingsGroup>

        <template #empty>
          <div class="empty-icon"><Settings /></div>
          <div class="empty-title">{{ query ? '没有匹配的服务器' : '尚未配置 MCP 服务器' }}</div>
          <div class="empty-hint">{{ query ? '试试其他关键词' : '点击"添加服务器"开始配置' }}</div>
        </template>
      </SettingsList>
      </div>
    </template>
  </FormContainer>
</template>

<style scoped>
.srv-icon {
  width: 32px;
  height: 32px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--bg-hover), var(--bg-tertiary));
  color: var(--color-primary);
  border: 1px solid var(--border-subtle);
}

.srv-icon :deep(svg) { font-size: 15px; }

.srv-icon--dim {
  color: var(--text-tertiary);
}

.mcp-wrap {
  width: 70%;
  margin: 0 auto;
}

.mcp-wrap :deep(.toggle-switch) {
  margin: 0 4px;
  transform: scale(0.85);
}
</style>