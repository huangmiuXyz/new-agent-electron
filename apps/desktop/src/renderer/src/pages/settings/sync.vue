<script setup lang="ts">
const syncStore = useSyncStore()
const {
  hostEnabled,
  profile,
  hostState,
  connection,
  endpoints,
  selectedEndpointId,
  diffSummary,
  hasDesktopSyncApi,
  selfDeviceId,
  isPulling
} = storeToRefs(syncStore)

const handleHostEnabledChange = (value?: boolean) => {
  void syncStore.setHostEnabled(Boolean(value))
}

const updateDisplayName = async () => {
  await syncStore.updateDisplayName(profile.value.displayName)
}

const updateServerUrl = (value?: string | number) => {
  syncStore.setServerUrl(String(value || ''))
}

const connect = async () => {
  try {
    await syncStore.connect()
  } catch (error) {
    connection.value.error = error instanceof Error ? error.message : String(error)
  }
}

const disconnect = () => {
  syncStore.disconnect()
}

const pullEndpoint = async (deviceId: string) => {
  try {
    await syncStore.pullEndpoint(deviceId)
  } catch (error) {
    connection.value.error = error instanceof Error ? error.message : String(error)
  }
}

const selectEndpoint = (deviceId: string) => {
  void syncStore.selectEndpoint(deviceId)
}

const displayHostUrls = computed(() => {
  const urls = [...hostState.value.urls]
  const preferredIndex = urls.findIndex((url) => !url.includes('127.0.0.1'))
  if (preferredIndex > 0) {
    const [preferred] = urls.splice(preferredIndex, 1)
    urls.unshift(preferred)
  }
  return urls
})

const endpointBadge = (endpoint: SyncEndpoint) => {
  if (endpoint.deviceId === selfDeviceId.value) return '本机'
  return endpoint.source === 'desktop' ? '桌面端' : '移动端'
}

const getEndpointSummary = (endpoint: SyncEndpoint) => {
  if (endpoint.deviceId === selfDeviceId.value) return ''
  if (selectedEndpointId.value !== endpoint.deviceId) return '点击此项查看差异'
  if (diffSummary.value.messageChanges === 0 && diffSummary.value.chatChanges === 0) return '当前与本机没有差异'
  return `拉取后会覆盖本机 ${diffSummary.value.messageChanges} 条消息，涉及 ${diffSummary.value.chatChanges} 个会话`
}
</script>

