import { UIMessage, isToolUIPart } from 'ai'

const extractBase64PayloadFromDataUrl = (url: string): string | null => {
  const match = url.match(/^data:[^;,]+;base64,(.+)$/)
  return match?.[1] || null
}

/**
 * 清洗 UI 消息，移除没有对应结果的工具调用，以防止模型报错 "insufficient tool messages"。
 *
 * 过滤策略：
 * 1. 基础原则：
 *    - 始终保留有明确结果的工具调用 (output-available/error/denied)。
 *    - 始终移除未完成的工具调用 (input-streaming/available, executing)。
 *    - 始终移除历史消息（非最后一条）中的 approval-responded（因为如果没有结果，就是 broken history）。
 *
 * 2. 特殊场景：手动批准 (Manual Approval)
 *    - 如果触发本次请求的原因是用户点击了“允许”（isManualApproval 为 true），
 *      则必须保留该消息中所有的 approval-responded 和 approval-requested 状态。
 *    - 保留 approval-responded 是为了让 Agent 知道已批准并执行工具。
 *    - 保留 approval-requested 是为了让 Agent 知道还有其他未批准的请求（可能在后续处理或一次性处理），
 *      或者至少不破坏当前消息的完整性（如并行 Tool Calls）。
 *
 * 3. 其他场景：重试/继续 (Retry/Continue)
 *    - 此时应严格过滤所有未完成状态，确保发送给模型的是干净的历史记录。
 *
 * @param messages UI 消息列表
 * @param options 配置选项
 * @param options.isManualApproval 是否为手动批准场景（通常意味着最后一条消息是触发批准的消息）
 * @returns 清洗后的 UI 消息列表
 */
export function sanitizeUIMessages(
  messages: UIMessage[],
  options: { isManualApproval: boolean } = { isManualApproval: false }
): UIMessage[] {
  const lastIndex = messages.length - 1

  return messages.map((message, index) => {
    if (message.role !== 'assistant') return message

    const isLastMessage = index === lastIndex

    return {
      ...message,
      parts: message.parts.filter((part) => {
        // 如果不是工具调用部分，保留
        if (!isToolUIPart(part)) return true

        // 1. 始终保留有明确结果的工具调用
        if (
          part.state === 'output-available' ||
          part.state === 'output-error' ||
          part.state === 'output-denied'
        ) {
          return true
        }

        // 2. 特殊处理：手动批准场景
        // 仅当是最后一条消息（即包含用户刚刚操作的工具调用的消息）时生效
        if (options.isManualApproval && isLastMessage) {
          // 保留已批准的（等待执行）
          if (part.state === 'approval-responded') return true
          // 保留未批准的（等待用户操作），因为用户明确要求不能过滤
          if (part.state === 'approval-requested') return true
        }

        // 其他情况（如 executing, input-streaming 等，以及非手动批准场景下的 approval-responded/requested）统统过滤
        return false
      })
    }
  })
}

export function normalizeInlineFilePartUrls(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) => {
      if (part.type !== 'file' || typeof part.url !== 'string' || !part.url.startsWith('data:')) {
        return part
      }

      const base64Payload = extractBase64PayloadFromDataUrl(part.url)
      if (!base64Payload) {
        return part
      }

      return {
        ...part,
        url: base64Payload
      }
    })
  }))
}
