import { Chat as _useChat } from '@ai-sdk/vue'
import type { APICallError, FileUIPart, TextUIPart, ToolUIPart } from 'ai'
import { lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai'
import { speechService } from '../services/speechService'
import { useMessageScroll } from './useMessageScroll'

function createSentenceSegmenter(locale: string = 'und') {
  const segmenter = new Intl.Segmenter(locale === 'auto' ? 'und' : locale, {
    granularity: 'sentence'
  })

  let buffer = ''

  function push(text: string, onSentence: (s: string) => void) {
    buffer += text

    const segments = segmenter.segment(buffer)
    let lastConsumedIndex = 0

    for (const segment of segments) {
      const end = segment.index + segment.segment.length

      if (end < buffer.length) {
        const sentence = segment.segment.trim()
        if (sentence) {
          onSentence(sentence)
          lastConsumedIndex = end
        }
      }
    }

    if (lastConsumedIndex > 0) {
      buffer = buffer.slice(lastConsumedIndex)
    }
  }

  function flush(onSentence: (s: string) => void) {
    const rest = buffer.trim()
    if (rest) {
      onSentence(rest)
    }
    buffer = ''
  }

  return { push, flush }
}

export const useChat = (chatId: string) => {
  const { getChatById, updateMessageMetadata, updateMessages, shiftPendingMessage } = useChatsStores()
  const { messageScrollRef } = useMessageScroll()

  const { currentSelectedProvider, currentSelectedModel, thinkingMode, speechEnabled, providerOptions } =
    storeToRefs(useSettingsStore())

  const agent = useAgentStore()
  const mcpClient = agent.getMcpByAgent(agent.selectedAgent!.id!).mcpServers
  const service = chatService()
  const tts = speechService()
  const mcpTools = agent.selectedAgent!.tools! || []
  const builtinTools = agent.selectedAgent!.builtinTools! || []
  const { apiKey, baseUrl, id: provider, providerType } = toRefs(currentSelectedProvider.value!)
  const { id: model } = toRefs(currentSelectedModel.value!)

  const createChat = (
    messages: BaseMessage[],
    options?: { isApproval?: boolean; responseMessageId?: string; isRegenerateAction?: boolean }
  ): _useChat<BaseMessage> => {
    const { isApproval, responseMessageId: forcedResponseMessageId, isRegenerateAction: forcedIsRegenerateAction } =
      options || {}
    const scope = effectScope()

    const getMessageText = (message: BaseMessage) => {
      if (!message || !message.parts) return ''
      return message.parts
        .filter((part): part is TextUIPart => part.type === 'text')
        .map((part) => part.text)
        .join('')
    }

    return scope.run(() => {
      let processedText = ''
      let sentenceSegmenter = createSentenceSegmenter(
        agent.selectedAgent?.speechLanguage
      )

      const chat = new _useChat<BaseMessage>({
        id: chatId,
        messages: cloneDeep(messages),
        sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
        transport: {
          sendMessages: ({ messages, abortSignal, trigger, messageId }) => {
            processedText = ''
            sentenceSegmenter = createSentenceSegmenter(
              agent.selectedAgent?.speechLanguage || 'und'
            )

            return service.createAgent(
              chat.id,
              {
                model: model.value!,
                apiKey: apiKey!.value!,
                baseURL: baseUrl.value,
                provider: provider.value,
                providerType: providerType.value
              },
              messages,
              {
                mcpClient,
                instructions: agent.selectedAgent?.systemPrompt,
                mcpTools,
                builtinTools,
                knowledgeBaseIds: agent.selectedAgent?.knowledgeBaseIds,
                thinkingMode: thinkingMode.value,
                ragEnabled: agent.selectedAgent?.ragEnabled,
                temperature: agent.selectedAgent?.temperature,
                topP: agent.selectedAgent?.topP,
                topK: agent.selectedAgent?.topK,
                presencePenalty: agent.selectedAgent?.presencePenalty,
                frequencyPenalty: agent.selectedAgent?.frequencyPenalty,
                maxOutputTokens: agent.selectedAgent?.maxOutputTokens,
                contextCount: agent.selectedAgent?.contextCount,
                autoCompressContext: agent.selectedAgent?.autoCompressContext,
                compressModel: agent.selectedAgent?.compressModel,
                providerOptions: providerOptions.value[provider.value],
                isApprovalAction: isApproval,
                onMessage: (message) => {
                  syncMessageToStore(message)
                  processStreamingSpeech(message)
                },
                abortSignal,
                responseMessageId:
                  trigger === 'regenerate-message'
                    ? messageId
                    : forcedResponseMessageId,
                isRegenerateAction: forcedIsRegenerateAction ?? trigger === 'regenerate-message'
              }
            )
          },
          reconnectToStream: undefined as any
        },

        onFinish: () => {
          if (chat.lastMessage) {
            syncMessageToStore(chat.lastMessage)
          }

          if (speechEnabled.value) {
            const lastMessage = chat.lastMessage
            if (lastMessage) {
              const mode = agent.selectedAgent?.speechMode as string

              if (mode === 'sentence') {
                sentenceSegmenter.flush((sentence) => {
                  generateSpeech(sentence, lastMessage)
                })
              } else {
                const fullText = getMessageText(lastMessage)
                const remainingText = fullText.slice(processedText.length).trim()
                if (remainingText) {
                  generateSpeech(remainingText, lastMessage)
                }
              }
            }
          }

          useTitle(chatId).generateTitle()
          scope.stop()

          const pendingMessage = shiftPendingMessage(chatId)
          if (pendingMessage) {
            setTimeout(() => {
              const { sendMessages } = useChat(chatId)
              sendMessages(pendingMessage.parts)
            }, 100)
          }
        },

        onError: (error) => {
          console.log(error);
          const lastMsg = chat.lastMessage
          if (lastMsg) {
            syncMessageToStore(lastMsg, error as APICallError)
          }
        }
      })

      const syncMessageToStore = (lastMsg: BaseMessage, error?: APICallError) => {
        if (!lastMsg) return

        // Mirror stream omits stop handlers; recover it from the runtime chat state.
        const runtimeMsg = chat.messages.find((m) => m.id === lastMsg.id)
        const runtimeStop = runtimeMsg?.metadata?.stop

        // Keep parts immutable when syncing to Pinia so nested text updates stay reactive in children.
        const nextParts = lastMsg.parts?.map((part) => ({ ...part }))

        const msgToUpdate = {
          ...lastMsg,
          parts: nextParts,
          metadata: { ...lastMsg.metadata, error, ...(runtimeStop ? { stop: runtimeStop } : {}) }
        } as BaseMessage

        updateMessages(chatId, (oldMessages) => {
          const existingIndex = oldMessages.findIndex((m) => m.id === lastMsg.id)
          if (existingIndex >= 0) {
            const copy = [...oldMessages]
            copy[existingIndex] = msgToUpdate
            return copy
          }
          return [...oldMessages, msgToUpdate]
        })
      }

      const processStreamingSpeech = (message: BaseMessage) => {
        if (!message?.parts || message.role !== 'assistant' || !speechEnabled.value) return
        const mode = agent.selectedAgent?.speechMode as string
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
            for (let i = 0; i < paragraphs.length - 1; i++) {
              const p = paragraphs[i]
              if (p.trim()) {
                generateSpeech(p, message)
              }
              processedText += paragraphs[i] + '\n'
            }
          }
        }
      }

      return chat
    })!
  }

  const generateSpeech = async (text: string, message: BaseMessage) => {
    if (!text.trim() || !speechEnabled.value) return

    const voice = agent.selectedAgent?.speechVoice!
    const speed = agent.selectedAgent?.speechSpeed
    const language = agent.selectedAgent?.speechLanguage
    const { getModelByVoice } = useSettingsStore()
    const modelInfo = getModelByVoice(voice)

    if (!modelInfo) return

    const { modelId: targetModelId, providerId: targetProviderId } = modelInfo
    const rawOptions = agent.selectedAgent?.speechProviderOptions
    const providerOptions = rawOptions?.[targetProviderId] ?? rawOptions

    if (!message.metadata) message.metadata = {} as MetaData
    if (!message.metadata.audio) {
      message.metadata.audio = { chunks: [], voice, model: targetModelId }
    }

    const chunks = message.metadata.audio.chunks
    const chunkIndex = chunks.length
    chunks.push({ data: '', text })

    updateMessageMetadata(chatId, message.id, message.metadata)

    try {
      const chunk = await tts.generateAndPlay({
        text,
        messageId: message.id,
        modelId: targetModelId,
        providerId: targetProviderId,
        voice,
        speed,
        language,
        providerOptions
      })

      if (chunk && message.metadata?.audio?.chunks[chunkIndex]) {
        message.metadata.audio.chunks[chunkIndex] = {
          ...message.metadata.audio.chunks[chunkIndex],
          data: chunk.audioData || '',
          duration: chunk.duration,
          error: undefined
        }
        updateMessageMetadata(chatId, message.id, message.metadata)
      } else if (message.metadata?.audio?.chunks[chunkIndex]) {
        message.metadata.audio.chunks[chunkIndex].error = '生成失败：未返回音频数据'
        updateMessageMetadata(chatId, message.id, message.metadata)
      }
    } catch (error) {
      const err = error as APICallError
      const errorMessage = err.message || err.name || String(error)
      if (message.metadata?.audio?.chunks[chunkIndex]) {
        message.metadata.audio.chunks[chunkIndex].error = `生成失败：${errorMessage}`
        updateMessageMetadata(chatId, message.id, message.metadata)
      }
      messageApi.error('语音合成失败: ' + errorMessage)
    }
  }

  const scrollToBottom = () => {
    setTimeout(() => {
      messageScrollRef.value?.scrollToBottom()
    }, 1)
  }

  const getCurrentMessages = (): BaseMessage[] => {
    return getChatById(chatId)?.messages || []
  }

  const createChatFrom = (
    messages: BaseMessage[] = getCurrentMessages(),
    options?: { isApproval?: boolean; responseMessageId?: string; isRegenerateAction?: boolean }
  ): _useChat<BaseMessage> => {
    return createChat(messages, options)
  }

  return {
    sendMessages: async (content: string | Array<FileUIPart | TextUIPart>) => {
      scrollToBottom()
      const messages = getCurrentMessages()
      const chat = createChatFrom(messages)

      const parts: Array<FileUIPart | TextUIPart> =
        typeof content === 'string' ? [{ type: 'text', text: content }] : content

      const userMessage: BaseMessage = {
        id: chat.generateId(),
        role: 'user',
        parts
      }

      updateMessages(chatId, (messages) => [...messages, userMessage])
      chat.sendMessage(userMessage)
    },
    continueMessages: (messageId?: string) => {
      const messages = getCurrentMessages()
      const targetMessage = messages.find((m) => m.id === messageId && m.role === 'assistant')
      if (!targetMessage) return
      const chat = createChatFrom(messages, {
        responseMessageId: targetMessage.id,
        isRegenerateAction: false
      })
      chat.sendMessage()
    },
    regenerate: (messageId: string) => {
      const messages = getCurrentMessages()
      const clickedIndex = messages.findIndex((m) => m.id === messageId)
      if (clickedIndex < 0) return

      const clickedMessage = messages[clickedIndex]
      let targetAssistantMessage = clickedMessage.role === 'assistant'
        ? clickedMessage
        : messages.find((m, i) => i > clickedIndex && m.role === 'assistant')
      let currentMessages = messages

      if (!targetAssistantMessage && clickedMessage.role === 'user') {
        const insertedAssistantMessage: BaseMessage = {
          id: nanoid(),
          role: 'assistant',
          parts: []
        }

        const nextMessages = [...currentMessages]
        nextMessages.splice(clickedIndex + 1, 0, insertedAssistantMessage)
        updateMessages(chatId, nextMessages)
        currentMessages = nextMessages
        targetAssistantMessage = insertedAssistantMessage
      }

      if (!targetAssistantMessage) return

      const isLastMessage =
        currentMessages.length > 0 &&
        currentMessages[currentMessages.length - 1].id === targetAssistantMessage.id
      if (isLastMessage) {
        scrollToBottom()
      }

      const chat = createChatFrom(currentMessages)
      chat.regenerate({ messageId: targetAssistantMessage.id })
    },
    approval: (part: ToolUIPart, approved: boolean) => {
      const chat = createChatFrom(undefined, { isApproval: true })
      chat.addToolApprovalResponse({
        id: part.approval!.id!,
        approved
      })
    }
  }
}