<template>
  <FormContainer header-title="同步">
    <template #content>
      <div class="sync-wrapper">
        <div class="sync-row" v-if="hasDesktopSyncApi">
          <div class="sync-copy">
            <div class="sync-title">桌面端同步服务</div>
          </div>
          <Switch :model-value="hostEnabled" size="sm" @update:modelValue="handleHostEnabledChange" />
        </div>

        <FormItem label="本机名称">
          <Input v-model="profile.displayName" placeholder="给当前设备起个名字" @blur="updateDisplayName" />
        </FormItem>

        <Card v-if="hasDesktopSyncApi">
          <div class="sync-overview">
            <div class="status-compact">
              <span class="status-label">状态 / 可见端点</span>
              <span class="status-value">
                {{ hasDesktopSyncApi ? (hostState.running ? '已启动' : '未启动') : (connection.connected ? '已连接' : '未连接') }}
                ·
                {{ endpoints.length }}
              </span>
            </div>
            <div class="overview-divider" />
            <div class="address-panel">
              <div class="address-section-label">同步地址</div>
              <div v-if="displayHostUrls.length > 0" class="address-list">
                <div v-for="url in displayHostUrls" :key="url" class="address-item">{{ url }}</div>
              </div>
            </div>
          </div>
        </Card>

        <template v-else>
          <Card>
            <div class="status-compact">
              <span class="status-label">状态 / 可见端点</span>
              <span class="status-value">
                {{ hasDesktopSyncApi ? (hostState.running ? '已启动' : '未启动') : (connection.connected ? '已连接' : '未连接') }}
                ·
                {{ endpoints.length }}
              </span>
            </div>
          </Card>

          <FormItem label="同步入口地址">
            <Input :model-value="connection.serverUrl" placeholder="例如 http://192.168.1.8:41235"
              @update:modelValue="updateServerUrl" />
          </FormItem>

          <Card>
            <div class="client-actions">
              <Button v-if="!connection.connected" @click="connect">连接</Button>
              <Button v-else variant="secondary" @click="disconnect">断开连接</Button>
            </div>
            <div v-if="connection.error" class="error-text">{{ connection.error }}</div>
          </Card>
        </template>

        <Card>
          <div class="endpoint-header">
            <div class="endpoint-title">设备列表</div>
          </div>
          <div v-if="endpoints.length > 0" class="endpoint-list">
            <button v-for="endpoint in endpoints" :key="endpoint.deviceId" type="button" class="endpoint-item"
              :class="{ selected: selectedEndpointId === endpoint.deviceId }"
              @click="selectEndpoint(endpoint.deviceId)">
              <div class="endpoint-main">
                <div class="endpoint-name-row">
                  <div class="endpoint-name">{{ endpoint.displayName || endpoint.deviceId }}</div>
                  <div class="endpoint-badge">{{ endpointBadge(endpoint) }}</div>
                </div>
                <div class="endpoint-meta">
                  {{ endpoint.chatCount }} 个会话 / {{ endpoint.messageCount }} 条消息
                </div>
                <div v-if="endpoint.deviceId !== selfDeviceId" class="endpoint-summary">
                  {{ getEndpointSummary(endpoint) }}
                </div>
              </div>
              <div v-if="endpoint.deviceId !== selfDeviceId" class="endpoint-actions">
                <Button size="sm" variant="secondary"
                  :disabled="(!hasDesktopSyncApi && !connection.connected) || (selectedEndpointId === endpoint.deviceId && diffSummary.messageChanges === 0 && diffSummary.chatChanges === 0)"
                  :loading="isPulling && selectedEndpointId === endpoint.deviceId"
                  @click.stop="pullEndpoint(endpoint.deviceId)">
                  拉取
                </Button>
              </div>
            </button>
          </div>
          <div v-else class="peer-empty">当前还没有可见端点</div>
        </Card>

        <Card v-if="hasDesktopSyncApi && hostState.error">
          <div class="error-text">{{ hostState.error }}</div>
        </Card>
        <Card v-else-if="!hasDesktopSyncApi && connection.error">
          <div class="error-text">{{ connection.error }}</div>
        </Card>
      </div>
    </template>
  </FormContainer>
</template>

<style scoped>
.sync-wrapper {
  max-width: 640px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sync-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.sync-copy {
  min-width: 0;
}

.sync-title,
.endpoint-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.sync-subtitle,
.endpoint-subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.sync-overview {
  padding: 14px 16px;
}

.status-compact {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.overview-divider {
  margin: 10px 0;
  height: 1px;
  background: var(--border-subtle);
}

.status-label,
.address-section-label,
.address-tip,
.endpoint-meta {
  font-size: 11px;
  color: var(--text-secondary);
}

.status-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.address-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.address-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.address-item {
  font-size: 13px;
  color: var(--text-primary);
  word-break: break-all;
}

.endpoint-header {
  padding: 16px 16px 8px;
}

.endpoint-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 16px 16px;
}

.endpoint-item {
  display: flex;
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  background: var(--bg-card);
  cursor: pointer;
  text-align: left;
}

.endpoint-item.selected {
  border-color: var(--accent-color);
  background: var(--bg-secondary);
}

.endpoint-main {
  flex: 1;
  min-width: 0;
}

.endpoint-name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.endpoint-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.endpoint-badge {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--bg-secondary);
  font-size: 11px;
  color: var(--text-secondary);
}

.endpoint-summary {
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.endpoint-actions {
  display: flex;
  align-items: center;
  margin-left: 12px;
}

.client-actions {
  padding: 16px;
  display: flex;
  justify-content: flex-end;
}

.peer-empty {
  padding: 18px;
  border: 1px dashed var(--border-subtle);
  border-radius: 12px;
  text-align: center;
  font-size: 12px;
  color: var(--text-secondary);
}

.error-text {
  padding: 0 16px 16px;
  font-size: 12px;
  color: var(--color-danger);
}

@media (max-width: 720px) {

  .sync-row,
  .action-bar,
  .endpoint-name-row {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
