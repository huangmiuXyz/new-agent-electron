<script setup lang="ts">
const syncStore = useSyncStore()
const { confirm } = useModal()
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

const pullEndpoint = async (endpoint: SyncEndpoint) => {
  try {
    if (selectedEndpointId.value !== endpoint.deviceId) {
      await syncStore.selectEndpoint(endpoint.deviceId)
    }

    const targetName = endpoint.displayName || endpoint.deviceId
    const confirmed = await confirm({
      title: '确认拉取',
      content: `将从“${targetName}”拉取并覆盖本机 ${diffSummary.value.messageChanges} 条消息（${diffSummary.value.chatChanges} 个会话），是否继续？`,
      confirmText: '继续拉取',
      cancelText: '取消',
      confirmProps: {
        danger: true
      }
    })

    if (!confirmed) return

    await syncStore.pullEndpoint(endpoint.deviceId)
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
            <div v-for="endpoint in endpoints" :key="endpoint.deviceId" class="endpoint-item"
              :class="{ selected: selectedEndpointId === endpoint.deviceId }" @click="selectEndpoint(endpoint.deviceId)">
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
                  @click.stop="pullEndpoint(endpoint)">
                  拉取
                </Button>
              </div>
            </div>
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
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.endpoint-item:hover {
  border-color: var(--border-default);
  background: var(--bg-hover);
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
  line-height: 1.45;
  word-break: break-word;
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
  .sync-wrapper {
    gap: 12px;
  }

  .sync-row {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }

  .sync-overview {
    padding: 12px;
  }

  .status-compact {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }

  .status-value {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--bg-secondary);
  }

  .address-item {
    padding: 6px 8px;
    border-radius: 8px;
    background: var(--bg-secondary);
    font-size: 12px;
    line-height: 1.5;
  }

  .client-actions {
    padding: 12px;
  }

  .client-actions :deep(.btn) {
    width: 100%;
    min-height: 36px;
  }

  .endpoint-header {
    padding: 14px 14px 8px;
  }

  .endpoint-list {
    padding: 0 14px 14px;
  }

  .endpoint-item {
    flex-direction: column;
    gap: 10px;
    padding: 12px;
  }

  .endpoint-name-row {
    align-items: flex-start;
    flex-direction: column;
    gap: 6px;
  }

  .endpoint-badge {
    align-self: flex-start;
  }

  .endpoint-actions {
    margin-left: 0;
    width: 100%;
  }

  .endpoint-actions :deep(.btn) {
    width: 100%;
    min-height: 34px;
  }

  .peer-empty {
    margin: 0 14px 14px;
    padding: 14px;
  }
}
</style>
