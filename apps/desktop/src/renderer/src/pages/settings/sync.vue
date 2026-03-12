<script setup lang="ts">
const syncStore = useSyncStore()
const { confirm } = useModal()

const [PullOptionsForm, pullOptionsActions] = useForm({
  showHeader: false,
  fields: [
    {
      name: 'targets',
      type: 'checkboxGroup',
      label: '拉取内容',
      options: [
        { label: '聊天数据', value: 'chats', description: '覆盖会话、消息和当前会话' },
        { label: '提供商', value: 'providers', description: '同步非插件创建的提供商和排序' }
      ],
      defaultValue: ['chats', 'providers'],
      required: true
    }
  ]
})

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

    pullOptionsActions.setFieldValue('targets', ['chats', 'providers'])
    const confirmed = await confirm({
      title: '确认拉取',
      content: PullOptionsForm,
      confirmText: '继续拉取',
      cancelText: '取消',
      confirmProps: {
        danger: true
      }
    })

    if (!confirmed) return

    const targets = (pullOptionsActions.getFieldValue('targets') as string[]) || []
    await syncStore.pullEndpoint(endpoint.deviceId, {
      chats: targets.includes('chats'),
      providers: targets.includes('providers')
    })
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

const hasSelectedDiff = computed(() => {
  return (
    diffSummary.value.messageChanges > 0 ||
    diffSummary.value.chatChanges > 0 ||
    diffSummary.value.providerChanges > 0
  )
})
</script>

<template>
  <FormContainer header-title="同步">
    <template #content>
      <div class="sync-wrapper">
        <div v-if="hasDesktopSyncApi" class="sync-row">
          <div class="sync-copy">
            <div class="sync-title">桌面端同步服务</div>
          </div>
          <Switch :model-value="hostEnabled" size="sm" @update:modelValue="handleHostEnabledChange" />
        </div>

        <FormItem label="本机名称">
          <Input v-model="profile.displayName" placeholder="给当前设备起一个名字" @blur="updateDisplayName" />
        </FormItem>

        <div v-if="hasDesktopSyncApi" class="sync-overview">
          <div class="address-panel">
            <div class="address-section-label">同步地址</div>
            <div v-if="displayHostUrls.length > 0" class="address-list">
              <div v-for="url in displayHostUrls" :key="url" class="address-item">{{ url }}</div>
            </div>
          </div>
        </div>

        <template v-else>
          <FormItem label="同步入口地址">
            <Input
              :model-value="connection.serverUrl"
              placeholder="例如 http://192.168.1.8:41235"
              @update:modelValue="updateServerUrl"
            />
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
            <div
              v-for="endpoint in endpoints"
              :key="endpoint.deviceId"
              class="endpoint-item"
              :class="{ selected: selectedEndpointId === endpoint.deviceId }"
              @click="selectEndpoint(endpoint.deviceId)"
            >
              <div class="endpoint-main">
                <div class="endpoint-name-row">
                  <div class="endpoint-name-block">
                    <div class="endpoint-name">{{ endpoint.displayName || endpoint.deviceId }}</div>
                    <div v-if="endpoint.displayName" class="endpoint-id">{{ endpoint.deviceId }}</div>
                  </div>
                  <div class="endpoint-badge">{{ endpointBadge(endpoint) }}</div>
                </div>
                <div class="endpoint-metrics">
                  <div class="endpoint-metric">
                    <span class="metric-value">{{ endpoint.chatCount }}</span>
                    <span class="metric-label">会话</span>
                  </div>
                  <div class="endpoint-metric">
                    <span class="metric-value">{{ endpoint.messageCount }}</span>
                    <span class="metric-label">消息</span>
                  </div>
                  <div
                    v-if="selectedEndpointId === endpoint.deviceId && endpoint.deviceId !== selfDeviceId"
                    class="endpoint-metric"
                  >
                    <span class="metric-value">{{ diffSummary.providerChanges }}</span>
                    <span class="metric-label">提供商变更</span>
                  </div>
                </div>
              </div>
              <div v-if="endpoint.deviceId !== selfDeviceId" class="endpoint-actions">
                <Button
                  size="sm"
                  variant="secondary"
                  :disabled="(!hasDesktopSyncApi && !connection.connected) || (selectedEndpointId === endpoint.deviceId && !hasSelectedDiff)"
                  :loading="isPulling && selectedEndpointId === endpoint.deviceId"
                  @click.stop="pullEndpoint(endpoint)"
                >
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

.sync-wrapper .form-item {
  margin-bottom: 0;
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

.address-section-label,
.endpoint-meta {
  font-size: 11px;
  color: var(--text-secondary);
}

.address-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.address-list {
  display: flex;
  gap: 12px;
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
  align-items: flex-start;
  gap: 14px;
  padding: 14px;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  background: var(--bg-card);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease;
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
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.endpoint-name-block {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.endpoint-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.45;
  word-break: break-word;
}

.endpoint-id {
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.5;
  word-break: break-all;
}

.endpoint-badge {
  flex-shrink: 0;
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--bg-secondary);
  font-size: 11px;
  color: var(--text-secondary);
}

.endpoint-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.endpoint-metric {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  padding: 6px 10px;
  border-radius: 10px;
  background: var(--bg-secondary);
}

.metric-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.metric-label {
  font-size: 11px;
  color: var(--text-secondary);
}

.endpoint-actions {
  display: flex;
  align-items: stretch;
  margin-left: auto;
  flex-shrink: 0;
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

  :deep(.setting-content) {
    padding: 14px 12px 20px;
  }

  .sync-row {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }

  .sync-overview {
    padding: 12px;
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
    min-height: 40px;
  }

  .endpoint-header {
    padding: 14px 14px 10px;
  }

  .endpoint-list {
    padding: 0 14px 14px;
    gap: 10px;
  }

  .endpoint-item {
    flex-direction: column;
    padding: 12px;
    gap: 10px;
  }

  .endpoint-name-row {
    gap: 10px;
  }

  .endpoint-badge {
    align-self: flex-start;
  }

  .endpoint-name {
    font-size: 15px;
  }

  .endpoint-id {
    font-size: 10px;
  }

  .endpoint-metrics {
    margin-top: 10px;
  }

  .endpoint-metric {
    padding: 5px 9px;
  }

  .endpoint-actions {
    width: 100%;
    margin-left: 0;
    padding-top: 2px;
  }

  .endpoint-actions :deep(.btn) {
    width: 100%;
    min-height: 40px;
    border-radius: 10px;
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .peer-empty {
    margin: 0 14px 14px;
    padding: 14px;
  }
}

@media (max-width: 420px) {
  .sync-wrapper {
    max-width: none;
  }

  .sync-overview {
    padding: 12px 12px 10px;
  }

  .endpoint-header,
  .endpoint-list,
  .peer-empty {
    margin-left: 0;
    margin-right: 0;
  }

  .endpoint-header {
    padding: 12px 12px 8px;
  }

  .endpoint-list {
    padding: 0 12px 12px;
  }

  .endpoint-item {
    padding: 12px;
    gap: 12px;
    border-radius: 10px;
  }

  .endpoint-name-row {
    flex-direction: column;
    gap: 8px;
  }
}
</style>
