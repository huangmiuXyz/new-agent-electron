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
        { label: '提供商', value: 'providers', description: '同步非插件创建的提供商和排序' },
        { label: '智能体', value: 'agents', description: '同步自定义智能体配置' }
      ],
      defaultValue: ['chats', 'providers', 'agents'],
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

    pullOptionsActions.setFieldValue('targets', ['chats', 'providers', 'agents'])
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
      providers: targets.includes('providers'),
      agents: targets.includes('agents')
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

const endpointDisplayName = (endpoint: SyncEndpoint) => {
  const name = endpoint.displayName || endpoint.deviceId
  const badge = endpointBadge(endpoint)
  return `${name}  ${badge}`
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
      <div class="settings-page-wrapper">
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

        <SettingsList
          :count="endpoints.length"
          count-label="个设备"
        >
          <SettingsGroup v-if="endpoints.length > 0" label="在线设备">
            <div v-for="endpoint in endpoints" :key="endpoint.deviceId" class="device-row-wrapper">
              <SettingsRow
                :name="endpointDisplayName(endpoint)"
                :desc="`${endpoint.deviceId} · ${endpoint.chatCount} 会话 · ${endpoint.messageCount} 消息` + (selectedEndpointId === endpoint.deviceId && endpoint.deviceId !== selfDeviceId ? ` · ${diffSummary.providerChanges} 提供商变更` : '')"
                :class="{ selected: selectedEndpointId === endpoint.deviceId }"
                clickable
                mono
                @click="selectEndpoint(endpoint.deviceId)"
              >
                <template #icon>
                  <component :is="useIcon('Server')" />
                </template>
                <template #actions>
                  <Button
                    v-if="endpoint.deviceId !== selfDeviceId"
                    size="sm"
                    variant="secondary"
                    :disabled="(!hasDesktopSyncApi && !connection.connected) || (selectedEndpointId === endpoint.deviceId && !hasSelectedDiff)"
                    :loading="isPulling && selectedEndpointId === endpoint.deviceId"
                    @click.stop="pullEndpoint(endpoint)"
                  >
                    拉取
                  </Button>
                </template>
              </SettingsRow>
            </div>
          </SettingsGroup>

          <template #empty>
            <div class="empty-icon">
              <component :is="useIcon('Globe')" />
            </div>
            <div class="empty-title">当前还没有可见设备</div>
            <div class="empty-hint">启动同步服务或连接同步入口后将显示在线设备</div>
          </template>
        </SettingsList>

        <Card v-if="hasDesktopSyncApi && hostState.error">
          <div class="error-text">{{ hostState.error }}</div>
        </Card>
        <Card v-else-if="!hasDesktopSyncApi && connection.error">
          <div class="error-text">{{ connection.error }}</div>
        </Card>
      </div>
      </div>
    </template>
  </FormContainer>
</template>

<style scoped>
.sync-wrapper {
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

.sync-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.address-section-label {
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
.client-actions {
  padding: 16px;
  display: flex;
  justify-content: flex-end;
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

}

@media (max-width: 420px) {
  .sync-wrapper {
    max-width: none;
  }

  .sync-overview {
    padding: 12px 12px 10px;
  }
}
</style>
