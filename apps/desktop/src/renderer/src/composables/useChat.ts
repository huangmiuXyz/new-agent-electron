import { useChat as _useChat } from '@ai-sdk/vue'
import type { UseChatHelpers } from '@ai-sdk/vue'
import type { APICallError, FileUIPart, TextUIPart, ToolUIPart } from 'ai'
import { lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai'
import { speechService } from '../services/speechService'
import { useMessageScroll } from './useMessageScroll'
import { createChatMessageSyncController } from './chat/messageSyncController'
import { createSpeechStreamController } from './chat/speechStreamController'
import { createSubTaskResultCoordinator } from './chat/subTaskResultCoordinator'
import { buildContextMessages } from '@renderer/services/chatContextMessages'

const chatCache = new Map<string, any>()

// 浅拷贝消息列表，用于初始化 AI SDK 的 _useChat 实例。
// 目的：切断 store 与 AI SDK 内部状态在最外两层（消息对象、parts 数组、metadata 对象）
// 的引用共享，避免双方相互泄露改动；同时避免 es-toolkit cloneDeep 对含 base64/工具结果/
// audio chunks 的历史消息做递归深拷贝带来的主线程阻塞。
// 嵌套对象（如 part.input、metadata.usage）仍按引用共享——AI SDK 对历史消息只读不写，
// 流式新消息由 AI SDK 自行创建，不共享本拷贝，因此无需深拷贝。
const cloneMessagesForChat = (messages: BaseMessage[]): BaseMessage[] =>
  messages.map((msg) => ({
    ...msg,
    parts: msg.parts ? msg.parts.map((part) => ({ ...part })) : msg.parts,
    metadata: msg.metadata ? { ...msg.metadata } : msg.metadata
  }))

// 重试停止处理器（按 chatId:messageId 索引）。
// 不放进消息 metadata，避免被 pinia 持久化时触发循环引用 / 序列化函数失败。
const retryStopHandlers = new Map<string, () => void>()
const retryStopHandlerKey = (chatId: string, messageId: string) => `${chatId}:${messageId}`
export const getRetryStopHandler = (chatId: string, messageId: string) =>
  retryStopHandlers.get(retryStopHandlerKey(chatId, messageId))

export const useChat = (chatId: string) => {
  if (chatCache.has(chatId)) {
    return chatCache.get(chatId)
  }

  const {
    ensureChatAgent,
    getChatById,
    shiftPendingMessage,
    updateMessageMetadata,
    updateMessageAudioChunks,
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

    useChatsStores().clearChatGuided(chatId)

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

  const createChat = (
    messages: BaseMessage[],
    options?: { regenerateMessageId?: string; isApproval?: boolean }
  ): UseChatHelpers<BaseMessage> => {
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
        updateMessageMetadata,
        updateMessageAudioChunks
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
          retryAttempt = 0
          const storeChat = getChatById(chatId)
          const target = storeChat?.messages.find((m) => m.id === failedMessageId)
          if (target) {
            const { stop, ...cleanMeta } = target.metadata || ({} as MetaData)
            updateMessageMetadata(chatId, failedMessageId, {
              ...cleanMeta,
              retrying: false,
              loading: false,
              error: new Error('用户已停止自动重试')
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
            loading: false
          } as MetaData)
        }

        setMessageRetryState(endsAt)

        // 将停止函数存到 metadata.stop（仅内存，不持久化），
        // 使重试期间流式输出的停止按钮也能用于停止重试
        const chatStore = getChatById(chatId)
        if (chatStore) {
          const nextMsgs = chatStore.messages.map((m) =>
            m.id === failedMessageId
              ? { ...m, metadata: { ...m.metadata, stop: stopRetry } as MetaData }
              : m
          )
          updateMessages(chatId, nextMsgs, { persist: false })
        }

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
          // 清理 metadata.stop，新 stream 会设置自己的
          {
            const storeChat = getChatById(chatId)
            if (storeChat) {
              const cleanedMsgs = storeChat.messages.map((m) =>
                m.id === failedMessageId
                  ? { ...m, metadata: { ...m.metadata, stop: undefined } as unknown as MetaData }
                  : m
              )
              updateMessages(chatId, cleanedMsgs, { persist: false })
            }
          }
          // 停止当前 scope，然后重新发起请求：
          // - 失败消息已有内容（parts 非空）→ 用「继续」在同一消息上接着生成
          // - 失败消息没有任何内容（parts 为空）→ 用 regenerate 从用户消息重新生成
          scope.stop()
          const storeChat = getChatById(chatId)
          const failedMessage = storeChat?.messages.find((m) => m.id === failedMessageId)
          if (failedMessage && failedMessage.parts.length > 0) {
            result.continueMessages()
          } else {
            result.regenerate(failedMessageId)
          }
        }, intervalMs)
      }

      // 标记是否已安排自动重试。错误时 AI SDK 可能同时触发 onError 与 onFinish，
      // 用此标志让 onFinish 在重试等待期间跳过收尾与状态清理。
      let retryScheduled = false

      const chat = _useChat<BaseMessage>({
        id: chatId,
        messages: cloneMessagesForChat(messages),
        sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
        transport: {
          sendMessages: async ({ messages }) => {
            const _t3 = createTimeLog('transport.sendMessages(发送传输)')
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

            // 读取选中的 MCP 资源内容，注入为上下文
            const selectedMcpResources = (runtimeChat as any)?.selectedMcpResources as Record<string, string[]> | undefined
            let mcpResourceContent = ''
            if (selectedMcpResources && Object.keys(selectedMcpResources).length > 0) {
              const mcpClient = agentStore.getMcpByAgent(runtimeAgent.id).mcpServers
              const resourceParts: string[] = []
              for (const [serverName, uris] of Object.entries(selectedMcpResources)) {
                for (const uri of (uris || [])) {
                  try {
                    // 优先走 store 缓存（激活/刷新时预取），再 fallback 到实时读取
                    const cached = settingsStore.getMcpResourceCache(serverName, uri)
                    const result = cached?.content ?? await window.api.read_mcp_resource(JSON.parse(JSON.stringify(mcpClient)), serverName, uri)
                    const text = (result.contents || [])
                      .filter((c: any) => c.text)
                      .map((c: any) => c.text)
                      .join('\n')
                    if (text) {
                      resourceParts.push(`[${serverName}] ${uri}\n${text}`)
                    }
                  } catch {
                    resourceParts.push(`[${serverName}] ${uri} (读取失败)`)
                  }
                }
              }
              if (resourceParts.length > 0) {
                mcpResourceContent = [
                  '以下是用户选中的 MCP 资源内容，作为本次对话的上下文参考：',
                  '---',
                  ...resourceParts,
                  '---'
                ].join('\n')
              }
            }

            return service.createAgent(
              chat.id.value,
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
                mcpResourceContent,
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
                enableCodexEnvContext: runtimeAgent?.enableCodexEnvContext,
                providerOptions: providerOptions.value[selectedProvider.id],
                isApprovalAction: isApproval,
                stopWhen: [() => useChatsStores().isChatGuided(chatId)]
              }
            )
            syncTimeLog(_t3, 'transport.sendMessages(发送传输)')
          },
          reconnectToStream: undefined as any
        },

        onFinish: ({ message: finalMessage }) => {
          const _t4 = createTimeLog('onFinish')
          // 错误时 AI SDK 可能也会触发 onFinish；若已安排自动重试，
          // 这里不收尾，重试由 retryTimer 驱动。
          if (retryScheduled) return
          messageSyncController.finalizeMessageSync(finalMessage)
          speechController.finishMessageSpeech(finalMessage)

          // 真正成功完成：重置重试计数
          retryAttempt = 0

          if (!manuallyStopped) {
            void subTaskCoordinator.submitSummaryOnStop()
          }
          scope.stop()
          scheduleNextPendingMessage()
          syncTimeLog(_t4, 'onFinish')
        },

        onError: (error) => {
          const _t5 = createTimeLog('onError')
          console.error(error)
          // 将 error 扁平化为可序列化的 Error，避免原始错误对象（如 _TypeValidationError）
          // 携带循环引用，导致 chats store 持久化时 JSON.stringify 报错。
          const serializableError = new Error((error as Error)?.message || '请求失败')
          const failedMessage = chat.messages.value[chat.messages.value.length - 1]
          messageSyncController.finalizeMessageSync(
            failedMessage,
            serializableError as APICallError
          )
          speechController.fail(error)

          const failedMessageId = failedMessage?.id

          // 用户手动停止：不重试
          if (manuallyStopped) {
            subTaskCoordinator.markFailed('用户手动停止了子任务')
            scope.stop()
            scheduleNextPendingMessage()
            return
          }

          // 检查智能体是否配置了自动重试，缺省（未配置）视为开启自动重试
          const agent = getChatAgent()
          const autoRetryEnabled =
            agent?.retryAutoEnabled !== false && !!failedMessageId && !isApproval

          if (!autoRetryEnabled) {
            subTaskCoordinator.markFailed((error as Error).message || '子任务执行失败')
            scope.stop()
            scheduleNextPendingMessage()
            return
          }

          // 安排下一次重试：保持当前 scope 存活，由 retryTimer 驱动
          retryScheduled = true
          retryAttempt += 1
          scheduleRetry(failedMessageId!, retryAttempt)
          syncTimeLog(_t5, 'onError')
        }
      })

      // AI SDK 的 VueChatState.replaceMessage 在每次流式更新时都会用
      // `{ ...message }` 生成新消息对象（见 @ai-sdk/vue chat.vue.ts），lastMessage
      // 的对象引用随之改变，因此浅监听即可在每个 token 到达时触发，无需 deep:true
      // 避免对含大量 parts/metadata/工具结果的消息做递归深度比较造成的主线程压力。
      watch(
        chat.messages,
        (newMessages) => {
          messageSyncController.scheduleStreamingUpdate(newMessages[newMessages.length - 1])
        }
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

      const _t1 = createTimeLog('buildContextMessages(send)')
      const isFirstMessage = getVisibleMessages().length === 0
      const contextMessages = await buildContextMessages(chatId, {})
      syncTimeLog(_t1, 'buildContextMessages(send)')
      const _t2 = createTimeLog('createChat(send)')
      const chat = createChat(contextMessages)
      syncTimeLog(_t2, 'createChat(send)')

      const parts: Array<FileUIPart | TextUIPart> =
        typeof content === 'string' ? [{ type: 'text', text: content }] : content

      chat.sendMessage({
        id: nanoid(),
        role: 'user',
        parts
      })

      if (isFirstMessage) {
        const userText = typeof content === 'string'
          ? content
          : content.filter((p): p is TextUIPart => p.type === 'text').map((p) => p.text).join(' ')
        useTitle(chatId).generateTitle(userText)
      }
    },
    continueMessages: async () => {
      const _t6 = createTimeLog('continueMessages')
      const contextMessages = await buildContextMessages(chatId, {})
      const chat = createChat(contextMessages)
      chat.sendMessage()
      syncTimeLog(_t6, 'continueMessages')
    },
    retryFromToolCall: async (toolCallId: string, position: 'above' | 'below') => {
      const _t8 = createTimeLog('retryFromToolCall')
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
              parts: truncatedParts.map((part) => ({ ...part })),
              metadata: clearTransientMetadata(message.metadata)
            }
          ]
          : baseMessages

      updateMessages(chatId, cloneMessagesForChat(nextMessages))

      scrollToBottom()
      const contextMessages = await buildContextMessages(chatId, {})
      const chat = createChat(contextMessages)
      chat.sendMessage()
      syncTimeLog(_t8, 'retryFromToolCall')
    },
    regenerate: async (messageId: string) => {
      const _t7 = createTimeLog('regenerate')
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
          ? cloneMessagesForChat(messages.slice(0, retryAnchorMessageIndex + 1))
          : cloneMessagesForChat(messages)
      updateMessages(chatId, retryMessages)
      const contextMessages = await buildContextMessages(chatId, {})
      const chat = createChat(contextMessages, {
        regenerateMessageId
      })
      chat.regenerate({ messageId: regenerateMessageId })
      syncTimeLog(_t7, 'regenerate')
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
