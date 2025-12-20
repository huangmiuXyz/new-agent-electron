import { z } from 'zod/v4'

// https://api-docs.agentqi.com/quick_start/pricing
export type AgentQIChatModelId = 'agentqi-chat' | 'agentqi-reasoner' | (string & {})

export const agentqiChatOptions = z.object({
  /**
   * Type of thinking to use. Defaults to `enabled`.
   */
  thinking: z
    .object({
      type: z.enum(['enabled', 'disabled']).optional()
    })
    .optional()
})

export type AgentQIChatOptions = z.infer<typeof agentqiChatOptions>
