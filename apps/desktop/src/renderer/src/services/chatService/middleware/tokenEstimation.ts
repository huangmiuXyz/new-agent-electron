import type { LanguageModelMiddleware } from 'ai'
import { estimateTextTokens, serializeV4PromptForTokenEstimation, serializeV4ToolsForTokenEstimation } from '../tokenUsage'

export type TokenEstimateResult = {
  promptTokens: number
  toolTokens: number
  total: number
}

export const createTokenEstimationMiddleware = (
  onEstimate?: (result: TokenEstimateResult) => void
): LanguageModelMiddleware => {
  return {
    specificationVersion: 'v4',
    transformParams: async ({ params }) => {
      const promptText = serializeV4PromptForTokenEstimation(params.prompt as unknown[])
      const promptTokens = promptText ? estimateTextTokens(promptText) + 4 : 0

      const toolsText = serializeV4ToolsForTokenEstimation(params.tools as unknown[] | undefined)
      const toolTokens = toolsText ? estimateTextTokens(toolsText) + 2 : 0

      onEstimate?.({
        promptTokens,
        toolTokens,
        total: promptTokens + toolTokens
      })

      return params
    }
  }
}
