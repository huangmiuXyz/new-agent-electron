import { Chat as _useChat } from '@ai-sdk/vue'
import type { APICallError, FileUIPart, TextUIPart, ToolUIPart } from 'ai'
import { lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai'
import { z } from 'zod'
import { speechService } from '../services/speechService'
import { useMessageScroll } from './useMessageScroll'
import {
  buildFlatTokenUsage,
  estimateMessageTokens,
  getFlatTokenUsage
} from '@renderer/services/chatService/tokenUsage'

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

const chatCache = new Map<string, any>()
const STREAM_SYNC_INTERVAL_MS = 80

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
      let processedText = ''
      let manuallyStopped = false
      let sentenceSegmenter = createSentenceSegmenter(getChatAgent()?.speechLanguage)
      let streamFlushHandle: ReturnType<typeof setTimeout> | null = null
      let pendingStreamParts: (TextUIPart | ToolUIPart | FileUIPart)[] | undefined
      let pendingSpeechMessage: BaseMessage | undefined
      const pendingSyncMessageIds: string[] = []
      const pendingSyncMessages = new Map<string, BaseMessage>()

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

      const markSubTaskFailed = (error: string) => {
        const runtimeChat = getChatById(chatId)
        if (!runtimeChat?.parentChatId || runtimeChat.subTask?.status !== 'running') return

        useChatsStores().updateSubTask(chatId, {
          status: 'failed',
          completedAt: Date.now(),
          error
        })
      }

      const submitSubTaskSummary = async () => {
        const runtimeChat = getChatById(chatId)
        if (!runtimeChat?.parentChatId || runtimeChat.subTask?.status !== 'running') return

        const runtimeAgent = getChatAgent()
        const providerId = runtimeChat.providerId
        const modelId = runtimeChat.modelId
        const selectedProvider = providerId ? settingsStore.getProviderById(providerId) : null
        const selectedModel =
          providerId && modelId ? settingsStore.getModelById(providerId, modelId).model : null

        if (!runtimeAgent || !selectedProvider || !selectedModel) {
          markSubTaskFailed('子任务总结失败：未找到会话绑定的智能体或模型配置')
          return
        }

        const parentChatId = runtimeChat.parentChatId
        const childAgentName = runtimeAgent.name || runtimeChat.title || '子智能体'
        const taskText = runtimeChat.subTask?.task || runtimeChat.title

        const submitSummary = (params: { success?: boolean; summary?: string; error?: string }) => {
          const success = params.success !== false
          const summary = String(params.summary || '').trim()
          const error = String(params.error || '').trim()
          const status: SubTaskStatus = success ? 'completed' : 'failed'

          useChatsStores().updateSubTask(chatId, {
            status,
            completedAt: Date.now(),
            result: summary,
            error: success ? undefined : error || '子任务执行失败'
          })

          useChatsStores().addPendingMessage(parentChatId, [
            {
              type: 'text',
              text:
                `[子智能体总结]\n` +
                `来自: ${childAgentName}\n` +
                `状态: ${status}\n` +
                `任务: ${taskText}\n` +
                `总结: ${summary}` +
                (!success && error ? `\n错误: ${error}` : '')
            }
          ])
          triggerNextPendingMessage(parentChatId)
        }

        const submitTool: Tool = {
          title: '提交子任务总结',
          description: '提交子智能体停止工作后的最终总结。必须使用结构化参数调用。',
          inputSchema: z.object({
            success: z.boolean().describe('任务是否成功完成'),
            summary: z.string().min(1).describe('面向主智能体的最终结论或成果摘要'),
            error: z.string().optional().describe('失败或阻塞原因，success=false 时填写')
          }),
          execute: async (args: unknown) => {
            const params = args as { success?: boolean; summary?: string; error?: string }
            submitSummary(params)

            return {
              toolResult: {
                content: [{ type: 'text', text: '子任务总结已提交给主智能体。' }]
              }
            }
          }
        }

        const fallbackPrompt =
          `你刚刚作为子智能体停止工作。现在必须根据已完成的具体任务，输出给主智能体继续处理所需的最终总结。\n` +
          `总结必须直接回答任务要求，包含结论、产物、关键事实或失败原因。\n` +
          `不要复述会话记录，不要泛泛总结过程，只输出总结正文。\n\n` +
          `子智能体: ${childAgentName}\n` +
          `任务:\n${taskText}`
        const prompt =
          `你刚刚作为子智能体停止工作。现在必须根据已完成的具体任务，调用 submit_sub_task_result 工具提交最终结果。\n` +
          `summary 必须直接回答任务要求，包含主智能体继续处理所需的结论、产物、关键事实或失败原因。\n` +
          `不要复述会话记录，不要泛泛总结过程，不要输出自然语言正文，只调用工具。\n\n` +
          `子智能体: ${childAgentName}\n` +
          `任务:\n${taskText}`
        const summaryMessages: BaseMessage[] = [
          ...cloneDeep(getVisibleMessages()),
          {
            id: nanoid(),
            role: 'user',
            parts: [{ type: 'text', text: prompt }]
          } as BaseMessage
        ]
        const fallbackMessages: BaseMessage[] = [
          ...cloneDeep(getVisibleMessages()),
          {
            id: nanoid(),
            role: 'user',
            parts: [{ type: 'text', text: fallbackPrompt }]
          } as BaseMessage
        ]

        const generatePlainTextSummary = async () => {
          const result = await service.generateTextWithMessages(fallbackMessages, {
            model: modelId!,
            apiKey: selectedProvider.apiKey!,
            baseURL: selectedProvider.baseUrl!,
            provider: providerId!,
            providerType: selectedProvider.providerType
          })
          const summary = result.text.trim()
          if (!summary) {
            markSubTaskFailed('子任务总结失败：模型没有返回总结正文')
            return
          }
          submitSummary({ success: true, summary })
        }

        try {
          const result = await service.generateTextWithMessages(summaryMessages, {
            model: modelId!,
            apiKey: selectedProvider.apiKey!,
            baseURL: selectedProvider.baseUrl!,
            provider: providerId!,
            providerType: selectedProvider.providerType,
            tools: { submit_sub_task_result: submitTool },
            toolChoice: {
              type: 'tool',
              toolName: 'submit_sub_task_result'
            }
          })
          if (
            !result.toolResults?.some(
              (toolResult) => toolResult.toolName === 'submit_sub_task_result'
            )
          ) {
            markSubTaskFailed('子任务总结失败：模型没有调用提交总结工具')
          }
        } catch (error) {
          const message = (error as Error).message || '子任务总结失败'
          try {
            await generatePlainTextSummary()
          } catch {
            markSubTaskFailed(message)
          }
        }
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

            processedText = ''
            sentenceSegmenter = createSentenceSegmenter(runtimeAgent?.speechLanguage || 'und')
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
          finalizeMessageSync(finalMessage)

          if (speechEnabled.value) {
            const mode = getChatAgent()?.speechMode as string

            if (mode === 'sentence') {
              sentenceSegmenter.flush((sentence) => {
                generateSpeech(sentence, finalMessage)
              })
            } else {
              const fullText = getMessageText(finalMessage)
              const remainingText = fullText.slice(processedText.length).trim()
              if (remainingText) {
                generateSpeech(remainingText, finalMessage)
              }
            }
          }

          useTitle(chatId).generateTitle()
          if (!manuallyStopped) {
            void submitSubTaskSummary()
          }
          scope.stop()
          scheduleNextPendingMessage()
        },

        onError: (error) => {
          console.error(error)
          finalizeMessageSync(chat.lastMessage, error as APICallError)
          if (manuallyStopped) {
            markSubTaskFailed('用户手动停止了子任务')
          } else {
            markSubTaskFailed((error as Error).message || '子任务执行失败')
          }
          scope.stop()
          scheduleNextPendingMessage()
        }
      })

      const createStoreMessageSnapshot = (
        message?: BaseMessage,
        error?: APICallError
      ): BaseMessage | null => {
        if (!message) return null

        const nextParts = message.parts?.map((part) => ({ ...part }))
        const nextMetadata = {
          ...message.metadata,
          ...(error ? { error, loading: false } : {})
        } as MetaData
        if (nextMetadata.stop) {
          const originalStop = nextMetadata.stop
          nextMetadata.stop = (() => {
            manuallyStopped = true
            originalStop()
          }) as AbortController['abort']
        }
        const isFinalized = !nextMetadata.loading || !!error
        const flatUsage = getFlatTokenUsage(nextMetadata.usage)

        if (isFinalized) {
          const estimatedOutputTokens =
            flatUsage.outputTokens ?? estimateMessageTokens(message, nextMetadata.model)
          const estimatedInputTokens = flatUsage.inputTokens ?? nextMetadata.estimatedInputTokens
          const hasAnyUsage =
            flatUsage.totalTokens != null ||
            flatUsage.inputTokens != null ||
            flatUsage.outputTokens != null

          if (!hasAnyUsage || flatUsage.inputTokens == null || flatUsage.outputTokens == null) {
            nextMetadata.usage = buildFlatTokenUsage({
              inputTokens: estimatedInputTokens,
              outputTokens: estimatedOutputTokens,
              totalTokens: flatUsage.totalTokens,
              estimated: !hasAnyUsage
            }) as any
            nextMetadata.tokenUsageSource = hasAnyUsage ? 'mixed' : 'estimated'
          } else {
            nextMetadata.tokenUsageSource = 'reported'
          }
        }

        return {
          ...message,
          parts: nextParts,
          metadata: nextMetadata
        }
      }

      const syncMessageToStore = (
        message: BaseMessage | undefined = chat.lastMessage,
        error?: APICallError
      ) => {
        const msgToUpdate = createStoreMessageSnapshot(message ?? undefined, error)
        if (!msgToUpdate) return

        const storeChat = getChatById(chatId)
        if (!storeChat) return
        const oldMessages = storeChat.messages

        const existingIndex = oldMessages.findIndex((m) => m.id === msgToUpdate.id)
        if (existingIndex >= 0) {
          const existingMessage = oldMessages[existingIndex]
          // 如果引用没变，说明 snapshot 判定内容无变化，跳过 store 更新
          if (existingMessage === msgToUpdate) return

          updateMessages(chatId, (messages) =>
            replaceMessageById(messages, msgToUpdate.id!, (message) => ({
              ...message,
              parts: msgToUpdate.parts,
              metadata: msgToUpdate.metadata
            }))
          )
          return
        }

        if (!targetMessageId.value) {
          updateMessages(chatId, [...oldMessages, msgToUpdate])
          return
        }

        const targetIndex = oldMessages.findIndex((m) => m.id === targetMessageId.value)
        if (targetIndex < 0) {
          updateMessages(chatId, [...oldMessages, msgToUpdate])
          return
        }

        const copy = [...oldMessages]
        const targetMsg = copy[targetIndex]

        if (targetMsg.role === 'assistant') {
          copy[targetIndex] = msgToUpdate
        } else {
          copy.splice(targetIndex + 1, 0, msgToUpdate)
        }

        updateMessages(chatId, copy)
      }

      const queueMessageSync = (message?: BaseMessage, error?: APICallError) => {
        const messageSnapshot = createStoreMessageSnapshot(message, error)
        if (!messageSnapshot) return

        if (!pendingSyncMessages.has(messageSnapshot.id)) {
          pendingSyncMessageIds.push(messageSnapshot.id)
        }
        pendingSyncMessages.set(messageSnapshot.id, messageSnapshot)
      }

      const finalizeMessageSync = (message?: BaseMessage, error?: APICallError) => {
        if (!message) {
          flushStreamingUpdate()
          return
        }

        message.metadata = {
          ...message.metadata,
          loading: false,
          ...(error ? { error } : {})
        } as MetaData

        queueMessageSync(message, error)
        flushStreamingUpdate()
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

      const replaceMessageById = (
        messages: BaseMessage[],
        messageId: string,
        updater: (message: BaseMessage) => BaseMessage
      ) => {
        const messageIndex = messages.findIndex((message) => message.id === messageId)
        if (messageIndex < 0) return messages

        const nextMessages = [...messages]
        nextMessages[messageIndex] = updater(messages[messageIndex]!)
        return nextMessages
      }

      const flushStreamingUpdate = () => {
        if (streamFlushHandle) {
          clearTimeout(streamFlushHandle)
          streamFlushHandle = null
        }

        const messagesToSync = pendingSyncMessageIds
          .map((id) => pendingSyncMessages.get(id))
          .filter((message): message is BaseMessage => Boolean(message))

        pendingSyncMessageIds.length = 0
        pendingSyncMessages.clear()

        messagesToSync.forEach((message) => {
          syncMessageToStore(message)
        })

        processStreamingSpeech(pendingSpeechMessage, pendingStreamParts)
        pendingSpeechMessage = undefined
        pendingStreamParts = undefined
      }

      const scheduleStreamingUpdate = (message?: BaseMessage) => {
        const messageSnapshot = createStoreMessageSnapshot(message)
        if (!messageSnapshot) return

        if (!pendingSyncMessages.has(messageSnapshot.id)) {
          pendingSyncMessageIds.push(messageSnapshot.id)
        }
        pendingSyncMessages.set(messageSnapshot.id, messageSnapshot)

        pendingStreamParts = messageSnapshot.parts as
          | (TextUIPart | ToolUIPart | FileUIPart)[]
          | undefined
        pendingSpeechMessage = messageSnapshot.role === 'assistant' ? messageSnapshot : undefined

        if (streamFlushHandle) return

        // Batch token-level updates so markdown parsing, Pinia persistence, and list patching
        // do not run on every tiny stream chunk.
        streamFlushHandle = setTimeout(() => {
          flushStreamingUpdate()
        }, STREAM_SYNC_INTERVAL_MS)
      }

      watch(
        () => chat.lastMessage,
        (newMessage) => {
          scheduleStreamingUpdate(newMessage)
        },
        { deep: true }
      )

      onScopeDispose(() => {
        if (streamFlushHandle) {
          clearTimeout(streamFlushHandle)
          streamFlushHandle = null
        }
      })

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
      chat.addToolApprovalResponse({
        id: part.approval!.id!,
        approved
      })
    }
  }

  chatCache.set(chatId, result)
  return result
}
