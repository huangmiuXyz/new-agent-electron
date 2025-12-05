declare global {
  interface Chat {
    id: string
    title: string
    messages: BaseMessage[]
    createdAt: number
    agentId?: string // 关联的智能体ID
  }
}

export {}
