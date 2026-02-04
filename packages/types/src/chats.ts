declare global {
  interface Chat {
    id: string
    title: string
    messages: BaseMessage[]
    createdAt: number
    agentId?: string // 关联的智能体ID
    isTemp?: boolean // 是否为临时会话
    pendingMessages?: PendingMessage[] // 预发送队列
  }
  interface PendingMessage {
    id: string
    parts: Array<import('ai').FileUIPart | import('ai').TextUIPart>
    timestamp: number
  }

}

export { }
