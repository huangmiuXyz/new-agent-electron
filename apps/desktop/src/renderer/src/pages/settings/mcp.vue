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

const serverEntries = computed(() => {
  const servers = mcpServers.value || {}
  const active: [string, any][] = []
  const inactive: [string, any][] = []
  for (const [name, server] of Object.entries(servers)) {
    if (server.active) {
      active.push([name, server])
    } else {
      inactive.push([name, server])
    }
  }
  return { active, inactive, total: active.length + inactive.length }
})

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
      <div class="mcp-container">
        <div class="mcp-header">
          <div class="header-title">
            <span class="header-count">{{ serverEntries.total }}</span>
            <span class="header-label">个服务器</span>
          </div>
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

        <!-- 已启用 -->
        <div v-if="serverEntries.active.length" class="section">
          <div class="section-label">已启用</div>
          <div class="list-group">
            <div
              v-for="([name, server], i) in serverEntries.active"
              :key="name"
              class="list-row"
              :class="{ 'list-row--last': i === serverEntries.active.length - 1 }"
            >
              <div class="icon-wrap">
                <div class="server-icon">
                  <Settings />
                </div>
                <span class="active-dot" />
              </div>
              <div class="info">
                <span class="name">{{ name }}</span>
                <span class="desc">{{ getServerDesc(server) }}</span>
              </div>
              <div class="actions">
                <Button
                  size="sm"
                  variant="text"
                  class="action-btn"
                  :loading="activeMcpLoading === name"
                  @click="fetchTools(server)"
                  title="刷新工具列表"
                >
                  <template #icon><Refresh /></template>
                </Button>
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
              </div>
            </div>
          </div>
        </div>

        <!-- 未启用 -->
        <div v-if="serverEntries.inactive.length" class="section">
          <div class="section-label">未启用</div>
          <div class="list-group">
            <div
              v-for="([name, server], i) in serverEntries.inactive"
              :key="name"
              class="list-row"
              :class="{ 'list-row--last': i === serverEntries.inactive.length - 1 }"
            >
              <div class="icon-wrap">
                <div class="server-icon server-icon--inactive">
                  <Settings />
                </div>
              </div>
              <div class="info">
                <span class="name name--inactive">{{ name }}</span>
                <span class="desc">{{ getServerDesc(server) }}</span>
              </div>
              <div class="actions">
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
              </div>
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-if="serverEntries.total === 0" class="empty-state">
          <div class="empty-icon"><Settings /></div>
          <div class="empty-title">尚未配置 MCP 服务器</div>
          <div class="empty-hint">点击"添加服务器"开始配置</div>
        </div>
      </div>
    </template>
  </FormContainer>
</template>

<style scoped>
.mcp-container {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 2px 2px 24px;
}

/* ===== 顶部 ===== */
.mcp-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-title {
  display: flex;
  align-items: baseline;
  gap: 4px;
  padding-left: 2px;
}

.header-count {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.header-label {
  font-size: 13px;
  color: var(--text-tertiary);
  font-weight: 400;
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

/* ===== 分组 ===== */
.section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding-left: 4px;
}

/* ===== list-group 圆角容器 ===== */
.list-group {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  overflow: hidden;
}

/* ===== 单行 ===== */
.list-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 12px;
  position: relative;
  transition: background-color 0.18s var(--motion-ease-standard);
}

.list-row:not(.list-row--last)::after {
  content: '';
  position: absolute;
  left: 52px;
  right: 0;
  bottom: 0;
  height: 1px;
  background: var(--border-subtle);
}

.list-row:active {
  background: var(--bg-hover);
}

/* ===== 图标 ===== */
.icon-wrap {
  flex-shrink: 0;
  position: relative;
}

.server-icon {
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

.server-icon :deep(svg) { font-size: 15px; }

.server-icon--inactive {
  color: var(--text-tertiary);
}

/* 活跃圆点 */
.active-dot {
  position: absolute;
  right: -1px;
  bottom: -1px;
  width: 8px;
  height: 8px;
  background: var(--color-success);
  border: 2px solid var(--bg-card);
  border-radius: 9999px;
  box-sizing: content-box;
}

/* ===== 信息区 ===== */
.info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1px;
  flex: 1;
  min-width: 0;
}

.name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.31;
  letter-spacing: -0.008em;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.name--inactive {
  color: var(--text-secondary);
  font-weight: 500;
}

.desc {
  font-size: 11px;
  font-weight: 400;
  color: var(--text-secondary);
  line-height: 1.36;
  letter-spacing: -0.003em;
  font-family: 'SF Mono', ui-monospace, monospace;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ===== 操作区 ===== */
.actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

/* 深度覆盖 Switch 外观更紧凑 */
.actions :deep(.toggle-switch) {
  margin: 0 4px;
  transform: scale(0.85);
}

.action-btn {
  color: var(--text-tertiary) !important;
  border-radius: 6px !important;
  transition: color 0.15s var(--motion-ease-standard),
    background-color 0.15s var(--motion-ease-standard),
    transform 0.1s var(--motion-ease-standard) !important;
}

.action-btn:hover {
  color: var(--text-primary) !important;
  background: var(--bg-hover) !important;
}

.action-btn:active { transform: scale(0.9); }
.delete-btn:hover { color: var(--color-danger) !important; }

/* ===== 空状态 ===== */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 56px 24px;
  background: var(--bg-tertiary);
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
}

.empty-icon {
  color: var(--text-tertiary);
  opacity: 0.3;
}

.empty-icon :deep(svg) { font-size: 36px; }

.empty-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  letter-spacing: -0.01em;
}

.empty-hint {
  font-size: 12px;
  color: var(--text-tertiary);
  font-weight: 400;
}
</style>