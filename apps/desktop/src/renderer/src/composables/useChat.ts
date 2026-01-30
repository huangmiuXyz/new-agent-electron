import { Chat as _useChat } from '@ai-sdk/vue'
import type { APICallError, FileUIPart, TextUIPart, ToolUIPart } from 'ai'
import { lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai'
import { speechService } from '../services/speechService'

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
  const { getChatById, updateMessageMetadata, updateMessages } = useChatsStores()
  const chats = getChatById(chatId)

  const { currentSelectedProvider, currentSelectedModel, thinkingMode, speechEnabled } =
    storeToRefs(useSettingsStore())

  const agent = useAgentStore()
  const mcpClient = agent.getMcpByAgent(agent.selectedAgent!.id!).mcpServers
  const service = chatService()
  const tts = speechService()
  const mcpTools = agent.selectedAgent!.tools! || []
  const builtinTools = agent.selectedAgent!.builtinTools! || []
  const { apiKey, baseUrl, id: provider, providerType } = toRefs(currentSelectedProvider.value!)
  const { id: model } = toRefs(currentSelectedModel.value!)

  const createChat = (messages: BaseMessage[]): _useChat<BaseMessage> => {
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
          sendMessages: ({ messages }) => {
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
                maxOutputTokens: agent.selectedAgent?.maxOutputTokens
              }
            )
          },
          reconnectToStream: undefined as any
        },

        onFinish: () => {
          if (speechEnabled.value) {
            const mode = agent.selectedAgent?.speechMode as string

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
        },

        onError: (error) => {
          syncMessageToStore(error as APICallError)
        }
      })

      const syncMessageToStore = (error?: APICallError) => {
        const updatedMessages = [...(chat.messages || [])]
        if (chats) {
          updateMessages(chatId, (oldMessages) => {
            const mergedMessages = [...oldMessages]
            updatedMessages.forEach((msg, index) => {
              if (chat.lastMessage.id === msg.id && error) {
                msg.metadata.error = error
              }
              if (index < mergedMessages.length) {
                mergedMessages[index] = {
                  ...mergedMessages[index],
                  ...msg,
                  metadata: { ...mergedMessages[index].metadata, ...msg.metadata }
                }
              } else {
                mergedMessages.push(msg)
              }
            })
            return mergedMessages
          })
        }
      }

      const processStreamingSpeech = (
        newParts: (TextUIPart | ToolUIPart | FileUIPart)[] | undefined
      ) => {
        if (!newParts || chat.lastMessage.role !== 'assistant' || !speechEnabled.value) return
        const mode = agent.selectedAgent?.speechMode as string
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

  return {
    sendMessages: async (content: string | Array<FileUIPart | TextUIPart>) => {
      const chat = createChat(chats?.messages!)

      const parts: Array<FileUIPart | TextUIPart> =
        typeof content === 'string' ? [{ type: 'text', text: content }] : content

      chat.sendMessage({
        id: chat.generateId(),
        role: 'user',
        parts
      })
    },
    continueMessages: () => {
      const chat = createChat(chats?.messages!)
      chat.sendMessage()
    },
    regenerate: (messageId: string) => {
      const chat = createChat(chats?.messages!)
      chat.regenerate({ messageId })
    },
    approval: (part: ToolUIPart, approved: boolean) => {
      const chat = createChat(chats?.messages!)
      chat.addToolApprovalResponse({
        id: part.approval?.id!,
        approved
      })
    }
  }
}
