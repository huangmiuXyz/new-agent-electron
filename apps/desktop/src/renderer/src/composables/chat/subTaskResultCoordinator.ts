import { z } from 'zod'
import { nanoid } from '@renderer/utils/nanoid'
import type { chatService } from '@renderer/services/chatService'

type SubTaskResultCoordinatorOptions = {
  chatId: string
  service: ReturnType<typeof chatService>
  settingsStore: ReturnType<typeof useSettingsStore>
  getChatById: (chatId: string) => Chat | undefined | null
  getChatAgent: () => Agent | null
  getVisibleMessages: () => BaseMessage[]
  triggerNextPendingMessage: (chatId: string) => void
}

type SubTaskResult = {
  success?: boolean
  summary?: string
  error?: string
}

export const createSubTaskResultCoordinator = ({
  chatId,
  service,
  settingsStore,
  getChatById,
  getChatAgent,
  getVisibleMessages,
  triggerNextPendingMessage
}: SubTaskResultCoordinatorOptions) => {
  const submitSubTaskResultToParent = (params: SubTaskResult) => {
    const runtimeChat = getChatById(chatId)
    if (!runtimeChat?.parentChatId || runtimeChat.subTask?.status !== 'running') return

    const runtimeAgent = getChatAgent()
    const success = params.success !== false
    const summary = String(params.summary || '').trim()
    const error = String(params.error || '').trim()
    const status: SubTaskStatus = success ? 'completed' : 'failed'
    const childAgentName = runtimeAgent?.name || runtimeChat.title || '子智能体'
    const taskText = runtimeChat.subTask?.task || runtimeChat.title

    useChatsStores().updateSubTask(chatId, {
      status,
      completedAt: Date.now(),
      result: summary,
      error: success ? undefined : error || '子任务执行失败',
      subTaskResultSubmitted: true
    })

    const parentChatId = runtimeChat.parentChatId
    const chatsStore = useChatsStores()
    const messageId = chatsStore.addPendingMessage(parentChatId, [
      {
        type: 'text',
        text:
          `[子智能体总结]\n` +
          `来自: ${childAgentName}\n` +
          `状态: ${status}\n` +
          `任务: ${taskText}\n` +
          `总结: ${summary || (success ? '子任务已完成，但未返回总结。' : '子任务执行失败。')}` +
          (!success && error ? `\n错误: ${error}` : '')
      }
    ])

    if (chatsStore.isChatGenerating(parentChatId)) {
      chatsStore.prioritizePendingMessage(parentChatId, messageId)
      chatsStore.markChatGuided(parentChatId)
    }

    triggerNextPendingMessage(parentChatId)
  }

  const markFailed = (error: string) => {
    submitSubTaskResultToParent({
      success: false,
      summary: error,
      error
    })
  }

  const finishParentMessage = () => {
    const parentChatId = getChatById(chatId)?.parentChatId
    if (parentChatId) {
      triggerNextPendingMessage(parentChatId)
    }
  }

  const submitSummaryOnStop = async () => {
    const runtimeChat = getChatById(chatId)
    if (!runtimeChat?.parentChatId) return

    if (runtimeChat.subTask?.subTaskResultSubmitted) {
      finishParentMessage()
      return
    }

    if (runtimeChat.subTask?.status !== 'running') return

    const runtimeAgent = getChatAgent()
    const providerId = runtimeChat.providerId
    const modelId = runtimeChat.modelId
    const selectedProvider = providerId ? settingsStore.getProviderById(providerId) : null
    const selectedModel =
      providerId && modelId ? settingsStore.getModelById(providerId, modelId).model : null

    if (!runtimeAgent || !selectedProvider || !selectedModel) {
      markFailed('子任务总结失败：未找到会话绑定的智能体或模型配置')
      return
    }

    const childAgentName = runtimeAgent.name || runtimeChat.title || '子智能体'
    const taskText = runtimeChat.subTask?.task || runtimeChat.title

    const submitTool: Tool = {
      title: '提交子任务总结',
      description: '提交子智能体停止工作后的最终总结。必须使用结构化参数调用。',
      inputSchema: z.object({
        success: z.boolean().describe('任务是否成功完成'),
        summary: z.string().min(1).describe('面向主智能体的最终结论或成果摘要'),
        error: z.string().optional().describe('失败或阻塞原因，success=false 时填写')
      }),
      execute: async (args: unknown) => {
        const params = args as SubTaskResult
        submitSubTaskResultToParent(params)

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
    // 浅拷贝一次可见消息作为 base：generateTextWithMessages 内部对历史消息只读不写，
    // 嵌套对象（part.input、metadata.usage 等）按引用共享是安全的。
    // 之前用 cloneDeep 会对含工具结果/长文本的全部历史做递归深拷贝，且拷了两次，
    // 子任务停止时长会话主线程明显阻塞。
    const baseMessages: BaseMessage[] = getVisibleMessages().map((msg) => ({
      ...msg,
      parts: msg.parts ? msg.parts.map((part) => ({ ...part })) : msg.parts,
      metadata: msg.metadata ? { ...msg.metadata } : msg.metadata
    }))
    const summaryMessages: BaseMessage[] = [
      ...baseMessages,
      {
        id: nanoid(),
        role: 'user',
        parts: [{ type: 'text', text: prompt }]
      } as BaseMessage
    ]
    const fallbackMessages: BaseMessage[] = [
      ...baseMessages,
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
        markFailed('子任务总结失败：模型没有返回总结正文')
        return
      }
      submitSubTaskResultToParent({ success: true, summary })
    }

    try {
      const result = await service.generateTextWithMessages(summaryMessages, {
        model: modelId!,
        apiKey: selectedProvider.apiKey!,
        baseURL: selectedProvider.baseUrl!,
        provider: providerId!,
        providerType: selectedProvider.providerType,
        tools: { finish_sub_task: submitTool },
        toolChoice: {
          type: 'tool',
          toolName: 'finish_sub_task'
        }
      })
      if (
        !result.toolResults?.some((toolResult) => toolResult.toolName === 'finish_sub_task')
      ) {
        markFailed('子任务总结失败：模型没有调用提交总结工具')
      }
    } catch (error) {
      const message = (error as Error).message || '子任务总结失败'
      try {
        await generatePlainTextSummary()
      } catch {
        markFailed(message)
      }
    }
  }

  return {
    markFailed,
    submitSummaryOnStop
  }
}
