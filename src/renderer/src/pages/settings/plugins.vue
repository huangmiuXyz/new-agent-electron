<script setup lang="ts">
import { FormItem } from '@renderer/composables/useForm'
import { isMobile } from '@renderer/composables/useDeviceType'
import List from '@renderer/components/List.vue'
import ListContainer from '@renderer/components/ListContainer.vue'
import Table from '@renderer/components/Table.vue'

const { Plugin: PluginIcon, Trash, Refresh, Check, Dismiss, Play, Plus } = useIcon([
  'Plugin',
  'Trash',
  'Refresh',
  'Check',
  'Dismiss',
  'Play',
  'Plus'
])

const instance = getCurrentInstance()
const pluginLoader = instance?.appContext.app.config.globalProperties.$pluginLoader

// 插件列表
const plugins = ref<PluginInfo[]>([])
const availablePlugins = ref<any[]>([])
const loading = ref(false)
const activePluginId = useLocalStorage<string>('activePluginId', '')

// 从文件系统获取可用插件列表
const fetchAvailablePlugins = async () => {
  try {
    const fs = window.api.fs
    const path = window.api.path
    const app = window.api.app

    // 获取插件目录路径（从静态目录读取）
    const appPath = app.getAppPath()
    const pluginsDir = path.join(appPath, 'src/renderer/public/plugins')

    // 读取目录内容
    const files = fs.readdirSync(pluginsDir)

    // 过滤出 TypeScript 文件
    const pluginFiles = files.filter((file: string) => file.endsWith('.ts'))

    // 生成插件列表
    const pluginList = pluginFiles.map((file: string) => {
      const pluginName = file.replace(/\.ts$/, '')
      return {
        name: pluginName,
        path: pluginName,
        description: `${pluginName} 插件`,
        version: '1.0.0'
      }
    })

    return pluginList
  } catch (err) {
    console.error('Failed to fetch available plugins:', err)
    return []
  }
}

// 刷新插件列表
const refreshPlugins = async () => {
  loading.value = true
  try {
    if (pluginLoader) {
      plugins.value = pluginLoader.getLoadedPlugins()
    }
    // 获取可用插件列表
    availablePlugins.value = await fetchAvailablePlugins()
  } catch (err) {
    console.error('Failed to refresh plugins:', err)
  } finally {
    loading.value = false
  }
}

// 加载插件
const loadPlugin = async (pluginPath: string) => {
  try {
    if (pluginLoader) {
      await pluginLoader.loadPlugin(pluginPath)
      await refreshPlugins()
    }
  } catch (err) {
    console.error('Failed to load plugin:', err)
    throw err
  }
}

// 卸载插件
const unloadPlugin = async (pluginName: string) => {
  try {
    if (pluginLoader) {
      await pluginLoader.unloadPlugin(pluginName)
      await refreshPlugins()
    }
  } catch (err) {
    console.error('Failed to unload plugin:', err)
    throw err
  }
}

// 执行命令
const executeCommand = async (commandName: string) => {
  try {
    if (pluginLoader) {
      const manager = pluginLoader.getPluginManager()
      await manager.executeCommand(commandName)
    }
  } catch (err) {
    console.error('Failed to execute command:', err)
    throw err
  }
}

// 获取状态文本
const getStatusText = (status: PluginStatus): string => {
  const statusMap: Record<PluginStatus, string> = {
    unloaded: '未加载',
    loading: '加载中',
    loaded: '已加载',
    unloading: '卸载中',
    error: '错误'
  }
  return statusMap[status] || status
}

// 获取状态颜色
const getStatusColor = (status: PluginStatus): string => {
  const colorMap: Record<PluginStatus, string> = {
    unloaded: '#999',
    loading: '#1890ff',
    loaded: '#52c41a',
    unloading: '#faad14',
    error: '#ff4d4f'
  }
  return colorMap[status] || '#999'
}

// 获取状态图标
const getStatusIcon = (status: PluginStatus) => {
  if (status === 'loaded') return Check
  if (status === 'loading') return Refresh
  if (status === 'error') return Dismiss
  return null
}

// 合并所有插件（已加载和可用）
const allPlugins = computed(() => {
  const loadedNames = new Set(plugins.value.map(p => p.plugin.name))
  const available = availablePlugins.value.filter(p => !loadedNames.has(p.name))
  return [
    ...plugins.value.map(p => ({
      id: p.plugin.name,
      name: p.plugin.name,
      description: p.plugin.description || '',
      version: p.plugin.version || '1.0.0',
      status: p.status,
      type: 'loaded',
      error: p.error,
      plugin: p.plugin
    })),
    ...available.map(p => ({
      id: p.name,
      name: p.name,
      description: p.description || '',
      version: p.version || '1.0.0',
      status: 'unloaded' as PluginStatus,
      type: 'available',
      path: p.path
    }))
  ]
})

