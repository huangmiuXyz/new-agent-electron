declare global {
  interface SyncHostState {
    running: boolean
    port: number
    displayName: string
    deviceId: string
    urls: string[]
    connectedClients: number
    snapshotUpdatedAt?: number
    error?: string
  }

  interface SyncSnapshot {
    chats: Chat[]
    activeChatId: string | null
    providers: Provider[]
    providerOrder: string[]
    updatedAt: number
    source: string
  }

  interface SyncEndpoint {
    deviceId: string
    displayName: string
    source: string
    lastSeenAt: number
    snapshotUpdatedAt?: number
    messageCount: number
    chatCount: number
  }

  type SyncEvent =
    | { type: 'state'; state: SyncHostState }
    | { type: 'directory'; endpoints: SyncEndpoint[] }
}

export {}
