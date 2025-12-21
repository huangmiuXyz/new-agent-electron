declare global {
  interface Chat {
    id: string
    title: string
    messages: BaseMessage[]
    createdAt: number
    agentId?: string // 关联的智能体ID
    isTemp?: boolean // 是否为临时会话
  }
}

export {}
