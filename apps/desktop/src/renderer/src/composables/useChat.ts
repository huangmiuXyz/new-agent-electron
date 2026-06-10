import { Chat as _useChat } from '@ai-sdk/vue'
import type { APICallError, FileUIPart, TextUIPart, ToolUIPart } from 'ai'
import { lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai'
import { speechService } from '../services/speechService'
import { useMessageScroll } from './useMessageScroll'
import { createChatMessageSyncController } from './chat/messageSyncController'
import { createSpeechStreamController } from './chat/speechStreamController'
import { createSubTaskResultCoordinator } from './chat/subTaskResultCoordinator'

const chatCache = new Map<string, any>()

export const useChat = (chatId: string) => {
  if (chatCache.has(chatId)) {
    return chatCache.get(chatId)
  }

  const {
    ensureChatAgent,
    getChatById,
    shiftPendingMessage,
    updateMessageMetadata,
    updateMessages
  } = useChatsStores()
  const { messageScrollRef } = useMessageScroll()

  const { thinkingMode, speechEnabled, providerOptions } = storeToRefs(useSettingsStore())
  const settingsStore = useSettingsStore()

  const agentStore = useAgentStore()
  const service = chatService()
  const tts = speechService()

  const scheduleNextPendingMessage = () => {
    const pendingMessage = shiftPendingMessage(chatId)
    if (!pendingMessage) return

    setTimeout(() => {
      const { sendMessages } = useChat(chatId)
      sendMessages(pendingMessage.parts)
    }, 100)
  }

  const getChatAgent = (): Agent | null => {
    const agentId = ensureChatAgent(chatId)
    if (!agentId) return null
    return agentStore.getAgentById(agentId) || null
  }

  const getVisibleMessages = () => {
    const chat = getChatById(chatId)
    if (!chat) return []
    return chat.messages
  }

  const findToolCallLocation = (messages: BaseMessage[], toolCallId: string) => {
    for (let messageIndex = 0; messageIndex < messages.length; messageIndex += 1) {
      const message = messages[messageIndex]
      if (message.role !== 'assistant') continue

      const partIndex = message.parts.findIndex((part) => {
        const partToolCallId = (part as { toolCallId?: string }).toolCallId
        return partToolCallId === toolCallId
      })

      if (partIndex >= 0) {
        return { messageIndex, partIndex, message }
      }
    }

    return null
  }

  const clearTransientMetadata = (metadata?: MetaData): MetaData | undefined => {
    if (!metadata) return metadata

    const nextMetadata: Partial<MetaData> = { ...metadata }
    delete nextMetadata.loading
    delete nextMetadata.error
    delete nextMetadata.stop
    delete nextMetadata.audio
    delete nextMetadata.translationLoading
    delete nextMetadata.translationController
    delete nextMetadata.translations
    delete nextMetadata.usage
    delete nextMetadata.providerMetadata
    return nextMetadata as MetaData
  }

  const createChat = (
    messages: BaseMessage[],
    options?: { regenerateMessageId?: string; isApproval?: boolean }
  ): _useChat<BaseMessage> => {
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
      let manuallyStopped = false
      const targetMessageId = ref<string | undefined>(regenerateMessageId)

      const triggerNextPendingMessage = (targetChatId: string) => {
        const chatsStore = useChatsStores()
        if (chatsStore.isChatGenerating(targetChatId)) return

        const pendingMessage = chatsStore.shiftPendingMessage(targetChatId)
        const parts = pendingMessage?.parts
        if (!parts) return

        setTimeout(() => {
          useChat(targetChatId).sendMessages(parts)
        }, 0)
      }

      const speechController = createSpeechStreamController({
        chatId,
        speechEnabled,
        tts,
        getChatAgent,
        getMessageText,
        updateMessageMetadata
      })

      const subTaskCoordinator = createSubTaskResultCoordinator({
        chatId,
        service,
        settingsStore,
        getChatById,
        getChatAgent,
        getVisibleMessages,
        triggerNextPendingMessage
      })

      const messageSyncController = createChatMessageSyncController({
        chatId,
        targetMessageId,
        getChatById,
        updateMessages,
        markManuallyStopped: () => {
          manuallyStopped = true
        },
        onStreamingUpdate: speechController.processQueued
      })

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
            const selectedModel =
              providerId && modelId ? settingsStore.getModelById(providerId, modelId).model : null
            if (!runtimeAgent || !selectedProvider || !selectedModel) {
              throw new Error('未找到会话绑定的智能体或模型配置')
            }

            speechController.reset(runtimeAgent)
            const toolFeaturesEnabled = runtimeChat?.toolFeaturesEnabled !== false

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
                mcpTools: toolFeaturesEnabled ? runtimeAgent?.tools || [] : [],
                builtinTools: toolFeaturesEnabled ? runtimeAgent?.builtinTools || [] : [],
                builtinToolsRequireApproval: toolFeaturesEnabled
                  ? runtimeAgent?.builtinToolsRequireApproval || []
                  : [],
                builtinToolConfigs: toolFeaturesEnabled
                  ? runtimeAgent?.builtinToolConfigs || {}
                  : {},
                skillsEnabled: toolFeaturesEnabled,
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
                contextTokenCount: runtimeAgent?.contextTokenCount,
                autoCompressContext: runtimeAgent?.autoCompressContext,
                compressModel: runtimeAgent?.compressModel,
                maxToolCalls: runtimeAgent?.maxToolCalls,
                providerOptions: providerOptions.value[selectedProvider.id],
                isApprovalAction: isApproval
              }
            )
          },
          reconnectToStream: undefined as any
        },

        onFinish: () => {
          const finalMessage = chat.lastMessage!
          messageSyncController.finalizeMessageSync(finalMessage)
          speechController.finishMessageSpeech(finalMessage)

          useTitle(chatId).generateTitle()
          if (!manuallyStopped) {
            void subTaskCoordinator.submitSummaryOnStop()
          }
          scope.stop()
          scheduleNextPendingMessage()
        },

        onError: (error) => {
          console.error(error)
          messageSyncController.finalizeMessageSync(chat.lastMessage, error as APICallError)
          speechController.fail(error)
          if (manuallyStopped) {
            subTaskCoordinator.markFailed('用户手动停止了子任务')
          } else {
            subTaskCoordinator.markFailed((error as Error).message || '子任务执行失败')
          }
          scope.stop()
          scheduleNextPendingMessage()
        }
      })

      watch(
        () => chat.lastMessage,
        (newMessage) => {
          messageSyncController.scheduleStreamingUpdate(newMessage)
        },
        { deep: true }
      )

      onScopeDispose(() => {
        messageSyncController.dispose()
      })

      return chat
    })!
  }

  const scrollToBottom = () => {
    setTimeout(() => {
      messageScrollRef.value?.scrollToBottom()
    }, 1)
  }

  const normalizeRegenerateTarget = (messages: BaseMessage[], messageId: string) => {
    const messageIndex = messages.findIndex((message) => message.id === messageId)
    if (messageIndex === -1) {
      return { retryAnchorMessageId: messageId, regenerateMessageId: messageId }
    }

    const targetMessage = messages[messageIndex]
    if (targetMessage?.role !== 'assistant') {
      return { retryAnchorMessageId: messageId, regenerateMessageId: messageId }
    }

    for (let index = messageIndex - 1; index >= 0; index -= 1) {
      const candidate = messages[index]
      if (candidate?.role === 'user') {
        return {
          retryAnchorMessageId: candidate.id!,
          regenerateMessageId: candidate.id!
        }
      }
    }

    return { retryAnchorMessageId: messageId, regenerateMessageId: messageId }
  }

  const result = {
    sendMessages: async (content: string | Array<FileUIPart | TextUIPart>) => {
      scrollToBottom()
      const chat = createChat(getVisibleMessages())

      const parts: Array<FileUIPart | TextUIPart> =
        typeof content === 'string' ? [{ type: 'text', text: content }] : content

      chat.sendMessage({
        id: chat.generateId(),
        role: 'user',
        parts
      })
    },
    continueMessages: () => {
      const chat = createChat(getVisibleMessages())
      chat.sendMessage()
    },
    retryFromToolCall: (toolCallId: string, position: 'above' | 'below') => {
      const currentMessages = getVisibleMessages()
      const toolCallLocation = findToolCallLocation(currentMessages, toolCallId)

      if (!toolCallLocation) {
        messageApi.error('未找到对应的工具调用')
        return
      }

      const { messageIndex, partIndex, message } = toolCallLocation
      const truncatedParts =
        position === 'above'
          ? message.parts.slice(0, partIndex)
          : message.parts.slice(0, partIndex + 1)

      let retryAnchorMessageId: string | null = null
      for (let index = messageIndex - 1; index >= 0; index -= 1) {
        if (currentMessages[index]?.role === 'user') {
          retryAnchorMessageId = currentMessages[index]?.id || null
          break
        }
      }

      if (!retryAnchorMessageId) {
        messageApi.error('未找到可重试的用户消息')
        return
      }

      message.metadata?.stop?.()

      const baseMessages = currentMessages.slice(0, messageIndex)
      const nextMessages =
        truncatedParts.length > 0
          ? [
              ...baseMessages,
              {
                ...message,
                parts: cloneDeep(truncatedParts),
                metadata: clearTransientMetadata(message.metadata)
              }
            ]
          : baseMessages

      updateMessages(chatId, cloneDeep(nextMessages))

      scrollToBottom()
      const chat = createChat(nextMessages)
      chat.sendMessage()
    },
    regenerate: (messageId: string) => {
      const currentChats = getChatById(chatId)
      const messages = currentChats?.messages || []
      const { retryAnchorMessageId, regenerateMessageId } = normalizeRegenerateTarget(
        messages,
        messageId
      )
      const isLastMessage = messages.length > 0 && messages[messages.length - 1].id === messageId
      const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')
      const isLastUserMessage = lastUserMessage?.id === retryAnchorMessageId
      if (isLastMessage || isLastUserMessage) {
        scrollToBottom()
      }
      const retryAnchorMessageIndex = messages.findIndex(
        (message) => message.id === retryAnchorMessageId
      )
      const retryMessages =
        retryAnchorMessageIndex >= 0
          ? cloneDeep(messages.slice(0, retryAnchorMessageIndex + 1))
          : cloneDeep(messages)
      updateMessages(chatId, retryMessages)
      const chat = createChat(retryMessages, {
        regenerateMessageId
      })
      chat.regenerate({ messageId: regenerateMessageId })
    },
    approval: (part: ToolUIPart, approved: boolean) => {
      const chat = createChat(getVisibleMessages(), { isApproval: true })
      const toolName = part.type.startsWith('tool-') ? part.type.slice('tool-'.length) : part.type
      chat.addToolApprovalResponse({
        id: part.approval!.id!,
        approved,
        reason: approved
          ? undefined
          : `用户手动拒绝执行工具 ${toolName}。请向用户提问为何拒绝，并根据用户的回答调整后续的工具调用。`
      })
    }
  }

  chatCache.set(chatId, result)
  return result
}
