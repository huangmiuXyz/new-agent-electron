import { chatRepository } from '@renderer/services/chatRepository'

let resolveRestore: () => void
const restorePromise = new Promise<void>((resolve) => {
  resolveRestore = resolve
})

type SyncConnectionState = {
  serverUrl: string
  connected: boolean
  lastSyncedAt?: number
  error?: string
}

type SyncSnapshotPayload = {
  chats: Chat[]
  activeChatId: string | null
  providers: Provider[]
  providerOrder: string[]
  agents: Agent[]
  updatedAt: number
  source: string
}

type SyncDiffSummary = {
  messageChanges: number
  chatChanges: number
  providerChanges: number
  agentChanges: number
}

const normalizeUrl = (input: string) => {
  const trimmed = input.trim()
  if (!trimmed) return ''

  const extracted = trimmed.match(/https?:\/\/[^\s]+/i)?.[0] || trimmed
  let candidate = extracted.replace(/^[^a-zA-Z0-9]+/, '').replace(/[^\S\r\n]+/g, '')

  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `http://${candidate}`
  }

  try {
    const parsed = new URL(candidate)
    return parsed.toString().replace(/\/+$/, '')
  } catch {
    return ''
  }
}

const readJsonOrThrow = async <T>(response: Response, errorPrefix: string): Promise<T> => {
  if (!response.ok) {
    throw new Error(`${errorPrefix}: ${response.status}`)
  }

  const contentType = response.headers.get('content-type') || ''
  const text = await response.text()

  if (!contentType.includes('application/json')) {
    throw new Error('同步地址返回了网页内容，请确认填写的是电脑端同步地址（例如 http://192.168.x.x:41235）')
  }

  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error('同步服务返回了非 JSON 数据，请检查同步地址是否正确')
  }
}

const clonePersistedState = (
  state: {
    chats: Chat[]
    activeChatId: string | null
    providers: Provider[]
    providerOrder: string[]
    agents: Agent[]
  },
  source: string
): SyncSnapshotPayload =>
  JSON.parse(
    JSON.stringify({
      chats: state.chats,
      activeChatId: state.activeChatId,
      providers: state.providers,
      providerOrder: state.providerOrder,
      agents: state.agents,
      updatedAt: Date.now(),
      source
    })
  ) as SyncSnapshotPayload

const getChatMetaHash = (chat: Chat) =>
  JSON.stringify({
    id: chat.id,
    title: chat.title,
    createdAt: chat.createdAt,
    agentId: chat.agentId,
    providerId: chat.providerId,
    modelId: chat.modelId,
    isTemp: chat.isTemp,
    pendingMessages: chat.pendingMessages,
    parentChatId: chat.parentChatId,
    subTask: chat.subTask
  })

const diffSnapshots = (localSnapshot: SyncSnapshotPayload, remoteSnapshot: SyncSnapshotPayload): SyncDiffSummary => {
  const localChats = new Map(localSnapshot.chats.map((chat) => [chat.id, chat]))
  const remoteChats = new Map(remoteSnapshot.chats.map((chat) => [chat.id, chat]))
  const chatIds = new Set([...localChats.keys(), ...remoteChats.keys()])

  let chatChanges = 0
  let messageChanges = 0
  let providerChanges = 0
  let agentChanges = 0

  chatIds.forEach((chatId) => {
    const localChat = localChats.get(chatId)
    const remoteChat = remoteChats.get(chatId)

    if (!localChat || !remoteChat) {
      chatChanges += 1
      messageChanges += localChat?.messages.length || remoteChat?.messages.length || 0
      return
    }

    if (getChatMetaHash(localChat) !== getChatMetaHash(remoteChat)) {
      chatChanges += 1
    }

    const localMessages = new Map(localChat.messages.map((message) => [message.id, JSON.stringify(message)]))
    const remoteMessages = new Map(remoteChat.messages.map((message) => [message.id, JSON.stringify(message)]))
    const messageIds = new Set([...localMessages.keys(), ...remoteMessages.keys()])

    messageIds.forEach((messageId) => {
      if (localMessages.get(messageId) !== remoteMessages.get(messageId)) {
        messageChanges += 1
      }
    })
  })

  const localProviders = new Map(localSnapshot.providers.map((provider) => [provider.id, provider]))
  const remoteProviders = new Map(remoteSnapshot.providers.map((provider) => [provider.id, provider]))
  const providerIds = new Set([...localProviders.keys(), ...remoteProviders.keys()])

  providerIds.forEach((providerId) => {
    if (
      JSON.stringify(localProviders.get(providerId) || null) !==
      JSON.stringify(remoteProviders.get(providerId) || null)
    ) {
      providerChanges += 1
    }
  })

  if (JSON.stringify(localSnapshot.providerOrder) !== JSON.stringify(remoteSnapshot.providerOrder)) {
    providerChanges += 1
  }

  const localAgents = new Map((localSnapshot.agents || []).map((agent) => [agent.id, agent]))
  const remoteAgents = new Map((remoteSnapshot.agents || []).map((agent) => [agent.id, agent]))
  const agentIds = new Set([...localAgents.keys(), ...remoteAgents.keys()])

  agentIds.forEach((agentId) => {
    if (
      JSON.stringify(localAgents.get(agentId) || null) !==
      JSON.stringify(remoteAgents.get(agentId) || null)
    ) {
      agentChanges += 1
    }
  })

  return { messageChanges, chatChanges, providerChanges, agentChanges }
}

