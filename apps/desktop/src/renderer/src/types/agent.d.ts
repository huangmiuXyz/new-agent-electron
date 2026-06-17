export * from '@agent-qi/types/agent'

declare global {
  interface Agent {
    tags?: string[]
    builtinToolsRequireApproval?: string[]
    execCommandRunInBackground?: boolean
    allowedSubAgents?: string[]
    builtinSkills?: string[]
    enabledSkills?: string[]
  }
}

export {}
