export * from '@agent-qi/types/agent'

declare global {
  interface Agent {
    builtinToolsRequireApproval?: string[]
  }
}

export {}