const createDeviceId = () => globalThis.crypto?.randomUUID?.() || `device-${Date.now()}`

export const useSyncStore = defineStore(
  'sync',
  () => {
    const hostEnabled = ref(true)
    const profile = ref({
      displayName: '',
      deviceId: ''
    })
    const hostState = ref<SyncHostState>({
      running: false,
      port: 41235,
      displayName: '',
      deviceId: '',
      urls: [],
      connectedClients: 0
    })
    const connection = ref<SyncConnectionState>({
      serverUrl: '',
      connected: false
    })
    const endpoints = ref<SyncEndpoint[]>([])
    const selectedEndpointId = ref('')
    const selectedEndpointSnapshot = ref<SyncSnapshotPayload | null>(null)
    const diffSummary = ref<SyncDiffSummary>({ messageChanges: 0, chatChanges: 0, providerChanges: 0, agentChanges: 0 })
    const initialized = ref(false)
    const isPulling = ref(false)
    const hasDesktopSyncApi = computed(() => Boolean(window.api?.sync))
    const chatsStore = useChatsStores()
    const settingsStore = useSettingsStore()

    let unsubscribe: (() => void) | null = null
    let eventSource: EventSource | null = null
    let publishTimer: ReturnType<typeof setTimeout> | null = null

    const selfDeviceId = computed(() => {
      return hasDesktopSyncApi.value ? hostState.value.deviceId : profile.value.deviceId
    })

    const selectedEndpoint = computed(() => {
      return endpoints.value.find((endpoint) => endpoint.deviceId === selectedEndpointId.value) || null
    })

    const getDesktopSyncApi = () => {
      const api = window.api?.sync
      if (!api) throw new Error('当前环境不支持桌面同步服务')
      return api
    }

    const ensureDeviceId = () => {
      if (!profile.value.deviceId) {
        profile.value.deviceId = createDeviceId()
      }
    }

    const buildLocalSnapshot = async () => {
      const agentStore = useAgentStore()
      const summaries = chatsStore.chatSummaries
      const chats = await Promise.all(
        summaries.map(async (summary) => {
          const messages = await chatRepository.loadAllMessages(summary.id)
          return {
            id: summary.id,
            title: summary.title,
            messages,
            createdAt: summary.createdAt,
            agentId: summary.agentId,
            providerId: summary.providerId,
            modelId: summary.modelId,
            isTemp: summary.isTemp,
            parentChatId: summary.parentChatId,
            subTask: summary.subTask,
            toolFeaturesEnabled: summary.toolFeaturesEnabled,
            compressedContext: summary.compressedContext
          }
        })
      )
      return clonePersistedState(
        {
          chats,
          activeChatId: chatsStore.activeChatId,
          providers: settingsStore.providers.filter((provider) => !provider.pluginName),
          providerOrder: settingsStore.providerOrder,
          agents: agentStore.agents
        },
        hasDesktopSyncApi.value ? 'desktop' : 'mobile'
      )
    }

    const recomputeDiff = async () => {
      const snapshot = selectedEndpointSnapshot.value
      if (!snapshot) {
        diffSummary.value = { messageChanges: 0, chatChanges: 0, providerChanges: 0, agentChanges: 0 }
        return
      }
      diffSummary.value = diffSnapshots(await buildLocalSnapshot(), snapshot)
    }

    const scheduleAutoPublish = () => {
      const canPublish = hasDesktopSyncApi.value ? hostState.value.running : connection.value.connected
      if (!canPublish || !selfDeviceId.value) return
      if (publishTimer) clearTimeout(publishTimer)
      publishTimer = setTimeout(() => {
        publishTimer = null
        void publishLocalSnapshot().catch((error) => {
          connection.value.error = error instanceof Error ? error.message : String(error)
        })
      }, 300)
    }

    watch(
      () => [chatsStore.chatSummaries, chatsStore.activeChatId],
      async () => {
        await recomputeDiff()
        scheduleAutoPublish()
      },
      { deep: true }
    )

    watch(
      () => [settingsStore.providers, settingsStore.providerOrder],
      async () => {
        await recomputeDiff()
        scheduleAutoPublish()
      },
      { deep: true }
    )

    watch(
      () => {
        const agentStore = useAgentStore()
        return agentStore.agents
      },
      async () => {
        await recomputeDiff()
        scheduleAutoPublish()
      },
      { deep: true }
    )

    const updateEndpoints = (nextEndpoints: SyncEndpoint[]) => {
      endpoints.value = nextEndpoints
      if (!selectedEndpointId.value) {
        selectedEndpointId.value =
          nextEndpoints.find((endpoint) => endpoint.deviceId !== selfDeviceId.value)?.deviceId ||
          nextEndpoints[0]?.deviceId ||
          ''
      }
    }

    const refreshEndpointsDesktop = async () => {
      const list = await getDesktopSyncApi().listEndpoints()
      updateEndpoints(list)
    }

    const refreshEndpointsRemote = async () => {
      const serverUrl = normalizeUrl(connection.value.serverUrl)
      if (!serverUrl) return
      const response = await fetch(`${serverUrl}/api/sync/endpoints`)
      const list = await readJsonOrThrow<SyncEndpoint[]>(response, '无法获取端点列表')
      updateEndpoints(list)
    }

    const fetchEndpointSnapshot = async (deviceId: string) => {
      if (!deviceId) {
        selectedEndpointSnapshot.value = null
        await recomputeDiff()
        return null
      }

      let snapshot: SyncSnapshotPayload | null = null
      if (hasDesktopSyncApi.value) {
        snapshot = (await getDesktopSyncApi().getEndpointSnapshot(deviceId)) as SyncSnapshotPayload | null
      } else {
        const serverUrl = normalizeUrl(connection.value.serverUrl)
        if (!serverUrl) return null
        const response = await fetch(`${serverUrl}/api/sync/endpoints/${deviceId}/snapshot`)
        snapshot = await readJsonOrThrow<SyncSnapshotPayload | null>(response, '无法获取端点快照')
      }

      selectedEndpointSnapshot.value = snapshot
      await recomputeDiff()
      return snapshot
    }

    const publishLocalSnapshot = async () => {
      const snapshot = await buildLocalSnapshot()
      const payload = {
        deviceId: selfDeviceId.value,
        displayName: profile.value.displayName || hostState.value.displayName || selfDeviceId.value,
        snapshot
      }

      if (hasDesktopSyncApi.value) {
        await getDesktopSyncApi().publishSnapshot(payload)
        await refreshEndpointsDesktop()
      } else {
        const serverUrl = normalizeUrl(connection.value.serverUrl)
        if (!serverUrl) throw new Error('请输入同步地址')
        const response = await fetch(`${serverUrl}/api/sync/snapshot`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ...payload,
            source: snapshot.source
          })
        })
        if (!response.ok) {
          throw new Error(`发布失败: ${response.status}`)
        }
        await refreshEndpointsRemote()
      }
    }

    const registerRemoteEndpoint = async () => {
      const serverUrl = normalizeUrl(connection.value.serverUrl)
      if (!serverUrl) throw new Error('请输入同步地址')
      const response = await fetch(`${serverUrl}/api/sync/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          deviceId: profile.value.deviceId,
          displayName: profile.value.displayName || profile.value.deviceId,
          source: 'mobile'
        })
      })
      if (!response.ok) {
        throw new Error(`注册失败: ${response.status}`)
      }
    }

    const handleDesktopEvent = (event: SyncEvent) => {
      if (event.type === 'state') {
        hostState.value = event.state
        return
      }
      if (event.type === 'directory') {
        updateEndpoints(event.endpoints)
        if (selectedEndpointId.value) {
          void fetchEndpointSnapshot(selectedEndpointId.value)
        }
      }
    }

    const startDesktopHost = async () => {
      unsubscribe?.()
      const syncApi = getDesktopSyncApi()
      unsubscribe = syncApi.onEvent(handleDesktopEvent)
      hostState.value = await syncApi.startHost({
        displayName: profile.value.displayName
      })
      profile.value.deviceId = hostState.value.deviceId
      if (!profile.value.displayName) {
        profile.value.displayName = hostState.value.displayName
      }
      await publishLocalSnapshot()
    }

    const stopDesktopHost = async () => {
      unsubscribe?.()
      unsubscribe = null
      endpoints.value = []
      selectedEndpointId.value = ''
      selectedEndpointSnapshot.value = null
      await recomputeDiff()
      hostState.value = await getDesktopSyncApi().stopHost()
    }

    const connectToRemoteHost = async () => {
      ensureDeviceId()
      const serverUrl = normalizeUrl(connection.value.serverUrl)
      if (!serverUrl) {
        connection.value.error = '请输入同步地址'
        return
      }

      eventSource?.close()
      const statusResponse = await fetch(`${serverUrl}/api/sync/status`)
      await readJsonOrThrow<SyncHostState>(statusResponse, '无法连接到同步服务')

      await registerRemoteEndpoint()
      await publishLocalSnapshot()

      eventSource = new EventSource(`${serverUrl}/api/sync/events`)
      eventSource.addEventListener('directory', (rawEvent) => {
        const payload = JSON.parse((rawEvent as MessageEvent).data) as SyncEvent
        if (payload.type === 'directory') {
          updateEndpoints(payload.endpoints)
          if (selectedEndpointId.value) {
            void fetchEndpointSnapshot(selectedEndpointId.value)
          }
        }
      })
      eventSource.addEventListener('state', () => {
        connection.value.connected = true
        connection.value.error = undefined
      })
      eventSource.onerror = () => {
        connection.value.connected = false
        connection.value.error = '同步连接已断开'
      }

      connection.value.connected = true
      connection.value.error = undefined
      await refreshEndpointsRemote()
      if (selectedEndpointId.value) {
        await fetchEndpointSnapshot(selectedEndpointId.value)
      }
    }

    const disconnectRemoteHost = () => {
      eventSource?.close()
      eventSource = null
      connection.value.connected = false
      endpoints.value = []
      selectedEndpointId.value = ''
      selectedEndpointSnapshot.value = null
      recomputeDiff()
    }

    const initialize = async () => {
      if (initialized.value) return
      initialized.value = true
      ensureDeviceId()

      if (hasDesktopSyncApi.value && hostEnabled.value) {
        await startDesktopHost()
      }
    }

    const setHostEnabled = async (value: boolean) => {
      hostEnabled.value = value
      if (!hasDesktopSyncApi.value) return
      if (value) {
        await startDesktopHost()
      } else {
        await stopDesktopHost()
      }
    }

    const updateDisplayName = async (displayName: string) => {
      profile.value.displayName = displayName
      if (hasDesktopSyncApi.value && hostEnabled.value) {
        hostState.value = await getDesktopSyncApi().updateProfile({ displayName })
        await publishLocalSnapshot()
      }
    }

    const setServerUrl = (serverUrl: string) => {
      connection.value.serverUrl = serverUrl
    }

    const connect = async () => {
      if (hasDesktopSyncApi.value) return
      await connectToRemoteHost()
    }

    const disconnect = () => {
      if (hasDesktopSyncApi.value) return
      disconnectRemoteHost()
    }

    const selectEndpoint = async (deviceId: string) => {
      selectedEndpointId.value = deviceId
      await fetchEndpointSnapshot(deviceId)
    }

    const pullSelectedEndpoint = async (options?: { chats?: boolean; providers?: boolean; agents?: boolean }) => {
      if (!selectedEndpointId.value) return
      await pullEndpoint(selectedEndpointId.value, options)
    }

    const pullEndpoint = async (deviceId: string, options?: { chats?: boolean; providers?: boolean; agents?: boolean }) => {
      if (!deviceId) return
      const shouldPullChats = options?.chats ?? true
      const shouldPullProviders = options?.providers ?? true
      const shouldPullAgents = options?.agents ?? true
      if (!shouldPullChats && !shouldPullProviders && !shouldPullAgents) return
      isPulling.value = true
      try {
        selectedEndpointId.value = deviceId
        const snapshot = await fetchEndpointSnapshot(deviceId)
        if (!snapshot) return
        if (shouldPullChats) {
          await chatsStore.replacePersistedState({
            chats: snapshot.chats,
            activeChatId: snapshot.activeChatId
          })
        }
        if (shouldPullProviders) {
          settingsStore.replaceSyncProviders(snapshot.providers || [], snapshot.providerOrder || [])
        }
        if (shouldPullAgents) {
          const agentStore = useAgentStore()
          agentStore.replaceAgents(snapshot.agents || [])
        }
        connection.value.lastSyncedAt = Date.now()
        await publishLocalSnapshot()
      } finally {
        isPulling.value = false
      }
    }

    return {
      hostEnabled,
      profile,
      hostState,
      connection,
      endpoints,
      selectedEndpointId,
      selectedEndpoint,
      diffSummary,
      hasDesktopSyncApi,
      selfDeviceId,
      isPulling,
      initialize,
      setHostEnabled,
      updateDisplayName,
      setServerUrl,
      connect,
      disconnect,
      selectEndpoint,
      pullEndpoint,
      pullSelectedEndpoint,
      isAfterRestore: restorePromise
    }
  },
  {
    persist: {
      storage: indexedDBStorage,
      paths: ['hostEnabled', 'profile', 'connection.serverUrl'],
      afterRestore: () => {
        resolveRestore()
      }
    }
  }
)
