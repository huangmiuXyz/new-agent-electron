<script setup lang="tsx">
import { useIncremark } from '@incremark/vue'
import IncremarkRenderer from '@renderer/components/IncremarkRenderer.vue'
import { FormItem } from '@renderer/composables/useForm'
const incremark = useIncremark({
  gfm: true
})

const { blocks } = incremark
const { Plugin: PluginIcon, Refresh, Check, Dismiss, Play, Download } = useIcon([
  'Plugin',
  'Refresh',
  'Check',
  'Dismiss',
  'Play',
  'Download'
])
// 使用 usePlugins composable
const { confirm, remove } = useModal()
const {
  allPlugins,
  loading,
  activePluginId,
  activePlugin,
  addPlugin,
  refreshPlugins,
  loadPlugin,
  unloadPlugin,
  uninstallPlugin,
  executeCommand,
  getStatusText,
  getStatusColor,
  getPluginCommands,
  getPluginHooks,
  getPluginBuiltinTools,
  getPluginRegistries,
  getPluginProviders,
  getPluginSettingsForm,
  selectPlugin,
  togglePluginNotification,
  isPluginNotificationDisabled,
  clearPluginData
} = usePlugins()

// 插件设置表单
const [SettingsForm, settingsFormActions] = useForm({
  fields: [
    {
      name: 'notificationDisabled',
      type: 'boolean',
      label: '禁用插件通知',
      hint: '开启后，该插件将不再显示任何弹窗'
    }
  ],
  onChange: (field, value) => {
    if (field === 'notificationDisabled' && activePlugin.value) {
      togglePluginNotification(activePlugin.value.name, value as boolean)
    }
  }
})

// 标签页配置
const activeTab = ref('readme')
const tabItems = computed(() => {
  const items = [
    { id: 'readme', name: '文档' },
    { id: 'capabilities', name: '能力' },
    { id: 'settings', name: '设置' }
  ]
  return items
})

// 当激活插件改变时，更新表单数据
watch(
  activePlugin,
  (plugin) => {
    if (plugin) {
      settingsFormActions.setFieldsValue({
        notificationDisabled: isPluginNotificationDisabled(plugin.name)
      })
      incremark.render(plugin.readme ?? '')
      providerTableActions.setData(getPluginProviders(plugin.name))
      commandTableActions.setData(getPluginCommands(plugin.name))
      registryTableActions.setData(getPluginRegistries(plugin.id).map((name) => ({ name })))
    }
  },
  { immediate: true }
)

// 当插件 ID 改变时，重置标签页
watch(activePluginId, () => {
  activeTab.value = 'readme'
})

// 获取状态图标
const getStatusIcon = (status: PluginStatus) => {
  if (status === 'loaded') return Check
  if (status === 'loading') return Refresh
  if (status === 'error') return Dismiss
  return null
}

// 初始化
onMounted(async () => {
  // 刷新插件列表
  await refreshPlugins()
  // 默认选中第一个插件
  watch(allPlugins, (newPlugins) => {
    if (newPlugins.length > 0 && !activePluginId.value) {
      activePluginId.value = newPlugins[0].id
    }
  }, { immediate: true })
})

// 移动端路由处理
import { useRouter, useRoute } from 'vue-router'
import { providerFactories } from '@renderer/services/chatService/registry'
const router = useRouter()
const route = useRoute()

const isDetailResult = computed(() => {
  return !!route.params.id || !!route.query.pluginId
})

const handleSelectPlugin = (pluginId: string) => {
  selectPlugin(pluginId)
  if (isMobile.value) {
    router.push({
      path: '/mobile/settings/plugins',
      query: {
        name: activePlugin.value?.name || '插件管理',
        pluginId
      }
    })
  }
}

const showList = computed(() => !isMobile.value || !isDetailResult.value)
const showForm = computed(() => !isMobile.value || isDetailResult.value)
const activePluginSettingsForm = computed(() =>
  activePlugin.value?.type === 'loaded'
    ? getPluginSettingsForm(activePlugin.value.name)
    : undefined
)

watch(
  () => route.query.pluginId,
  (pluginId) => {
    if (typeof pluginId === 'string' && pluginId) {
      selectPlugin(pluginId)
    }
  },
  { immediate: true }
)

// 插件命令表
const [CommandTable, commandTableActions] = useTable<{ name: string; description?: string }>({
  columns: [
    { key: 'name', label: '命令名称', width: '2fr' },
    {
      key: 'description',
      label: '描述',
      width: '2fr',
      render: (row) => row.description || '暂无描述'
    },
    {
      key: 'actions',
      label: '操作',
      width: '1fr',
      render: (row) => (
        <Button size="sm" variant="text" onClick={() => executeCommand(row.name)}>
          {{
            icon: () => Play
          }}
          执行
        </Button>
      )
    }
  ]
})

