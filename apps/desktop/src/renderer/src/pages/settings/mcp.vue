<script setup lang="ts">
const { mcpServers } = storeToRefs(useSettingsStore())
const { Plus, Pencil, Trash, Refresh, Settings } = useIcon([
  'Plus',
  'Pencil',
  'Trash',
  'Refresh',
  'Settings'
])
const { confirm, remove } = useModal()

// 类型推断函数
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

const openJsonEditor = () => {
  const serversConfig = JSON.parse(JSON.stringify(mcpServers.value || {}))
  for (const key in serversConfig) {
    delete serversConfig[key].tools
    delete serversConfig[key].active
  }

  const initialData = {
    json: JSON.stringify({ mcpServers: serversConfig }, null, 2)
  }

  const [FormComponent, formActions] = useForm({
    title: '编辑 MCP JSON 配置',
    showHeader: false,
    initialData,
    fields: [
      {
        name: 'json',
        type: 'textarea',
        label: 'JSON 配置',
        placeholder:
          '请输入 JSON 配置，例如：\n{\n  "mcpServers": {\n    "context7": {\n      "command": "npx",\n      "args": ["-y", "@upstash/context7-mcp", "--api-key", "YOUR_API_KEY"]\n    }\n  }\n}',
        required: true,
        rows: 20
      }
    ]
  })

  confirm({
    title: '编辑 MCP JSON 配置',
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
                if (currentServers[key].tools) {
                  newServers[key].tools = currentServers[key].tools
                }
                if (currentServers[key].active !== undefined) {
                  newServers[key].active = currentServers[key].active
                }
              }
            }
            mcpServers.value = newServers
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

  // 初始化数据结构
  const initialData = server
    ? { ...server }
    : {
      command: '',
      args: [],
      env: {},
      name: '',
      active: true,
      transport: 'stdio' // 默认类型
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
      }
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
    width: '60%',
    onOk: async () => {
      if (formActions.submit()) remove()
    }
  })
}

const handleDelete = (name: string) => {
  delete mcpServers.value[name]
}

const activeMcpLoading = ref<string | null>(null)

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

</script>

<template>
  <FormContainer header-title="MCP 服务器">
    <template #content>
      <div class="mcp-container">
        <div class="mcp-header">
          <div class="header-actions">
            <Button size="sm" variant="secondary" @click="openJsonEditor()">
              <template #icon>
                <Settings />
              </template>
              编辑 JSON
            </Button>
            <Button size="sm" @click="openServerModal()">
              <template #icon>
                <Plus />
              </template>
              添加服务器
            </Button>
          </div>
        </div>
        <div class="server-list">
          <div
            v-for="(server, name) of mcpServers"
            :key="name"
            class="server-card"
          >
            <div class="card-header">
              <div class="server-info">
                <div class="server-name-row">
                  <div class="server-name">{{ name }}</div>
                  <div class="tool-count" v-if="server.tools?.length">
                    {{ server.tools.length }} 个工具
                  </div>
                  <div class="server-transport-tag">{{ server.transport }}</div>
                </div>

                <template v-if="server.transport === 'stdio'">
                  <div class="server-command">{{ server.command }}</div>
                </template>

                <template v-if="server.transport === 'http' || server.transport === 'sse'">
                  <div class="server-url">{{ server.url }}</div>
                </template>

                <div class="server-description" v-if="server.description">
                  {{ server.description }}
                </div>
              </div>

              <div class="server-actions">
                <Button size="sm" variant="text" @click="fetchTools(server)" :loading="activeMcpLoading === name"
                  v-if="server.active" title="刷新工具列表">
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
                <Button size="sm" variant="text" class="delete-btn" @click="handleDelete(name as string)">
                  <template #icon>
                    <Trash />
                  </template>
                </Button>
              </div>
            </div>
          </div>

          <div v-if="!mcpServers || Object.keys(mcpServers).length === 0" class="empty-state">
            尚未配置 MCP 服务器。点击"添加服务器"开始配置。
          </div>
        </div>
      </div>
    </template>
  </FormContainer>
</template>

<style scoped>
.mcp-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mcp-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.description {
  font-size: 13px;
  color: var(--text-secondary);
}

.header-actions {
  display: flex;
  gap: 8px;
  width: 100%;
  justify-content: space-between;
}

.server-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: stretch;
  gap: 10px;
}

.server-card {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  padding: 12px 14px;
  box-sizing: border-box;
  height: 88px;
  transition: all 0.2s;
  overflow: hidden;
}

.server-card:hover {
  border-color: var(--border-hover);
  background: var(--bg-hover);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  height: 100%;
}

.server-info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  flex: 1;
  overflow: hidden;
}

.server-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.server-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tool-count {
  font-size: 10px;
  background: var(--bg-active);
  color: var(--accent-color);
  padding: 1px 6px;
  border-radius: 10px;
  white-space: nowrap;
}

.server-transport-tag {
  font-size: 10px;
  text-transform: uppercase;
  background: var(--border-color-light);
  color: var(--text-secondary);
  padding: 1px 4px;
  border-radius: 3px;
  white-space: nowrap;
}

.server-description {
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.server-command,
.server-url {
  font-size: 11px;
  color: var(--text-tertiary);
  font-family: monospace;
  background: transparent;
  padding: 0;
  border-radius: 0;
  align-self: flex-start;
  margin-top: 0;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.server-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 0;
  flex-shrink: 0;
  padding-top: 0;
}

.server-actions :deep(.toggle-switch) {
  margin: 0 4px;
}

.delete-btn {
  color: var(--text-tertiary);
}

.delete-btn:hover {
  color: var(--color-danger);
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--text-tertiary);
  background: var(--bg-hover);
  border-radius: 8px;
  border: 1px dashed var(--border-subtle);
  font-size: 13px;
}

@media (max-width: 1100px) {
  .server-list {
    grid-template-columns: 1fr;
  }
}
</style>
