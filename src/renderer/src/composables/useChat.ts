import { Chat as _useChat } from '@ai-sdk/vue'
import type { FileUIPart, TextUIPart, ToolUIPart } from 'ai'
import { lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai';
import { speechService } from '../services/speechService'

export const useChat = (chatId: string) => {
  const { getChatById } = useChatsStores()
  const chats = getChatById(chatId)

  const { currentSelectedProvider, currentSelectedModel, thinkingMode, defaultModels } =
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
          const fullText = getMessageText(chat.lastMessage)
          const remainingText = fullText.slice(processedText.length).trim()
          if (remainingText) {
            generateSpeech(remainingText, chat.lastMessage)
          }

          useTitle(chatId).generateTitle()
          scope.stop()
        },
        onError: (error) => {
          update(error)
        }
      })

      const generateSpeech = async (text: string, message: BaseMessage) => {
        if (!text.trim()) return

        const voice = agent.selectedAgent?.speechVoice || defaultModels.value.speechVoice

        let targetModelId = ''
        let targetProviderId = ''

        const { speechModelId, speechProviderId } = defaultModels.value
        const modelIds = Array.isArray(speechModelId) ? speechModelId : [speechModelId]
        const providerIds = Array.isArray(speechProviderId) ? speechProviderId : [speechProviderId]

        for (let i = 0; i < modelIds.length; i++) {
          const mId = modelIds[i]
          const pId = providerIds[i]
          const provider = useSettingsStore().getAllProviders.find(p => p.id === pId)
          const model = provider?.models?.find(m => m.id === mId)
          if (model?.voices?.some(v => v.id === voice)) {
            targetModelId = mId
            targetProviderId = pId
            break
          }
        }

        // Fallback to first selected model if not found
        if (!targetModelId && modelIds.length > 0) {
          targetModelId = modelIds[0]
          targetProviderId = providerIds[0]
        }

        try {
          const chunk = await tts.generateAndPlay({
            text,
            messageId: message.id,
            modelId: targetModelId,
            providerId: targetProviderId,
            voice
          })

          if (chunk) {
            const chatsStore = useChatsStores()
            const currentChat = chatsStore.getChatById(chatId)
            const currentMsg = currentChat?.messages.find(m => m.id === message.id)
            const metadata = { ...(currentMsg?.metadata || message.metadata || {}) } as MetaData
            if (!metadata.audio) {
              metadata.audio = {
                chunks: [],
                voice,
                model: targetModelId
              }
            }
            metadata.audio.chunks = [
              ...metadata.audio.chunks,
              {
                data: chunk.audioData,
                text: chunk.text
              }
            ]

            chatsStore.updateMessageMetadata(chatId, message.id, metadata)
            message.metadata = metadata
          }
        } catch (error) {
          console.error('TTS error in useChat:', error)
        }
      }

      watch(() => chat.lastMessage?.parts, (newParts) => {
        if (!newParts || chat.lastMessage.role !== 'assistant') return
        const mode = (agent.selectedAgent?.speechMode || defaultModels.value.speechMode) as string
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

      const _update = (error?: Error) => {
        chat.lastMessage.metadata = { ...chat.lastMessage.metadata, error }
      }

      const update = throttle(_update, 150, { edges: ['leading', 'trailing'] })

      watch(() => chat.messages, (newMessages) => {
        chats!.messages = newMessages!
      }, { deep: true })

      return chat
    })!
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
