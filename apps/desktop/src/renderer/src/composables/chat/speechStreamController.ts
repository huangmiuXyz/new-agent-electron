import type { Ref } from 'vue'
import type { FileUIPart, TextUIPart, ToolUIPart } from 'ai'
import { speechService, type TtsTextStreamSession } from '@renderer/services/speechService'
import { createSentenceSegmenter } from './sentenceSegmenter'

type SpeechStreamControllerOptions = {
  chatId: string
  speechEnabled: Ref<boolean>
  tts: ReturnType<typeof speechService>
  getChatAgent: () => Agent | null
  getMessageText: (message: BaseMessage) => string
  updateMessageMetadata: (chatId: string, messageId: string, metadata: MetaData) => void
  updateMessageAudioChunks: (chatId: string, messageId: string, audio: NonNullable<MetaData['audio']>) => void
}

export const createSpeechStreamController = ({
  chatId,
  speechEnabled,
  tts,
  getChatAgent,
  getMessageText,
  updateMessageMetadata,
  updateMessageAudioChunks
}: SpeechStreamControllerOptions) => {
  let processedText = ''
  let sentenceSegmenter = createSentenceSegmenter(getChatAgent()?.speechLanguage)
  let streamingSpeechSession: TtsTextStreamSession | null = null
  let streamingSpeechSessionPromise: Promise<TtsTextStreamSession | null> | null = null
  let streamingSpeechChunkIndex: number | null = null
  let speechProcessingQueue = Promise.resolve()

  const reset = (agent?: Agent | null) => {
    processedText = ''
    sentenceSegmenter = createSentenceSegmenter(agent?.speechLanguage || 'und')
  }

  const updateStreamingSpeechMetadata = (
    message: BaseMessage,
    session: TtsTextStreamSession,
    error?: string
  ) => {
    const chunk = session.getChunk()
    if (!message.metadata) message.metadata = {} as MetaData
    if (!message.metadata.audio) {
      message.metadata.audio = {
        chunks: [],
        voice: getChatAgent()?.speechVoice || '',
        model: chunk?.modelId || ''
      }
    }
    const audioMetadata = message.metadata.audio

    if (streamingSpeechChunkIndex === null) {
      streamingSpeechChunkIndex = audioMetadata.chunks.length
      audioMetadata.chunks.push({ data: '', text: session.getText() })
    }

    const target = audioMetadata.chunks[streamingSpeechChunkIndex]
    if (!target) return

    audioMetadata.chunks[streamingSpeechChunkIndex] = {
      ...target,
      text: session.getText(),
      data: chunk?.audioData || target.data || '',
      duration: chunk?.duration,
      error
    }
    if (message.metadata?.audio) {
      updateMessageAudioChunks(chatId, message.id, message.metadata.audio)
    }
  }

  const createStreamingSpeechSession = async (
    message: BaseMessage
  ): Promise<TtsTextStreamSession | null> => {
    if (streamingSpeechSession) return streamingSpeechSession
    if (streamingSpeechSessionPromise) return streamingSpeechSessionPromise

    const runtimeAgent = getChatAgent()
    const voice = runtimeAgent?.speechVoice
    const speechModel = runtimeAgent?.speechModel
    if (!voice || !speechModel?.modelId || !speechModel?.providerId) return null

    const rawOptions = runtimeAgent?.speechProviderOptions
    const providerOptions = rawOptions?.[speechModel.providerId] ?? rawOptions

    streamingSpeechSessionPromise = tts
      .createTextStream({
        messageId: message.id,
        modelId: speechModel.modelId,
        providerId: speechModel.providerId,
        voice,
        speed: runtimeAgent?.speechSpeed,
        language: runtimeAgent?.speechLanguage,
        providerOptions,
        agentId: runtimeAgent?.id
      })
      .then((session) => {
        streamingSpeechSession = session
        if (session) {
          updateStreamingSpeechMetadata(message, session)
        }
        return session
      })
      .finally(() => {
        streamingSpeechSessionPromise = null
      })

    return streamingSpeechSessionPromise
  }

  const appendStreamingSpeechText = async (message: BaseMessage, text: string) => {
    if (!text) return false
    const session = await createStreamingSpeechSession(message)
    if (!session) return false

    await session.appendText(text)
    updateStreamingSpeechMetadata(message, session)
    return true
  }

  const generateSpeech = async (text: string, message: BaseMessage) => {
    if (!text.trim() || !speechEnabled.value) return

    const runtimeAgent = getChatAgent()
    const voice = runtimeAgent?.speechVoice
    const speed = runtimeAgent?.speechSpeed
    const language = runtimeAgent?.speechLanguage
    const speechModel = runtimeAgent?.speechModel

    if (!voice || !speechModel?.modelId || !speechModel?.providerId) return

    const { modelId: targetModelId, providerId: targetProviderId } = speechModel
    const rawOptions = runtimeAgent?.speechProviderOptions
    const providerOptions = rawOptions?.[targetProviderId] ?? rawOptions

    if (!message.metadata) message.metadata = {} as MetaData
    if (!message.metadata.audio) {
      message.metadata.audio = { chunks: [], voice, model: targetModelId }
    }

    const chunks = message.metadata.audio.chunks
    const chunkIndex = chunks.length
    chunks.push({ data: '', text })

    updateMessageAudioChunks(chatId, message.id, message.metadata.audio)

    try {
      const chunk = await tts.generateAndPlay({
        text,
        messageId: message.id,
        modelId: targetModelId,
        providerId: targetProviderId,
        voice,
        speed,
        language,
        providerOptions,
        agentId: runtimeAgent?.id
      })

      if (chunk && message.metadata?.audio?.chunks[chunkIndex]) {
        message.metadata.audio.chunks[chunkIndex] = {
          ...message.metadata.audio.chunks[chunkIndex],
          data: chunk.audioData || '',
          duration: chunk.duration,
          error: undefined
        }
        updateMessageAudioChunks(chatId, message.id, message.metadata.audio)
      } else if (message.metadata?.audio?.chunks[chunkIndex]) {
        message.metadata.audio.chunks[chunkIndex].error = '生成失败：未返回音频数据'
        updateMessageAudioChunks(chatId, message.id, message.metadata.audio)
      }
          } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (message.metadata?.audio?.chunks[chunkIndex]) {
        message.metadata.audio.chunks[chunkIndex].error = `生成失败：${errorMessage}`
        updateMessageAudioChunks(chatId, message.id, message.metadata.audio)
      }
    }
  }

  const processStreamingSpeech = (
    message: BaseMessage | undefined,
    newParts: (TextUIPart | ToolUIPart | FileUIPart)[] | undefined
  ) => {
    if (!message || !newParts || message.role !== 'assistant' || !speechEnabled.value) return
    const mode = getChatAgent()?.speechMode as string
    if (mode === 'full') return

    const fullText = getMessageText(message)
    const currentText = fullText.slice(processedText.length)

    if (mode === 'sentence') {
      sentenceSegmenter.push(currentText, (sentence) => {
        generateSpeech(sentence, message)
      })
      processedText = fullText
    } else if (mode === 'paragraph') {
      const paragraphs = currentText.split(/\n+/)
      if (paragraphs.length > 1) {
        for (let i = 0; i < paragraphs.length - 1; i += 1) {
          const paragraph = paragraphs[i]
          if (paragraph.trim()) {
            generateSpeech(paragraph, message)
          }
          processedText += paragraphs[i] + '\n'
        }
      }
    }
  }

  const processQueued = (
    message: BaseMessage | undefined,
    newParts: (TextUIPart | ToolUIPart | FileUIPart)[] | undefined
  ) => {
    speechProcessingQueue = speechProcessingQueue
      .then(async () => {
        if (!message || !newParts || message.role !== 'assistant' || !speechEnabled.value) return

        const fullText = getMessageText(message)
        const currentText = fullText.slice(processedText.length)
        if (!currentText) return

        if (await appendStreamingSpeechText(message, currentText)) {
          processedText = fullText
          return
        }

        processStreamingSpeech(message, newParts)
      })
      .catch((error) => {
        console.error('Streaming speech processing failed:', error)
      })
  }

  const finishStreamingSpeech = async (message: BaseMessage) => {
    const session = streamingSpeechSession || (await streamingSpeechSessionPromise)
    if (!session) return false

    try {
      await session.finish()
      updateStreamingSpeechMetadata(message, session)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      updateStreamingSpeechMetadata(message, session, `生成失败：${errorMessage}`)
    } finally {
      streamingSpeechSession = null
      streamingSpeechSessionPromise = null
      streamingSpeechChunkIndex = null
    }

    return true
  }

  const finishMessageSpeech = (message: BaseMessage) => {
    if (!speechEnabled.value) return

    void speechProcessingQueue.then(async () => {
      if (await finishStreamingSpeech(message)) return

      const mode = getChatAgent()?.speechMode as string

      if (mode === 'sentence') {
        sentenceSegmenter.flush((sentence) => {
          generateSpeech(sentence, message)
        })
      } else {
        const fullText = getMessageText(message)
        const remainingText = fullText.slice(processedText.length).trim()
        if (remainingText) {
          generateSpeech(remainingText, message)
        }
      }
    })
  }

  const fail = (error: unknown) => {
    void speechProcessingQueue.then(async () => {
      const session = streamingSpeechSession || (await streamingSpeechSessionPromise)
      if (session) {
        await session.error(error)
      }
    })
  }

  return {
    reset,
    processQueued,
    finishMessageSpeech,
    fail
  }
}