// 模型提供商表
const [ProviderTable, providerTableActions] = useTable<Provider>({
  columns: [
    { key: 'name', label: '提供商名称', width: '2fr' },
    { key: 'id', label: 'ID', width: '2fr' },
    {
      key: 'models',
      label: '模型数量',
      width: '1fr',
      render: (row) => row.models?.length || 0
    }
  ]
})

// 模型注册表
const getRegistryCapabilities = (name: string) => {
  const factory = providerFactories[name]
  if (!factory) return []
  try {
    const options = { apiKey: 'dummy', baseURL: 'http://dummy', name: 'dummy' }
    const provider = factory(options) as any
    const baseProvider = providerFactories['openai-compatible']?.(options) as any

    const keys = new Set<string>()
    Object.keys(provider).forEach((k) => keys.add(k))
    Object.getOwnPropertyNames(provider).forEach((k) => keys.add(k))

    const baseKeys = new Set<string>()
    if (baseProvider) {
      Object.keys(baseProvider).forEach((k) => baseKeys.add(k))
      Object.getOwnPropertyNames(baseProvider).forEach((k) => baseKeys.add(k))
    }

    return Array.from(keys).filter((key) => {
      if (!baseKeys.has(key)) return true

      const v1 = provider[key]
      const v2 = baseProvider[key]

      if (typeof v1 === 'function' && typeof v2 === 'function') {
        return v1.toString() !== v2.toString()
      }

      return v1 !== v2
    })
  } catch (e) {
    return []
  }
}

const [RegistryTable, registryTableActions] = useTable<{ name: string }>({
  columns: [
    {
      key: 'name',
      label: '注册名称',
      width: '1fr'
    },
    {
      key: 'capabilities',
      label: '注册能力',
      width: '2fr',
      render: (row) => (
        <Tags tags={getRegistryCapabilities(row.name)} color="gray" />
      )
    }
  ]
})

