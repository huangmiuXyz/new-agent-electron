export * from '@agent-qi/types/chats'

declare global {
  type SubTaskStatus = 'pending' | 'running' | 'completed' | 'failed'

  interface SubTaskInfo {
    id: string
    task: string
    status: SubTaskStatus
    assignedByChatId: string
    assignedByAgentId?: string
    assignedToAgentId?: string
    assignedAt: number
    startedAt?: number
    completedAt?: number
    result?: string
    error?: string
  }

  interface Chat {
    parentChatId?: string
    subTask?: SubTaskInfo
    providerId?: string
    modelId?: string
    compressedContext?: {
      content: string
      compressedUpToIndex?: number
      updatedAt: number
      provider: string
      model: string
      loading?: boolean
    }
  }
}

export { }
