import {
  ToolLoopAgent,
  wrapLanguageModel,
  extractReasoningMiddleware,
  convertToModelMessages,
  validateUIMessages,
  toUIMessageStream
} from 'ai'
import { createRegistry } from './registry'
import { getBuiltinToolGroups, getBuiltinTools } from '../builtin-tools'
import { buildSkillsPrompt, discoverSkills } from '../skillsService'
import { createRagMiddleware } from './middleware/rags'
import { createContextLimitMiddleware } from './middleware/contextLimit'
import { createCompressContextMiddleware } from './middleware/compressContext'
import { createUsageGuardMiddleware } from './middleware/usageGuard'
import { createSkillReferenceMiddleware } from './middleware/skillReferences'
import { createTextFileMiddleware } from './middleware/textFiles'
import { normalizeInlineFilePartUrls, sanitizeUIMessages } from './utils'
import { createToolMiddleware } from './middleware/createToolMiddleware'
import { buildCodexEnvironmentPrompt, buildMultiAgentSystemPrompt } from './systemPrompts'
import { createTokenEstimationMiddleware } from './middleware/tokenEstimation'
import { isMobile } from '@renderer/composables/useDeviceType'
import { messageApi } from '@renderer/utils/messages'
import { onUseAIBefore } from '@renderer/utils/onuseAIbefore'
import { onUseToolAfter } from '@renderer/utils/onUseToolAfter'
import { retry } from '@renderer/utils'
import { autoCompressContext } from './contextCompression'
import { createGenerationService } from './generation'
import { resolveProviderRuntime } from './providerRuntime'
import type { ChatServiceConfig, ChatServiceOptions } from './types'

const MOBILE_UNSUPPORTED_TOOL_GROUPS = new Set([
  '电脑操作',
  'Agent工具',
  '知识库',
  'Codex工具',
  '插件工具'
])
const MOBILE_UNSUPPORTED_BUILTIN_TOOLS = new Set(['exec_command_canvas'])

// MCP 工具列表渲染层缓存：避免每次发送消息都执行
// `JSON.parse(JSON.stringify(mcpClient))` 深拷贝 + IPC 往返 + 弹出 loading 遮罩。
// preload 侧虽然也有按 config 是否变化判断的缓存，但渲染层缓存可以在命中时
// 完全跳过 IPC 与 loading，进一步缩短「点击发送 → 首个 token」的延迟。
// 按 mcpClient 序列化结果作为 key，配置变化自动失效；TTL 5 分钟。
const MCP_TOOLS_CACHE_TTL = 5 * 60 * 1000
const mcpToolsCache = new Map<string, { tools: Tools; timestamp: number }>()

const shouldStopForToolResult = (toolResult: { toolName?: string; output: unknown }): boolean => {
  return Boolean((toolResult.output as any)?.queueAsUserMessage)
}

