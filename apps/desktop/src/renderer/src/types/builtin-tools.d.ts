export * from '@agent-qi/types/builtin-tools'

declare global {
  interface FunctionsApplyPatchInput {
    patch: string
  }

  interface FunctionsExecCommandParameters {
    cmd: string
    workdir?: string
    shell?: string
    yield_time_ms?: number
    max_output_tokens?: number
    login?: boolean
    tty?: boolean
    sandbox_permissions?: 'use_default' | 'require_escalated' | string
    justification?: string
    prefix_rule?: string[]
    [key: string]: unknown
  }
}
