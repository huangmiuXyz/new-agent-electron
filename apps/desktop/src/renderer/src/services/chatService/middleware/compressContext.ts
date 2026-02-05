import type { LanguageModelV3Middleware } from '@ai-sdk/provider'

export const createCompressContextMiddleware = (): LanguageModelV3Middleware => {
    return {
        specificationVersion: 'v3',
        transformParams: async ({ params }) => {
            if (!Array.isArray(params.prompt)) {
                return params
            }

            const messages = params.prompt

            let lastCompressedIndex = -1
            let lastCompressedContent = ''

            for (let i = 0; i < messages.length; i++) {
                const msg = messages[i]
                if (msg.role === 'system' && msg.content) {
                    const content = typeof msg.content === 'string' ? msg.content : ''
                    if (content.includes('[上下文已压缩]')) {
                        lastCompressedIndex = i
                        lastCompressedContent = content
                    }
                }
            }

            if (lastCompressedIndex === -1) {
                return params
            }
            let originalSystemPrompt: typeof messages[0] | null = null
            for (let i = 0; i < lastCompressedIndex; i++) {
                const msg = messages[i]
                if (msg.role === 'system') {
                    const content = typeof msg.content === 'string' ? msg.content : ''
                    if (!content.includes('[上下文已压缩]')) {
                        originalSystemPrompt = msg
                        break
                    }
                }
            }
            const compressedMessage = {
                role: 'system' as const,
                content: lastCompressedContent
            }

            const recentMessages = messages.slice(lastCompressedIndex + 1)

            const newMessages: typeof messages = []
            if (originalSystemPrompt) {
                newMessages.push(originalSystemPrompt)
            }
            newMessages.push(compressedMessage)
            newMessages.push(...recentMessages)

            return {
                ...params,
                prompt: newMessages
            }
        }
    }
}
