import type {
  HandleLLMNewTokenCallbackFields,
  NewTokenIndices
} from '@langchain/core/callbacks/base'
import type { ChatGenerationChunk } from '@langchain/core/outputs'
import { AIMessageChunk } from '@langchain/core/messages'

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

export class StreamHandler implements IStreamHandler {
  handleToken(
    _token: string,
    _idx: NewTokenIndices,
    _runId: string,
    _parentRunId: string | undefined,
    _tags: string[] | undefined,
    fields: HandleLLMNewTokenCallbackFields | undefined,
    content: any[],
    additional_kwargs: any
  ): void {
    const chunk = (fields?.chunk as ChatGenerationChunk).message as AIMessageChunk

    // 处理文本内容
    if (chunk.content) {
      if (typeof chunk.content === 'string') {
        content[0].text += chunk.content
      } else if (Array.isArray(chunk.content)) {
        chunk.content.forEach((c) => {
          if (c.type === 'text') content[0].text += c.text
        })
      }
    }

    // 处理推理内容
    const reasoning = chunk.additional_kwargs?.reasoning_content as string
    if (reasoning) {
      additional_kwargs.reasoning_content += reasoning
    }
  }
}