// 当前选中的插件
const activePlugin = computed(() => {
  return allPlugins.value.find(p => p.id === activePluginId.value)
})

// 获取插件的命令列表
const getPluginCommands = (pluginName: string) => {
  if (!pluginLoader) return []
  return pluginLoader.getPluginManager().getAllCommands().filter(c => c.pluginName === pluginName)
}

// 选择插件
const selectPlugin = (pluginId: string) => {
  activePluginId.value = pluginId
}

// 初始化
onMounted(() => {
  refreshPlugins()
  // 默认选中第一个插件
  watch(allPlugins, (newPlugins) => {
    if (newPlugins.length > 0 && !activePluginId.value) {
      activePluginId.value = newPlugins[0].id
    }
  }, { immediate: true })
})

// 移动端路由处理
import { useRouter, useRoute } from 'vue-router'
const router = useRouter()
const route = useRoute()

const isDetailResult = computed(() => {
  return !!route.params.id
})

const handleSelectPlugin = (pluginId: string) => {
  selectPlugin(pluginId)
  if (isMobile.value) {
    router.push(`/mobile/settings/plugins/${pluginId}`)
  }
}

const showList = computed(() => !isMobile.value || !isDetailResult.value)
const showForm = computed(() => !isMobile.value || isDetailResult.value)
</script>

<template>
  <!-- 列表视图 -->
  <ListContainer v-if="showList">
    <List
      title="插件"
      :items="allPlugins"
      :active-id="activePluginId"
      :loading="loading"
      key-field="id"
      main-field="name"
      sub-field="description"
      :logo-field="() => PluginIcon"
      @select="handleSelectPlugin"
    >
      <template #title-tool>
        <Button @click="refreshPlugins" size="sm" type="button" variant="text" :loading="loading">
          <template #icon>
            <Refresh />
          </template>
        </Button>
      </template>
      <template #main="{ item }">
        <div class="plugin-main">
          <span>{{ item.name }}</span>
          <component
            v-if="getStatusIcon(item.status)"
            :is="getStatusIcon(item.status)"
            class="status-icon"
            :style="{ color: getStatusColor(item.status) }"
          />
        </div>
      </template>
    </List>
  </ListContainer>

  <!-- 表单视图 -->
  <FormContainer v-if="showForm" header-title="插件管理">
    <template #content>
      <div v-if="activePlugin" class="plugin-detail">
        <!-- 插件基本信息 -->
        <FormItem label="插件信息">
          <div class="info-card">
            <div class="info-header">
              <div class="info-title">
                <h2>{{ activePlugin.name }}</h2>
                <div class="status-badge" :style="{ color: getStatusColor(activePlugin.status) }">
                  <component v-if="getStatusIcon(activePlugin.status)" :is="getStatusIcon(activePlugin.status)" />
                  {{ getStatusText(activePlugin.status) }}
                </div>
              </div>
              <div class="info-actions">
                <Button v-if="activePlugin.type === 'loaded'" variant="text" size="sm" @click="unloadPlugin(activePlugin.name)">
                  <template #icon>
                    <Trash />
                  </template>
                  卸载
                </Button>
                <Button v-if="activePlugin.type === 'available'" size="sm" @click="loadPlugin(activePlugin.path)">
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
              <div v-if="activePlugin.error" class="info-row">
                <span class="info-label error-label">错误:</span>
                <span class="info-value error-value">{{ activePlugin.error }}</span>
              </div>
            </div>
          </div>
        </FormItem>

        <!-- 插件命令 -->
        <FormItem v-if="activePlugin.type === 'loaded'" label="可用命令">
          <Table
            :data="getPluginCommands(activePlugin.name)"
            :columns="[
              { key: 'name', label: '命令名称', width: '2fr' },
              { key: 'description', label: '描述', width: '2fr' },
              { key: 'actions', label: '操作', width: '1fr' }
            ]"
          >
            <template #description="{ row }">
              {{ row.description || '暂无描述' }}
            </template>
            <template #actions="{ row }">
              <Button size="sm" variant="text" @click="executeCommand(row.name)">
                <template #icon>
                  <Play />
                </template>
                执行
              </Button>
            </template>
          </Table>
        </FormItem>
      </div>

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
  gap: 16px;
}

.info-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 16px;
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
  margin: 0 0 8px 0;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  padding: 2px 8px;
  background: #fff;
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
  color: #ff4d4f;
}

.error-value {
  color: #ff4d4f;
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
</style>
