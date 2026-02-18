import type { LanguageModelV3Middleware } from '@ai-sdk/provider'

export const createToolMiddleware = (): LanguageModelV3Middleware => {

  return {
    specificationVersion: 'v3',
    transformParams: async ({ params }) => {
      const newPrompt = params.prompt.map((message) => {
        if (message.role === 'tool') {
          return {
            ...message,
            content: message.content.map((part) => {
              if (part.type === 'tool-result' && part.output.type === 'json' && typeof part.output?.value === 'object') {
                return {
                  ...part,
                  output: {
                    ...part.output,
                    value: { ...part.output.value, metadata: undefined }
                  }
                }
              }
              return part
            })
          }
        }
        return message
      })

      return {
        ...params,
        prompt: newPrompt
      }
    }
  }
}