export const chatService = () => {
  const createAgent = async (
    cid: string,
    { model, apiKey, baseURL, provider, providerType }: ChatServiceOptions,
    messages: BaseMessage[],
    {
      mcpClient,
      instructions,
      mcpTools,
      mcpResourceContent,
      builtinTools: selectedBuiltinTools,
      builtinToolsRequireApproval,
      builtinToolConfigs,
      skillsEnabled = true,
      knowledgeBaseIds,
      thinkingMode,
      ragEnabled,
      temperature,
      topP,
      topK,
      presencePenalty,
      frequencyPenalty,
      maxOutputTokens,
      contextCount,
      contextTokenCount,
      autoCompressContext: shouldAutoCompress,
      compressModel,
      maxToolCalls,
      enableCodexEnvContext,
      providerOptions: customProviderOptions,
      onBeforeToolExecute,
      isApprovalAction,
      abortSignal,
      stopWhen
    }: ChatServiceConfig
  ) => {
    const _t0 = createTimeLog('onUseAIBefore')
    await onUseAIBefore({ model, providerType, apiKey, baseURL })
    syncTimeLog(_t0, 'onUseAIBefore')

    // 自动压缩上下文
    let _t1 = 0
    if (shouldAutoCompress) {
      _t1 = createTimeLog('自动压缩上下文')
      messages = await autoCompressContext({
        cid,
        messages,
        contextCount,
        contextTokenCount,
        compressModel,
        activeModel: model
      })
      syncTimeLog(_t1, '自动压缩上下文')
    }

    let tools: Tools = {}

    const _t2 = createTimeLog('工具发现')
    const skills = discoverSkills(undefined, { chatId: cid })
    const hasLoadSkillTool = skillsEnabled && !!selectedBuiltinTools?.includes('loadSkill')
    const skillsForBuiltinTools = skillsEnabled ? skills : []
    const builtinToolContext = {
      knowledgeBaseIds,
      skills: skillsForBuiltinTools,
      builtinToolConfigs,
      builtinTools: selectedBuiltinTools
    }
    const builtinTools = getBuiltinTools(builtinToolContext)
    const mobileCompatibleBuiltinToolKeys = new Set(
      Object.entries(getBuiltinToolGroups(builtinToolContext))
        .filter(([group]) => !MOBILE_UNSUPPORTED_TOOL_GROUPS.has(group))
        .flatMap(([, toolKeys]) => toolKeys)
    )
    const skillsPrompt = hasLoadSkillTool ? buildSkillsPrompt(skills, cid) : ''
    syncTimeLog(_t2, '工具发现')
    const currentChat = useChatsStores().getChatById(cid)
    const agentWorkPath = useCanvasStore().getWorkPath(cid) || undefined
    const isSubAgentChat = !!currentChat?.parentChatId
    const assignedBuiltinTools = (selectedBuiltinTools || []).filter(
      (toolName) =>
        toolName !== 'finish_sub_task' &&
        !(isSubAgentChat && toolName === 'delegate_to_sub_agent') &&
        (!isMobile.value ||
          (mobileCompatibleBuiltinToolKeys.has(toolName) &&
            !MOBILE_UNSUPPORTED_BUILTIN_TOOLS.has(toolName)))
    )
    const hasAssignedAgentTools = assignedBuiltinTools.some(
      (toolName) => toolName === 'delegate_to_sub_agent'
    )
    const _t3 = createTimeLog('系统提示词组装')
    const multiAgentPrompt =
      hasAssignedAgentTools || isSubAgentChat ? buildMultiAgentSystemPrompt(cid) : ''
    const codexEnvironmentPrompt =
      enableCodexEnvContext !== false
        ? buildCodexEnvironmentPrompt(cid, assignedBuiltinTools)
        : ''
    const agentInstructions =
      [codexEnvironmentPrompt, instructions?.trim(), skillsPrompt, multiAgentPrompt, mcpResourceContent]
        .filter(Boolean)
        .join('\n\n') || undefined
    syncTimeLog(_t3, '系统提示词组装')

    const builtinToolKeys = new Set<string>(assignedBuiltinTools)
    if (isSubAgentChat) {
      builtinToolKeys.add('finish_sub_task')
    }
    const builtinToolApprovalKeys = new Set<string>(builtinToolsRequireApproval || [])

    if (builtinToolKeys.size > 0) {
      builtinToolKeys.forEach((toolKey) => {
        if (toolKey in builtinTools) {
          tools[toolKey] = builtinTools[toolKey]
        }
      })
    }

    const _t4 = createTimeLog('MCP工具加载')
    if (!isMobile.value && mcpTools && mcpTools.length > 0) {
      const mcpCacheKey = JSON.stringify(mcpClient)
      const mcpCached = mcpToolsCache.get(mcpCacheKey)
      const mcpCacheFresh = mcpCached && Date.now() - mcpCached.timestamp < MCP_TOOLS_CACHE_TTL

      const applyMcpTools = (allTools: Tools) => {
        mcpTools.forEach((toolKey) => {
          const key = toolKey.split('.')[1]
          if (key && allTools[key]) {
            tools[key] = allTools[key]
          }
        })
      }

      if (mcpCacheFresh) {
        applyMcpTools(mcpCached!.tools)
      } else {
        const close = messageApi.loading('连接mcp服务器中...')
        try {
          // mcpClient 来自 agentStore.getMcpByAgent(...).mcpServers，最终指向
          // settings.mcpServers 的 Pinia reactive proxy。structuredClone 对 Proxy
          // 会抛 DataCloneError，所以这里仍用 JSON 深拷贝：既能剥离响应式代理，
          // 又能切断 preload 侧对 store 的引用共享。MCP 配置是纯数据（无函数/Date），
          // JSON 方式安全。仅在 cache miss（每 5 分钟最多一次）时执行，热路径已由缓存覆盖。
          const allTools = await list_tools(JSON.parse(JSON.stringify(mcpClient)))
          mcpToolsCache.set(mcpCacheKey, { tools: allTools, timestamp: Date.now() })
          applyMcpTools(allTools)
        } catch (error) {
          messageApi.error((error as Error).message)
        } finally {
          close()
        }
      }
    }
    syncTimeLog(_t4, 'MCP工具加载')
    let ragSearchDetails:
      | Array<{ knowledgeBaseId: string; documentId: string; score?: number }>
      | undefined

    const controller = new AbortController()
    if (abortSignal) {
      if (abortSignal.aborted) {
        controller.abort()
      } else {
        abortSignal.addEventListener('abort', () => controller.abort(), { once: true })
      }
    }
    const wrappedTools = Object.fromEntries(
      Object.entries(tools).map(([toolName, t]) => {
        const isConfiguredBuiltinTool = builtinToolKeys.has(toolName)
        const needsConfiguredApproval =
          isConfiguredBuiltinTool && builtinToolApprovalKeys.has(toolName)

        const needsApproval =
          toolName === 'multi_tool_use_parallel' && isConfiguredBuiltinTool
            ? (input: unknown) => {
                if (needsConfiguredApproval) return true

                const toolUses = (input as { tool_uses?: Array<{ recipient_name?: string }> })
                  ?.tool_uses
                if (!Array.isArray(toolUses)) return false

                return toolUses.some((toolUse) => {
                  const recipientName = toolUse?.recipient_name || ''
                  if (!recipientName.startsWith('builtin.')) return false
                  const nestedToolName = recipientName.slice('builtin.'.length)
                  return builtinToolApprovalKeys.has(nestedToolName)
                })
              }
            : needsConfiguredApproval

        return [
          toolName,
          {
            ...t,
            needsApproval,
            execute: async (input: any, options: any) => {
              await onBeforeToolExecute?.({ tool: t, input, options })
              const result = await t.execute(input, {
                ...JSON.parse(JSON.stringify(options)),
                chatId: cid,
                model,
                provider,
                availableBuiltinTools: Array.from(builtinToolKeys)
              })
              const hookResult = await onUseToolAfter({
                toolName,
                input,
                result,
                options: { chatId: cid, model, provider }
              })
              return hookResult
            }
          }
        ]
      })
    )
    const _t5 = createTimeLog('ProviderRuntime解析')
    const { providerOptionsKey, mergedProviderOptions, transformRequestBody } =
      resolveProviderRuntime({
        providerType,
        provider,
        baseURL,
        model,
        thinkingMode,
        customProviderOptions
      })
    syncTimeLog(_t5, 'ProviderRuntime解析')
    const shouldEnableParallelToolCalls =
      assignedBuiltinTools.includes('multi_tool_use_parallel') &&
      (providerType === 'openai' || providerType === 'openai-compatible') &&
      mergedProviderOptions.parallelToolCalls == null
    const runtimeProviderOptions = shouldEnableParallelToolCalls
      ? { ...mergedProviderOptions }
      : mergedProviderOptions

    const agent = new ToolLoopAgent({
      model: wrapLanguageModel({
        model: createRegistry({
          apiKey,
          baseURL,
          name: provider,
          transformRequestBody
        }).languageModel(`${providerType}:${model}`),
        middleware: [
          extractReasoningMiddleware({ tagName: 'think' }),
          createUsageGuardMiddleware(),
          createToolMiddleware(),
          createTextFileMiddleware(),
          createCompressContextMiddleware({ cid, contextCount }),
          createContextLimitMiddleware({ contextCount }),
          createRagMiddleware({
            knowledgeBaseIds,
            ragEnabled: !!knowledgeBaseIds && knowledgeBaseIds.length > 0 && ragEnabled,
            onRagSearchComplete: (details) => {
              ragSearchDetails = details?.map((item) => ({ ...item }))
            }
          }),
          createSkillReferenceMiddleware({ skills, workPath: agentWorkPath }),
          createTokenEstimationMiddleware((result) => {
            estimatedPromptTokens = result.total
          })
        ]
      }),
      providerOptions: {
        [providerOptionsKey]: runtimeProviderOptions
      },
      tools: wrappedTools,
      temperature,
      topP,
      topK,
      presencePenalty,
      frequencyPenalty,
      maxOutputTokens: maxOutputTokens || undefined,
      instructions: agentInstructions,
      stopWhen: [
        ({ steps }) => {
          const maxSteps = maxToolCalls && maxToolCalls > 0 ? maxToolCalls : undefined
          return (
            (maxSteps != null && steps.length >= maxSteps) ||
            (steps.some((step) =>
              step.toolResults?.some((toolResult) => {
                return shouldStopForToolResult({
                  toolName: toolResult.toolName,
                  output: toolResult.output
                })
              })
            ) ??
              false)
          )
        },
        ...(stopWhen || [])
      ]
    })

    // 1. 清洗数据：移除历史中没有结果的工具调用，修复不兼容字段，防止模型报错
    const _t6 = createTimeLog('消息清洗验证归一化')
    const sanitizedMessages = sanitizeUIMessages(messages, {
      isManualApproval: isApprovalAction || false
    })

    // 2. Validate UI messages
    const validatedMessages = await validateUIMessages({
      messages: sanitizedMessages,
      tools: agent.tools
    })

    const normalizedMessages = normalizeInlineFilePartUrls(sanitizedMessages)

    // 3. 按 contextCount 截断 UI 消息（在 convertToModelMessages 之前，按整条消息计数）
    const contextTruncatedMessages =
      contextCount && contextCount > 0 && normalizedMessages.length > contextCount
        ? normalizedMessages.slice(-contextCount)
        : normalizedMessages

    // 4. Convert to model messages
    const modelMessages = await convertToModelMessages(contextTruncatedMessages)
    syncTimeLog(_t6, '消息清洗验证归一化')

    let estimatedPromptTokens = 0

    const _t7 = createTimeLog('agent.stream')
    const result = await agent.stream({
      prompt: modelMessages,
      abortSignal: controller.signal
    })
    syncTimeLog(_t7, 'agent.stream')

    const uiStream = toUIMessageStream({ stream: result.stream,
      originalMessages: validatedMessages,
      messageMetadata: ({ part }) => {
        let finishMetadata = {}
        if (part.type === 'finish-step' && part.finishReason === 'stop') {
          finishMetadata = {
            usage: part.usage,
            providerMetadata: part.providerMetadata!
          }
        }
        return {
          loading: part.type !== 'finish' && part.type !== 'abort',
          provider,
          date: Date.now(),
          model,
          cid,
          estimatedInputTokens: estimatedPromptTokens,
          stop: () => controller.abort(),
          ragSearchDetails: ragSearchDetails?.map((item) => ({ ...item })),
          ragEnabled: !!knowledgeBaseIds && knowledgeBaseIds.length > 0 && ragEnabled,
          ...finishMetadata
        }
      }
    })
    return uiStream
  }
  const {
    generateText,
    generateTextWithMessages,
    streamText,
    generateImage,
    translateText,
    generateVideo,
    list_models
  } = createGenerationService()

  const list_tools = async (config: ClientConfig, cache?: boolean) => {
    try {
      const tools = await retry(
        async () => {
          return await window.api.list_tools(config, cache)
        },
        {
          retries: 3,
          delay: 100
        }
      )
      return tools
    } catch (error) {
      messageApi.error((error as Error).message)
      throw error
    }
  }
  return {
    createAgent,
    list_models,
    list_tools,
    generateText,
    generateTextWithMessages,
    streamText,
    translateText,
    generateImage,
    generateVideo
  }
}
