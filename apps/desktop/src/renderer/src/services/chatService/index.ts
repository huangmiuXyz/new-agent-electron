import {
  ToolLoopAgent,
  wrapLanguageModel,
  extractReasoningMiddleware,
  type LanguageModelMiddleware,
  convertToModelMessages,
  validateUIMessages
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
import { estimateMessagesTokens } from './tokenUsage'
import { isMobile } from '@renderer/composables/useDeviceType'
import { messageApi } from '@renderer/utils/messages'
import { onUseAIBefore } from '@renderer/utils/onuseAIbefore'
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
      abortSignal
    }: ChatServiceConfig
  ) => {
    await onUseAIBefore({ model, providerType, apiKey, baseURL })

    // 自动压缩上下文
    if (shouldAutoCompress) {
      messages = await autoCompressContext({
        cid,
        messages,
        contextCount,
        contextTokenCount,
        compressModel,
        activeModel: model
      })
    }

    let tools: Tools = {}

    const skills = discoverSkills(undefined, { chatId: cid })
    const hasLoadSkillTool = skillsEnabled && !!selectedBuiltinTools?.includes('loadSkill')
    const skillsForBuiltinTools = skillsEnabled ? skills : []
    const builtinToolContext = {
      knowledgeBaseIds,
      skills: skillsForBuiltinTools,
      builtinToolConfigs
    }
    const builtinTools = getBuiltinTools(builtinToolContext)
    const mobileCompatibleBuiltinToolKeys = new Set(
      Object.entries(getBuiltinToolGroups(builtinToolContext))
        .filter(([group]) => !MOBILE_UNSUPPORTED_TOOL_GROUPS.has(group))
        .flatMap(([, toolKeys]) => toolKeys)
    )
    const skillsPrompt = hasLoadSkillTool ? buildSkillsPrompt(skills, cid) : ''
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
    const multiAgentPrompt =
      hasAssignedAgentTools || isSubAgentChat ? buildMultiAgentSystemPrompt(cid) : ''
    const codexEnvironmentPrompt =
      enableCodexEnvContext !== false
        ? buildCodexEnvironmentPrompt(cid, assignedBuiltinTools)
        : ''
    const agentInstructions =
      [codexEnvironmentPrompt, instructions?.trim(), skillsPrompt, multiAgentPrompt]
        .filter(Boolean)
        .join('\n\n') || undefined

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
              // 浅拷贝 options 即可：options 只在工具调用时被读取，不会被就地修改；
              // 我们要新增的 chatId/model/provider 等字段也是顶层属性。
              // 之前用 JSON.parse(JSON.stringify(options)) 会对每次工具调用做一次
              // 全量深拷贝，工具循环越多开销越大，且会丢失 options 上的函数/AbortSignal
              // 等不可序列化字段。
              const result = await t.execute(input, {
                ...JSON.parse(JSON.stringify(options)),
                chatId: cid,
                model,
                provider,
                availableBuiltinTools: Array.from(builtinToolKeys)
              })
              return result
            }
          }
        ]
      })
    )
    const { providerOptionsKey, mergedProviderOptions, transformRequestBody } =
      resolveProviderRuntime({
        providerType,
        provider,
        baseURL,
        model,
        thinkingMode,
        customProviderOptions
      })
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
          createSkillReferenceMiddleware({ skills, workPath: agentWorkPath })
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
        }
      ]
    })

    // 1. Validate UI messages
    const validatedMessages = await validateUIMessages({
      messages,
      tools: agent.tools
    })

    // 2. 清洗数据：移除历史中没有结果的工具调用，防止模型报错
    const sanitizedMessages = sanitizeUIMessages(validatedMessages, {
      isManualApproval: isApprovalAction || false
    })

    const normalizedMessages = normalizeInlineFilePartUrls(sanitizedMessages)

    // 3. Convert to model messages
    const modelMessages = await convertToModelMessages(normalizedMessages)

    const estimatedPromptTokens = estimateMessagesTokens(messages, model)

    const result = await agent.stream({
      prompt: modelMessages,
      abortSignal: controller.signal
    })

    const uiStream = result.toUIMessageStream({
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
          ragEnabled,
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
