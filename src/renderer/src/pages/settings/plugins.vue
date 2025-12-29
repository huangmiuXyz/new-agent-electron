<script setup lang="ts">
import { getCurrentInstance } from 'vue'

const { Plugin: PluginIcon, Trash, Refresh, Check, Dismiss, Play } = useIcon([
  'Plugin',
  'Trash',
  'Refresh',
  'Check',
  'Dismiss',
  'Play'
])

const instance = getCurrentInstance()
const pluginLoader = instance?.appContext.app.config.globalProperties.$pluginLoader

// 插件列表
const plugins = ref<PluginInfo[]>([])
const availablePlugins = ref<any[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

// 从文件系统获取可用插件列表
const fetchAvailablePlugins = async () => {
  try {
    const fs = window.api.fs
    const path = window.api.path
    const app = window.api.app

    // 获取插件目录路径（从静态目录读取）
    // 使用 Electron 的 app.getAppPath() 获取应用路径
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
  error.value = null
  try {
    if (pluginLoader) {
      plugins.value = pluginLoader.getLoadedPlugins()
    }
    // 获取可用插件列表
    availablePlugins.value = await fetchAvailablePlugins()
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载插件列表失败'
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
    error.value = err instanceof Error ? err.message : '加载插件失败'
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
    error.value = err instanceof Error ? err.message : '卸载插件失败'
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
    error.value = err instanceof Error ? err.message : '执行命令失败'
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

// 初始化
onMounted(() => {
  refreshPlugins()
})
</script>

<template>
  <div class="plugins-page">
    <div class="page-header">
      <h2 class="page-title">插件管理</h2>
      <Button variant="icon" size="sm" @click="refreshPlugins" :loading="loading">
        <Refresh />
      </Button>
    </div>

    <!-- 错误提示 -->
    <div v-if="error" class="error-message">
      {{ error }}
      <Button variant="text" size="sm" @click="error = null">关闭</Button>
    </div>

    <!-- 已加载的插件 -->
    <div class="section">
      <h3 class="section-title">已加载的插件 ({{ plugins.length }})</h3>
      <div v-if="plugins.length === 0" class="empty-state">
        <PluginIcon class="empty-icon" />
        <p>暂无已加载的插件</p>
      </div>
      <div v-else class="plugin-list">
        <div v-for="pluginInfo in plugins" :key="pluginInfo.plugin.name" class="plugin-item">
          <div class="plugin-info">
            <div class="plugin-header">
              <h4 class="plugin-name">{{ pluginInfo.plugin.name }}</h4>
              <div class="plugin-status" :style="{ color: getStatusColor(pluginInfo.status) }">
                <component v-if="getStatusIcon(pluginInfo.status)" :is="getStatusIcon(pluginInfo.status)"
                  class="status-icon" />
                <span>{{ getStatusText(pluginInfo.status) }}</span>
              </div>
            </div>
            <p v-if="pluginInfo.plugin.description" class="plugin-description">
              {{ pluginInfo.plugin.description }}
            </p>
            <p v-if="pluginInfo.plugin.version" class="plugin-version">
              版本: {{ pluginInfo.plugin.version }}
            </p>
            <p v-if="pluginInfo.error" class="plugin-error">
              错误: {{ pluginInfo.error }}
            </p>
          </div>
          <div class="plugin-actions">
            <Button v-if="pluginInfo.status === 'loaded'" variant="text" size="sm"
              @click="unloadPlugin(pluginInfo.plugin.name)">
              <template #icon>
                <Trash />
              </template>
              卸载
            </Button>
          </div>
        </div>
      </div>
    </div>

    <!-- 可用插件 -->
    <div class="section">
      <h3 class="section-title">可用插件</h3>
      <div v-if="availablePlugins.length === 0" class="empty-state">
        <PluginIcon class="empty-icon" />
        <p>暂无可用插件</p>
      </div>
      <div v-else class="plugin-list">
        <div v-for="plugin in availablePlugins" :key="plugin.name" class="plugin-item">
          <div class="plugin-info">
            <div class="plugin-header">
              <h4 class="plugin-name">{{ plugin.name }}</h4>
            </div>
            <p v-if="plugin.description" class="plugin-description">
              {{ plugin.description }}
            </p>
            <p v-if="plugin.version" class="plugin-version">
              版本: {{ plugin.version }}
            </p>
          </div>
          <div class="plugin-actions">
            <Button v-if="!plugins.find(p => p.plugin.name === plugin.name)" variant="primary" size="sm"
              @click="loadPlugin(plugin.path)">
              <template #icon>
                <Play />
              </template>
              加载
            </Button>
            <span v-else class="already-loaded">已加载</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 插件命令 -->
    <div v-if="plugins.length > 0" class="section">
      <h3 class="section-title">插件命令</h3>
      <div class="commands-list">
        <div v-for="pluginInfo in plugins" :key="`commands-${pluginInfo.plugin.name}`">
          <div v-if="pluginLoader" class="plugin-commands">
            <h5 class="plugin-commands-title">{{ pluginInfo.plugin.name }} 的命令:</h5>
            <div
              v-for="command in pluginLoader.getPluginManager().getAllCommands().filter(c => c.pluginName === pluginInfo.plugin.name)"
              :key="command.name" class="command-item">
              <Button variant="text" size="sm" @click="executeCommand(command.name)">
                <template #icon>
                  <Play />
                </template>
                {{ command.name }}
              </Button>
            </div>
            <div
              v-if="pluginLoader.getPluginManager().getAllCommands().filter(c => c.pluginName === pluginInfo.plugin.name).length === 0"
              class="no-commands">
              无可用命令
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.plugins-page {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.page-title {
  font-size: 24px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary);
}

.error-message {
  padding: 12px 16px;
  background-color: #fff2f0;
  border: 1px solid #ffccc7;
  border-radius: 8px;
  color: #ff4d4f;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section {
  margin-bottom: 32px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 16px;
  color: var(--text-primary);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  background-color: var(--bg-secondary);
  border-radius: 12px;
  color: var(--text-secondary);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
}

.plugin-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.plugin-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 16px;
  background-color: var(--bg-secondary);
  border-radius: 12px;
  gap: 16px;
}

.plugin-info {
  flex: 1;
}

.plugin-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.plugin-name {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary);
}

.plugin-status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
}

.status-icon {
  font-size: 12px;
}

.plugin-description {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 4px 0;
}

.plugin-version {
  font-size: 12px;
  color: var(--text-tertiary);
  margin: 4px 0;
}

.plugin-error {
  font-size: 12px;
  color: #ff4d4f;
  margin: 4px 0;
}

.plugin-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.already-loaded {
  font-size: 12px;
  color: var(--text-secondary);
  padding: 4px 8px;
  background-color: var(--bg-tertiary);
  border-radius: 4px;
}

.commands-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.plugin-commands {
  padding: 16px;
  background-color: var(--bg-secondary);
  border-radius: 12px;
}

.plugin-commands-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 12px 0;
  color: var(--text-primary);
}

.command-item {
  display: inline-block;
  margin-right: 8px;
  margin-bottom: 8px;
}

.no-commands {
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
