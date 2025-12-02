import type { BaseMessage } from '@langchain/core/messages'
import { SystemMessage } from '@langchain/core/messages'
import { AIMessage } from '@langchain/core/messages'

export interface IMessageProcessor {
  processMessages(messages: BaseMessage[], agentSystemPrompt?: string): BaseMessage[]
}

export class MessageProcessor implements IMessageProcessor {
  processMessages(messages: BaseMessage[], agentSystemPrompt?: string): BaseMessage[] {
    // 过滤无效的AI消息
    let filteredMessages = messages.filter((msg) => {
      if (!AIMessage.isInstance(msg)) return true

      const hasText = this.hasMessageText(msg)
      const hasTools = msg.tool_calls && msg.tool_calls.length > 0
      return hasText || hasTools
    })

    // 添加系统提示
    if (agentSystemPrompt && filteredMessages.length > 0) {
      filteredMessages = this.addSystemPrompt(filteredMessages, agentSystemPrompt)
    }

    return filteredMessages
  }

  private hasMessageText(message: AIMessage): boolean {
    if (typeof message.content === 'string') {
      return message.content.trim() !== ''
    }

    if (Array.isArray(message.content)) {
      const text = message.content[0]?.text as string
      return Boolean(text && text.trim() !== '')
    }

    return false
  }

  private addSystemPrompt(messages: BaseMessage[], systemPrompt: string): BaseMessage[] {
    if (!messages[0] || !SystemMessage.isInstance(messages[0])) {
      return [new SystemMessage({ content: systemPrompt }), ...messages]
    }
    return messages
  }
}