// 卸载插件（从内存中移除）
const handleUnloadPlugin = async (pluginName: string) => {
  try {
    await unloadPlugin(pluginName)
    messageApi.success('插件已停用')
  } catch (err) {
    messageApi.error(`停用失败: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// 完全卸载插件（从内存和文件系统中移除）
const handleUninstallPlugin = async (pluginName: string) => {
  const confirmed = await confirm({
    title: '卸载插件',
    content: `确定要完全卸载插件 "${pluginName}" 吗？\n\n此操作将从内存和文件系统中删除该插件的所有文件。`
  })
  if (!confirmed) {
    return
  }

  try {
    await uninstallPlugin(pluginName)
    messageApi.success('插件已完全卸载')
  } catch (err) {
    messageApi.error(`卸载失败: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    remove()
  }
}
</script>

<template>
  <!-- 列表视图 -->
  <ListContainer v-if="showList">
    <List title="插件" :items="allPlugins" :active-id="activePluginId" :loading="loading" key-field="id" main-field="name"
      sub-field="description" :logo-field="'PluginIcon'" @select="handleSelectPlugin">
      <template #title-tool>
        <Button @click="addPlugin" size="sm" type="button" variant="text">
          <template #icon>
            <Download />
          </template>
          添加插件
        </Button>
      </template>
      <template #main="{ item }">
        {{ item.name }}
      </template>
      <template #actions="{ item }">
        <component v-if="getStatusIcon(item.status)" :is="getStatusIcon(item.status)" class="status-icon"
          :style="{ color: getStatusColor(item.status) }" />
      </template>
    </List>
  </ListContainer>

  <!-- 表单视图 -->
  <FormContainer v-if="showForm" header-title="插件管理">
    <template #content>
      <template v-if="activePlugin">
        <!-- 插件基本信息 -->
        <FormItem label="插件信息">
          <Card padding="16px">
            <div class="info-header">
              <div class="info-title">
                <div class="title-with-badge">
                  <h2>{{ activePlugin.name }}</h2>
                  <div v-if="activePlugin.isDev" class="dev-badge">DEV</div>
                </div>
                <div class="status-badge" :style="{ color: getStatusColor(activePlugin.status) }">
                  <component v-if="getStatusIcon(activePlugin.status)" :is="getStatusIcon(activePlugin.status)" />
                  {{ getStatusText(activePlugin.status) }}
                </div>
              </div>
              <div class="info-actions">
                <Button v-if="activePlugin.type === 'loaded'" variant="text" size="sm"
                  @click="handleUnloadPlugin(activePlugin.id)">
                  停用
                </Button>
                <Button v-if="activePlugin.type === 'loaded' || activePlugin.type === 'available'" variant="text" size="sm"
                  @click="handleUninstallPlugin(activePlugin.id)">
                  卸载
                </Button>
                <Button v-if="activePlugin.type === 'loaded'" size="sm" danger
                  @click="clearPluginData(activePlugin.id)" variant="text">
                  清除缓存
                </Button>
                <Button v-if="activePlugin.type === 'available' && activePlugin.path" size="sm"
                  @click="loadPlugin(activePlugin.path)">
                  <template #icon>
                    <Play />
                  </template>
                  加载
                </Button>
              </div>
            </div>
            <div class="info-body">
              <div class="info-row">
                <span class="info-label">描述:</span>
                <span class="info-value">{{ activePlugin.description || '暂无描述' }}</span>
              </div>
              <div class="info-row">
                <span class="info-label">版本:</span>
                <span class="info-value">{{ activePlugin.version }}</span>
              </div>
              <div v-if="activePlugin.updatedAt" class="info-row">
                <span class="info-label">更新时间:</span>
                <span class="info-value">{{ activePlugin.updatedAt }}</span>
              </div>
              <div v-if="activePlugin.error" class="info-row">
                <span class="info-label error-label">错误:</span>
                <span class="info-value error-value">{{ activePlugin.error }}</span>
              </div>
            </div>
          </Card>
        </FormItem>

        <!-- 标签页 -->
        <div class="plugin-tabs-container">
          <Tabs v-model="activeTab" :items="tabItems" />
        </div>

        <!-- 标签页内容 -->
        <div class="tab-content">
          <!-- 文档 (README) -->
          <div v-if="activeTab === 'readme'" class="tab-pane">
            <FormItem v-if="activePlugin.readme" label="插件介绍">
              <Card padding="16px">
                <IncremarkRenderer :blocks="blocks" />
              </Card>
            </FormItem>
            <div v-else class="empty-tab-content">
              暂无文档信息
            </div>
          </div>

          <!-- 能力 (Capabilities) -->
          <div v-if="activeTab === 'capabilities'" class="tab-pane">
            <div v-if="activePlugin.type === 'loaded'">
              <!-- 插件命令 -->
              <FormItem v-if="getPluginCommands(activePlugin.name).length > 0" label="可用命令">
                <CommandTable />
              </FormItem>

              <!-- 注册钩子 -->
              <FormItem v-if="getPluginHooks(activePlugin.name).length > 0" label="注册钩子">
                <Tags :tags="getPluginHooks(activePlugin.name)" color="purple" />
              </FormItem>

              <!-- 内置工具 -->
              <FormItem v-if="getPluginBuiltinTools(activePlugin.name).length > 0" label="内置工具">
                <Tags :tags="getPluginBuiltinTools(activePlugin.name)" color="cyan" />
              </FormItem>

              <!-- 模型提供商 -->
              <FormItem v-if="getPluginProviders(activePlugin.name).length > 0" label="模型提供商">
                <ProviderTable />
              </FormItem>

              <!-- 模型注册 -->
              <FormItem v-if="getPluginRegistries(activePlugin.id).length > 0" label="模型注册 (Registry)">
                <RegistryTable />
              </FormItem>

              <div
                v-if="getPluginCommands(activePlugin.name).length === 0 && getPluginHooks(activePlugin.name).length === 0 && getPluginBuiltinTools(activePlugin.name).length === 0 && getPluginProviders(activePlugin.name).length === 0 && getPluginRegistries(activePlugin.id).length === 0"
                class="empty-tab-content">
                该插件未注册任何显式能力
              </div>
            </div>
            <div v-else class="empty-tab-content">
              请先加载插件以查看其具体能力
            </div>
          </div>

          <!-- 设置 (Settings) -->
          <div v-if="activeTab === 'settings'" class="tab-pane">
            <FormItem v-if="activePluginSettingsForm" label="插件配置">
              <component :is="activePluginSettingsForm" />
            </FormItem>
            <SettingsForm />
          </div>
        </div>
      </template>
      <!-- 空状态 -->
      <div v-else class="empty-state">
        <PluginIcon class="empty-icon" />
        <p>请从左侧选择一个插件查看详情</p>
      </div>
    </template>
  </FormContainer>
</template>

<style scoped>
.plugin-main {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-icon {
  font-size: 12px;
}

.plugin-detail {
  display: flex;
  flex-direction: column;
}

.info-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.info-title h2 {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.title-with-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.dev-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 4px;
  background: var(--color-warning);
  color: #000;
  border-radius: 4px;
  line-height: 1;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  padding: 2px 8px;
  background: var(--bg-card);
  border-radius: 4px;
  border: 1px solid var(--border-subtle);
}

.info-actions {
  display: flex;
  gap: 8px;
}

.info-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.info-row {
  display: flex;
  gap: 12px;
}

.info-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  min-width: 60px;
}

.info-value {
  font-size: 13px;
  color: var(--text-primary);
  flex: 1;
}

.error-label {
  color: var(--color-danger);
}

.error-value {
  color: var(--color-danger);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--text-tertiary);
  text-align: center;
}

.empty-state .empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
  opacity: 0.3;
}

.empty-state p {
  font-size: 14px;
  margin: 0;
}

.plugin-tabs-container {
  margin-top: 16px;
  margin-bottom: 16px;
}

.tab-pane {
  animation: fade-in 0.2s ease-out;
}

.empty-tab-content {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: var(--text-tertiary);
  font-size: 14px;
  background: var(--bg-subtle);
  border-radius: 8px;
  border: 1px dashed var(--border-subtle);
}

@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
