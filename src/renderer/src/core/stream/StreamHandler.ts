import type {
  HandleLLMNewTokenCallbackFields,
  NewTokenIndices
} from '@langchain/core/callbacks/base'
import { AIMessage, AIMessageChunk } from '@langchain/core/messages'

export interface IStreamHandler {
  handleToken(
    token: string,
    idx: NewTokenIndices,
    runId: string,
    parentRunId: string | undefined,
    tags: string[] | undefined,
    fields: HandleLLMNewTokenCallbackFields | undefined,
    content: any[],
    additional_kwargs: any
  ): void
}

export class StreamHandler {
  handleToken(
    chunk: AIMessageChunk,
    content: any[],
    aiMsg: AIMessage,
    additional_kwargs: Additional_kwargs
  ): void {
    if (chunk.content) {
      if (typeof chunk.content === 'string') {
        content[0].text += chunk.content
      } else if (Array.isArray(chunk.content)) {
        chunk.content.forEach((c) => {
          if (c.type === 'text') content[0].text += c.text
        })
      }
    }

    const reasoning = chunk.additional_kwargs?.reasoning_content as string
    if (reasoning) {
      additional_kwargs.reasoning_content += reasoning
    }
    if (chunk.tool_calls?.length) {
      aiMsg.tool_calls = chunk.tool_calls
    }
  }
}
