import {
  generateText as _generateText,
  generateImage as _generateImage,
  experimental_generateVideo as _generateVideo,
  streamText as _streamText,
  convertToModelMessages,
  validateUIMessages
} from 'ai'
import { messageApi } from '@renderer/utils/messages'
import { onUseAIBefore } from '@renderer/utils/onuseAIbefore'
import { createRegistry } from './registry'
import { buildTranslationPrompt } from './systemPrompts'
import { normalizeInlineFilePartUrls, sanitizeUIMessages } from './utils'
import type {
  ChatServiceOptions,
  GenerateImagePrompt,
  ImageGenerateOptions,
  VideoGenerateOptions
} from './types'

export const createGenerationService = () => {
  const generateText = async (
    prompt: string,
    {
      model,
      apiKey,
      baseURL,
      provider,
      providerType,
      tools,
      toolChoice = 'auto'
    }: ChatServiceOptions
  ) => {
    await onUseAIBefore({ model, providerType, apiKey, baseURL })
    try {
      const result = await _generateText({
        model: createRegistry({ apiKey, baseURL, name: provider }).languageModel(
          `${providerType}:${model}`
        ),
        tools,
        prompt,
        toolChoice,
        frequencyPenalty: 2
      })
      return result
    } catch (error) {
      messageApi.error((error as Error).message)
      throw error
    }
  }

  const generateTextWithMessages = async (
    messages: BaseMessage[],
    {
      model,
      apiKey,
      baseURL,
      provider,
      providerType,
      tools,
      toolChoice = 'auto'
    }: ChatServiceOptions
  ) => {
    await onUseAIBefore({ model, providerType, apiKey, baseURL })
    try {
      const sanitizedMessages = sanitizeUIMessages(messages as UIMessage[])
      const validatedMessages = await validateUIMessages({
        messages: sanitizedMessages,
        tools
      })
      const normalizedMessages = normalizeInlineFilePartUrls(sanitizedMessages)
      const modelMessages = await convertToModelMessages(normalizedMessages)

      const result = await _generateText({
        model: createRegistry({ apiKey, baseURL, name: provider }).languageModel(
          `${providerType}:${model}`
        ),
        tools,
        messages: modelMessages,
        toolChoice,
        frequencyPenalty: 2
      })
      return result
    } catch (error) {
      messageApi.error((error as Error).message)
      throw error
    }
  }

  const streamText = async (
    prompt: string,
    {
      model,
      apiKey,
      baseURL,
      provider,
      providerType,
      tools,
      toolChoice = 'auto',
      onData,
      onFinish
    }: ChatServiceOptions & { onData: (text: string) => void; onFinish: () => void }
  ) => {
    await onUseAIBefore({ model, providerType, apiKey, baseURL })
    try {
      const result = _streamText({
        model: createRegistry({ apiKey, baseURL, name: provider }).languageModel(
          `${providerType}:${model}`
        ),
        tools,
        prompt,
        toolChoice,
        onFinish
      })
      for await (const data of result.textStream) {
        onData(data)
      }
    } catch (error) {
      messageApi.error((error as Error).message)
      throw error
    }
  }

  const generateImage = async (
    prompt: string | GenerateImagePrompt,
    {
      model,
      apiKey,
      baseURL,
      provider,
      providerType,
      n,
      size,
      aspectRatio,
      seed,
      providerOptions
    }: ImageGenerateOptions & ChatServiceOptions
  ) => {
    await onUseAIBefore({ model, providerType, apiKey, baseURL })
    try {
      const imageProviderName = providerType === 'openai-compatible' ? providerType : provider
      const result = await _generateImage({
        model: createRegistry({ apiKey, baseURL, name: imageProviderName }).imageModel(
          `${providerType}:${model}`
        ),
        prompt,
        n,
        size: size as `${number}x${number}`,
        aspectRatio: aspectRatio as `${number}:${number}`,
        seed,
        providerOptions
      })
      return result
    } catch (error) {
      messageApi.error((error as Error).message)
      throw error
    }
  }

  const translateText = async (
    text: string,
    targetLanguage: string = '中文',
    { model, apiKey, baseURL, provider, providerType }: ChatServiceOptions,
    abortSignal?: AbortSignal,
    onChunk?: (chunk: string) => void,
    onReasoning?: (text: string) => void
  ) => {
    await onUseAIBefore({ model, providerType, apiKey, baseURL })
    const prompt = buildTranslationPrompt(text, targetLanguage)
    try {
      if (onChunk) {
        const stream = _streamText({
          model: createRegistry({ apiKey, baseURL, name: provider }).languageModel(
            `${providerType}:${model}`
          ),
          prompt,
          abortSignal
        })
        let full = ''
        for await (const part of stream.stream) {
          if (part.type === 'text-delta') {
            full += part.text
            onChunk(part.text)
          } else if (part.type === 'reasoning-delta') {
            onReasoning?.(part.text || '')
          }
          await Promise.resolve()
        }
        return full
      } else {
        const result = await _generateText({
          model: createRegistry({ apiKey, baseURL, name: provider }).languageModel(
            `${providerType}:${model}`
          ),
          prompt,
          abortSignal
        })
        return result.text
      }
    } catch (error) {
      messageApi.error((error as Error).message)
      throw error
    }
  }

  const generateVideo = async (
    prompt: string,
    {
      model,
      apiKey,
      baseURL,
      provider,
      providerType,
      n,
      duration,
      resolution,
      aspectRatio,
      seed,
      providerOptions
    }: VideoGenerateOptions & ChatServiceOptions
  ) => {
    await onUseAIBefore({ model, providerType, apiKey, baseURL })
    try {
      const registry = createRegistry({ apiKey, baseURL, name: provider })
      const providerInstance = registry.getProvider(providerType)
      if (!providerInstance || typeof (providerInstance as any).video !== 'function') {
        throw new Error(`提供商 ${providerType} 不支持视频生成`)
      }

      const result = await _generateVideo({
        model: (providerInstance as any).video(model),
        prompt,
        n,
        duration,
        resolution,
        aspectRatio: aspectRatio as `${number}:${number}`,
        seed,
        providerOptions
      })
      return result
    } catch (error) {
      messageApi.error((error as Error).message)
      throw error
    }
  }

  const list_models = async ({ baseURL, apiKey, providerType, name }) => {
    await onUseAIBefore({ providerType, apiKey, baseURL })
    const registry = createRegistry({ apiKey, baseURL, name: name || providerType })
    const providerInstance = registry.getProvider(providerType)
    const listModelsResult = await providerInstance.listModels?.()
    return listModelsResult || []
  }

  return {
    generateText,
    generateTextWithMessages,
    streamText,
    generateImage,
    translateText,
    generateVideo,
    list_models
  }
}
