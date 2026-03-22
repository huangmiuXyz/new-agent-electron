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
    parentChatId?: string // 父会话ID，存在则为子智能体会话
    subTask?: SubTaskInfo // 子任务信息（仅子会话）
  }
  interface PendingMessage {
    id: string
    parts: Array<import('ai').FileUIPart | import('ai').TextUIPart>
    timestamp: number
  }

}

export { }
