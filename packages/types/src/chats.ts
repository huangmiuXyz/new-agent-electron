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
    subTaskResultSubmitted?: boolean
  }

  interface Chat {
    id: string
    title: string
    messages: BaseMessage[]
    compressedContext?: {
      content: string
      compressedUpToIndex?: number
      updatedAt: number
      provider: string
      model: string
      loading?: boolean
    }
    createdAt: number
    agentId?: string // 关联的智能体ID
    providerId?: string // 会话绑定的模型提供商ID
    modelId?: string // 会话绑定的模型ID
    isTemp?: boolean // 是否为临时会话
    pendingMessages?: PendingMessage[] // 预发送队列
    toolFeaturesEnabled?: boolean // 本对话是否启用技能、内置工具和MCP，默认启用
    parentChatId?: string // 父会话ID，存在则为子智能体会话
    subTask?: SubTaskInfo // 子任务信息（仅子会话）
  }
  interface PendingMessage {
    id: string
    parts: Array<import('ai').FileUIPart | import('ai').TextUIPart>
    timestamp: number
  }

  interface ChatSummary {
    id: string
    title: string
    createdAt: number
    updatedAt: number
    agentId?: string
    providerId?: string
    modelId?: string
    isTemp?: boolean
    parentChatId?: string
    subTask?: SubTaskInfo
    toolFeaturesEnabled?: boolean
    compressedContext?: Chat['compressedContext']
    messageCount: number
    lastMessageAt?: number
    lastMessagePreview?: string
  }

  interface ChatMessageRecord {
    id: string
    chatId: string
    role: BaseMessage['role']
    parts: BaseMessage['parts']
    metadata?: MetaData
    createdAt: number
    updatedAt: number
    order: number
  }

  interface LoadedMessageWindow {
    chatId: string
    messages: BaseMessage[]
    hasMoreBefore: boolean
    oldestOrder?: number
    newestOrder?: number
  }

  interface ChatRepositorySnapshot {
    schemaVersion: number
    summaries: ChatSummary[]
    messagesByChatId: Record<string, ChatMessageRecord[]>
    activeChatId: string | null
    chatDrafts: Record<string, string>
  }

}

export { }
