export * from '@agent-qi/types/agent'

declare global {
  interface Agent {
    tags?: string[]
    builtinToolsRequireApproval?: string[]
  }
}

export {}
