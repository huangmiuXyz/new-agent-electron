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
    delete nextMetadata.retrying
    delete nextMetadata.retryAttempt
    delete nextMetadata.retryCountdownEndsAt
    delete nextMetadata.stopRetry
    return nextMetadata as MetaData
  }

  // —— 自动重试状态（跨 createChat 调用共享）——
  // 失败后按智能体配置的间隔自动重试，直到用户点击停止按钮。
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let retryCountdownTimer: ReturnType<typeof setInterval> | null = null
  let retryAttempt = 0

  const cancelRetry = () => {
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    if (retryCountdownTimer) {
      clearInterval(retryCountdownTimer)
      retryCountdownTimer = null
    }
  }

  const resetRetryAttempt = () => {
    retryAttempt = 0
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
          cancelRetry()
        },
        onStreamingUpdate: speechController.processQueued
      })

      // —— 自动重试辅助：状态（retryTimer / retryCountdownTimer / retryAttempt）
      //    与 cancelRetry 定义在外层 createChat 之外，跨多次 createChat 共享 ——
      const clearRetryMetadata = (messageId: string) => {
        const storeChat = getChatById(chatId)
        if (!storeChat) return
        const target = storeChat.messages.find((m) => m.id === messageId)
        if (!target) return
        // 清理失败/重试态，恢复为普通消息，交由新一轮流接管 loading 等状态
        const nextMetadata = clearTransientMetadata(target.metadata)
        updateMessageMetadata(chatId, messageId, nextMetadata as MetaData)
      }

      const scheduleRetry = (failedMessageId: string, attempt: number) => {
        const agent = getChatAgent()
        const intervalMs = Math.max(0, agent?.retryIntervalMs ?? 3000)
        const endsAt = Date.now() + intervalMs

        // 用户点击「停止重试」时调用：标记手动停止，清理 timer，
        // 将消息标记为最终失败态并结束当前 scope。
        const stopRetry = () => {
          if (manuallyStopped) return
          manuallyStopped = true
          cancelRetry()
          const storeChat = getChatById(chatId)
          const target = storeChat?.messages.find((m) => m.id === failedMessageId)
          if (target) {
            updateMessageMetadata(chatId, failedMessageId, {
              ...target.metadata,
              retrying: false,
              loading: false,
              error: new Error('用户已停止自动重试'),
              stopRetry: undefined
            } as MetaData)
          }
          scope.stop()
          scheduleNextPendingMessage()
        }

        const setMessageRetryState = (countdownEndsAt?: number) => {
          const storeChat = getChatById(chatId)
          if (!storeChat) return
          const target = storeChat.messages.find((m) => m.id === failedMessageId)
          if (!target) return
          updateMessageMetadata(chatId, failedMessageId, {
            ...target.metadata,
            retrying: true,
            retryAttempt: attempt,
            retryCountdownEndsAt: countdownEndsAt,
            loading: false,
            error: undefined,
            stopRetry
          } as MetaData)
        }

        setMessageRetryState(endsAt)

        // 倒计时刷新（每 500ms 更新展示用的剩余时间）
        if (intervalMs > 0) {
          retryCountdownTimer = setInterval(() => {
            const remaining = endsAt - Date.now()
            if (remaining <= 0) {
              if (retryCountdownTimer) {
                clearInterval(retryCountdownTimer)
                retryCountdownTimer = null
              }
              return
            }
            setMessageRetryState(endsAt)
          }, 500)
        }

        retryTimer = setTimeout(() => {
          retryTimer = null
          if (retryCountdownTimer) {
            clearInterval(retryCountdownTimer)
            retryCountdownTimer = null
          }
          // 用户在等待期间点击了停止
          if (manuallyStopped) {
            scope.stop()
            scheduleNextPendingMessage()
            return
          }
          // 清理失败/重试态，停止当前 scope，然后用「继续」触发下一次请求。
          // 继续而非 regenerate：保留已生成的内容，只让模型接着往下生成。
          clearRetryMetadata(failedMessageId)
          scope.stop()
          result.continueMessages()
        }, intervalMs)
      }

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

          // 成功完成：清理重试状态
          cancelRetry()
          resetRetryAttempt()

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

          const failedMessage = chat.lastMessage
          const failedMessageId = failedMessage?.id

          // 用户手动停止：不重试
          if (manuallyStopped) {
            subTaskCoordinator.markFailed('用户手动停止了子任务')
            scope.stop()
            scheduleNextPendingMessage()
            return
          }

          // 普通对话失败：检查智能体是否配置了自动重试
          // 子任务场景（has parentChatId）不自动重试，按原逻辑上报失败
          // 缺省（未配置）视为开启自动重试
          const isSubTask = !!getChatById(chatId)?.parentChatId
          const agent = getChatAgent()
          const autoRetryEnabled =
            agent?.retryAutoEnabled !== false && !!failedMessageId && !isApproval && !isSubTask

          if (!autoRetryEnabled) {
            subTaskCoordinator.markFailed((error as Error).message || '子任务执行失败')
            scope.stop()
            scheduleNextPendingMessage()
            return
          }

          // 安排下一次重试：保持当前 scope 存活，由 retryTimer 驱动
          retryAttempt += 1
          scheduleRetry(failedMessageId!, retryAttempt)
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
        cancelRetry()
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
