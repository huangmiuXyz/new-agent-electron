<script setup lang="ts">
import { FormItem } from '@renderer/composables/useForm'
const { Plugin: PluginIcon, Trash, Refresh, Check, Dismiss, Play, Download, Code } = useIcon([
  'Plugin',
  'Trash',
  'Refresh',
  'Check',
  'Dismiss',
  'Play',
  'Download',
  'Code'
])

// 使用 usePlugins composable
const {
  allPlugins,
  loading,
  installing,
  activePluginId,
  activePlugin,
  installPlugin,
  loadPluginDev,
  refreshPlugins,
  loadPlugin,
  unloadPlugin,
  uninstallPlugin,
  executeCommand,
  getStatusText,
  getStatusColor,
  getPluginCommands,
  selectPlugin,
  togglePluginNotification,
  isPluginNotificationDisabled
} = usePlugins()

// 通知开关逻辑
const notificationDisabled = computed({
  get: () => activePlugin.value ? isPluginNotificationDisabled(activePlugin.value.name) : false,
  set: (val: boolean) => {
    if (activePlugin.value) {
      togglePluginNotification(activePlugin.value.name, val)
    }
  }
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

// 卸载插件（从内存中移除）
const handleUnloadPlugin = async (pluginName: string) => {
  try {
    await unloadPlugin(pluginName)
  } catch (err) {
    alert(`卸载失败: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// 完全卸载插件（从内存和文件系统中移除）
const handleUninstallPlugin = async (pluginName: string) => {
  const confirmed = confirm(`确定要完全卸载插件 "${pluginName}" 吗？\n\n此操作将从内存和文件系统中删除该插件的所有文件。`)
  if (!confirmed) {
    return
  }

  try {
    await uninstallPlugin(pluginName)
    alert('插件已完全卸载')
  } catch (err) {
    alert(`卸载失败: ${err instanceof Error ? err.message : String(err)}`)
  }
}
</script>

<template>
  <!-- 列表视图 -->
  <ListContainer v-if="showList">
    <List title="插件" :items="allPlugins" :active-id="activePluginId" :loading="loading" key-field="id" main-field="name"
      sub-field="description" :logo-field="'PluginIcon'" @select="handleSelectPlugin">
      <template #title-tool>
        <Button @click="loadPluginDev" size="sm" type="button" variant="text" :loading="installing">
          <template #icon>
            <Code />
          </template>
          开发模式
        </Button>
        <Button @click="installPlugin" size="sm" type="button" variant="text" :loading="installing">
          <template #icon>
            <Download />
          </template>
          安装插件
        </Button>
      </template>
      <template #main="{ item }">
        <div class="plugin-main">
          <span>{{ item.name }}</span>
        </div>
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
                  @click="handleUnloadPlugin(activePlugin.name)">
                  停用
                </Button>
                <Button v-if="activePlugin.type === 'loaded'" variant="text" size="sm"
                  @click="handleUninstallPlugin(activePlugin.name)">
                  <template #icon>
                    <Trash />
                  </template>
                  完全卸载
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
              <div v-if="activePlugin.error" class="info-row">
                <span class="info-label error-label">错误:</span>
                <span class="info-value error-value">{{ activePlugin.error }}</span>
              </div>
            </div>
          </Card>
        </FormItem>
        <!-- 插件设置 -->
        <FormItem v-if="activePlugin.type === 'loaded'" label="插件设置">
          <Card padding="16px">
            <div class="setting-item">
              <div class="setting-info">
                <div class="setting-title">禁用插件通知</div>
                <div class="setting-desc">开启后，该插件将不再显示任何弹窗或状态栏通知</div>
              </div>
              <Switch v-model="notificationDisabled" />
            </div>
          </Card>
        </FormItem>
        <!-- 插件命令 -->
        <FormItem v-if="activePlugin.type === 'loaded'" label="可用命令">
          <Table :data="getPluginCommands(activePlugin.name)" :columns="[
            { key: 'name', label: '命令名称', width: '2fr' },
            { key: 'description', label: '描述', width: '2fr' },
            { key: 'actions', label: '操作', width: '1fr' }
          ]">
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

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.setting-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.setting-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.setting-desc {
  font-size: 12px;
  color: var(--text-secondary);
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
</style>
