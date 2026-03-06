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

  const { thinkingMode, speechEnabled, providerOptions } =
    storeToRefs(useSettingsStore())
  const settingsStore = useSettingsStore()

  const agentStore = useAgentStore()
  const service = chatService()
  const tts = speechService()

  const getChatAgent = (): Agent | null => {
    const chat = getChatById(chatId)
    const agentId = chat?.agentId
    if (!agentId) return null
    return agentStore.getAgentById(agentId) || null
  }

  const createChat = (messages: BaseMessage[], options?: { regenerateMessageId?: string; isApproval?: boolean }): _useChat<BaseMessage> => {
    const { regenerateMessageId, isApproval } = options || {}
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
      let sentenceSegmenter = createSentenceSegmenter(getChatAgent()?.speechLanguage)

      const targetMessageId = ref<string | undefined>(regenerateMessageId)

      const chat = new _useChat<BaseMessage>({
        id: chatId,
        messages: cloneDeep(messages),
        sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
        transport: {
          sendMessages: ({ messages }) => {
            const runtimeAgent = getChatAgent()
            const runtimeChat = getChatById(chatId)
            const providerId = runtimeChat?.providerId
            const modelId = runtimeChat?.modelId
            const selectedProvider = providerId ? settingsStore.getProviderById(providerId) : null
            const selectedModel = providerId && modelId ? settingsStore.getModelById(providerId, modelId).model : null
            if (!runtimeAgent || !selectedProvider || !selectedModel) {
              throw new Error('未找到会话绑定的智能体或模型配置')
            }

            processedText = ''
            sentenceSegmenter = createSentenceSegmenter(
              runtimeAgent?.speechLanguage || 'und'
            )

            return service.createAgent(
              chat.id,
              {
                model: modelId!,
                apiKey: selectedProvider.apiKey!,
                baseURL: selectedProvider.baseUrl!,
                provider: providerId!,
                providerType: selectedProvider.providerType
              },
              messages,
              {
                mcpClient: agentStore.getMcpByAgent(runtimeAgent.id).mcpServers,
                instructions: runtimeAgent?.systemPrompt,
                mcpTools: runtimeAgent?.tools || [],
                builtinTools: runtimeAgent?.builtinTools || [],
                knowledgeBaseIds: runtimeAgent?.knowledgeBaseIds,
                thinkingMode: thinkingMode.value,
                ragEnabled: runtimeAgent?.ragEnabled,
                temperature: runtimeAgent?.temperature,
                topP: runtimeAgent?.topP,
                topK: runtimeAgent?.topK,
                presencePenalty: runtimeAgent?.presencePenalty,
                frequencyPenalty: runtimeAgent?.frequencyPenalty,
                maxOutputTokens: runtimeAgent?.maxOutputTokens,
                contextCount: runtimeAgent?.contextCount,
                autoCompressContext: runtimeAgent?.autoCompressContext,
                compressModel: runtimeAgent?.compressModel,
                providerOptions: providerOptions.value[selectedProvider.id],
                isApprovalAction: isApproval
              }
            )
          },
          reconnectToStream: undefined as any
        },

        onFinish: () => {
          if (speechEnabled.value) {
            const mode = getChatAgent()?.speechMode as string

            if (mode === 'sentence') {
              sentenceSegmenter.flush((sentence) => {
                generateSpeech(sentence, chat.lastMessage)
              })
            } else {
              const fullText = getMessageText(chat.lastMessage)
              const remainingText = fullText.slice(processedText.length).trim()
              if (remainingText) {
                generateSpeech(remainingText, chat.lastMessage)
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
          syncMessageToStore(error as APICallError)
        }
      })

      const syncMessageToStore = (error?: APICallError) => {
        const lastMsg = chat.lastMessage
        if (!lastMsg) return

        // Keep parts immutable when syncing to Pinia so nested text updates stay reactive in children.
        const nextParts = lastMsg.parts?.map((part) => ({ ...part }))

        const msgToUpdate = {
          ...lastMsg,
          parts: nextParts,
          metadata: { ...lastMsg.metadata, error }
        }

        updateMessages(chatId, (oldMessages) => {
          const existingIndex = oldMessages.findIndex((m) => m.id === lastMsg.id)
          if (existingIndex >= 0) {
            const copy = [...oldMessages]
            copy[existingIndex] = msgToUpdate
            return copy
          }

          if (!targetMessageId.value) {
            return [...oldMessages, msgToUpdate]
          }

          const targetIndex = oldMessages.findIndex((m) => m.id === targetMessageId.value)
          if (targetIndex < 0) {
            return [...oldMessages, msgToUpdate]
          }

          const copy = [...oldMessages]
          const targetMsg = copy[targetIndex]

          if (targetMsg.role === 'assistant') {
            copy[targetIndex] = msgToUpdate
            return copy
          }

          const nextAssistantIndex = copy.findIndex((m, i) => i > targetIndex && m.role === 'assistant')

          if (nextAssistantIndex >= 0) {
            copy[nextAssistantIndex] = msgToUpdate
          } else {
            copy.splice(targetIndex + 1, 0, msgToUpdate)
          }

          return copy
        })
      }

      const processStreamingSpeech = (
        newParts: (TextUIPart | ToolUIPart | FileUIPart)[] | undefined
      ) => {
        if (!newParts || chat.lastMessage.role !== 'assistant' || !speechEnabled.value) return
        const mode = getChatAgent()?.speechMode as string
        if (mode === 'full') return

        const fullText = getMessageText(chat.lastMessage)
        const currentText = fullText.slice(processedText.length)

        if (mode === 'sentence') {
          sentenceSegmenter.push(currentText, (sentence) => {
            generateSpeech(sentence, chat.lastMessage)
          })
          processedText = fullText
        } else if (mode === 'paragraph') {
          const paragraphs = currentText.split(/\n+/)
          if (paragraphs.length > 1) {
            for (let i = 0; i < paragraphs.length - 1; i++) {
              const p = paragraphs[i]
              if (p.trim()) {
                generateSpeech(p, chat.lastMessage)
              }
              processedText += paragraphs[i] + '\n'
            }
          }
        }
      }

      watch(
        () => chat.lastMessage?.parts,
        (newParts) => {
          syncMessageToStore()
          processStreamingSpeech(newParts)
        },
        { deep: true }
      )

      return chat
    })!
  }

  const generateSpeech = async (text: string, message: BaseMessage) => {
    if (!text.trim() || !speechEnabled.value) return

    const runtimeAgent = getChatAgent()
    const voice = runtimeAgent?.speechVoice!
    const speed = runtimeAgent?.speechSpeed
    const language = runtimeAgent?.speechLanguage
    const { getModelByVoice } = useSettingsStore()
    const modelInfo = getModelByVoice(voice)

    if (!modelInfo) return

    const { modelId: targetModelId, providerId: targetProviderId } = modelInfo
    const rawOptions = runtimeAgent?.speechProviderOptions
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

  return {
    sendMessages: async (content: string | Array<FileUIPart | TextUIPart>) => {
      scrollToBottom()
      const currentChats = getChatById(chatId)
      const chat = createChat(currentChats?.messages || [])

      const parts: Array<FileUIPart | TextUIPart> =
        typeof content === 'string' ? [{ type: 'text', text: content }] : content

      chat.sendMessage({
        id: chat.generateId(),
        role: 'user',
        parts
      })
    },
    continueMessages: () => {
      const currentChats = getChatById(chatId)
      const chat = createChat(currentChats?.messages || [])
      chat.sendMessage()
    },
    regenerate: (messageId: string) => {
      const currentChats = getChatById(chatId)
      const messages = currentChats?.messages || []
      const isLastMessage = messages.length > 0 && messages[messages.length - 1].id === messageId
      const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')
      const isLastUserMessage = lastUserMessage?.id === messageId
      if (isLastMessage || isLastUserMessage) {
        scrollToBottom()
      }
      const chat = createChat(messages, { regenerateMessageId: messageId })
      chat.regenerate({ messageId })
    },
    approval: (part: ToolUIPart, approved: boolean) => {
      const currentChats = getChatById(chatId)
      const chat = createChat(currentChats?.messages || [], { isApproval: true })
      chat.addToolApprovalResponse({
        id: part.approval!.id!,
        approved
      })
    }
  }
}
