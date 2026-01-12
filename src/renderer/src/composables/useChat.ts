import { Chat as _useChat } from '@ai-sdk/vue'
import type { APICallError, FileUIPart, TextUIPart, ToolUIPart } from 'ai'
import { lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai';
import { speechService } from '../services/speechService'

export const useChat = (chatId: string) => {
  const { getChatById, updateMessageMetadata } = useChatsStores()
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

    const contextCount = agent.selectedAgent?.contextCount ?? 10
    const slicedMessages = messages.length > contextCount ? messages.slice(-contextCount) : messages

    const getMessageText = (message: BaseMessage) => {
      if (!message || !message.parts) return ''
      return message.parts
        .filter((part): part is TextUIPart => part.type === 'text')
        .map((part) => part.text)
        .join('')
    }

    return scope.run(() => {
      let processedText = ''
      const chat = new _useChat<BaseMessage>({
        id: chatId,
        messages: slicedMessages,
        sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
        onData: (data) => {
          console.log(data)
        },
        transport: {
          sendMessages: ({ messages }) => {
            processedText = ''
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
              },
            )
          },
          reconnectToStream: undefined as any
        },
        onFinish: () => {
          if (speechEnabled.value) {
            const fullText = getMessageText(chat.lastMessage)
            const remainingText = fullText.slice(processedText.length).trim()
            if (remainingText) {
              generateSpeech(remainingText, chat.lastMessage)
            }
          }

          useTitle(chatId).generateTitle()
          scope.stop()
        },
        onError: (error) => {
          chat.lastMessage.metadata = { ...chat.lastMessage.metadata, error }
        }
      })
      watch(() => chat.lastMessage?.parts, (newParts) => {
        const updatedMessages = [...chat.messages!]
        const lastIndex = updatedMessages.length - 1
        if (lastIndex >= 0) {
          updatedMessages[lastIndex] = cloneDeep(updatedMessages[lastIndex])
        }
        chats!.messages = updatedMessages

        if (!newParts || chat.lastMessage.role !== 'assistant' || !speechEnabled.value) return
        const mode = (agent.selectedAgent?.speechMode) as string
        if (mode === 'full') return

        const fullText = getMessageText(chat.lastMessage)
        const currentText = fullText.slice(processedText.length)

        if (mode === 'sentence') {
          const sentences = currentText.match(/[^.!?。！？]+[.!?。！？]+/g)
          if (sentences) {
            sentences.forEach(sentence => {
              generateSpeech(sentence, chat.lastMessage)
              processedText += sentence
            })
          }
        } else if (mode === 'paragraph') {
          const paragraphs = currentText.split(/\n+/)
          if (paragraphs.length > 1) {
            for (let i = 0; i < paragraphs.length - 1; i++) {
              const p = paragraphs[i]
              if (p.trim()) {
                generateSpeech(p, chat.lastMessage)
              }
              processedText += paragraphs[i] + (currentText.match(/\n+/)?.[0] || '\n')
            }
          }
        }
      }, {
        deep: true
      })

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

    if (!modelInfo) {
      return
    }

    const { modelId: targetModelId, providerId: targetProviderId } = modelInfo

    const rawOptions = agent.selectedAgent?.speechProviderOptions
    const providerOptions = rawOptions?.[targetProviderId] ?? rawOptions

    if (!message.metadata) {
      message.metadata = {} as MetaData
    }

    if (!message.metadata.audio) {
      message.metadata.audio = {
        chunks: [],
        voice,
        model: targetModelId
      }
    }

    const chunks = message.metadata.audio.chunks
    const chunkIndex = chunks.length
    chunks.push({
      data: '',
      text
    })

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
      } else {
        // Mark error if generation returned nothing
        if (message.metadata?.audio?.chunks[chunkIndex]) {
          message.metadata.audio.chunks[chunkIndex].error = '生成失败：未返回音频数据'
          updateMessageMetadata(chatId, message.id, message.metadata)
        }
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

  const sendMessages = async (content: string | Array<FileUIPart | TextUIPart>) => {
    const chat = createChat(chats?.messages!)
    const parts: Array<FileUIPart | TextUIPart> =
      typeof content === 'string' ? [{ type: 'text', text: content }] : content
    chat.sendMessage({
      id: chat.generateId(),
      role: 'user',
      parts
    })
  }

  const regenerate = (messageId: string) => {
    const chat = createChat(chats?.messages!)
    chat.regenerate({ messageId })
  }
  const approval = (part: ToolUIPart, approved: boolean) => {
    const chat = createChat(chats?.messages!)
    chat.addToolApprovalResponse({
      id: part.approval?.id!,
      approved
    })
  }
  return {
    sendMessages,
    regenerate,
    approval
  }
}
