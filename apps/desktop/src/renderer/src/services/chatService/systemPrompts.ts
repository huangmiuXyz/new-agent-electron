import { getCodexBuiltinTools } from '../builtin-tools/tools/codex-tools'

const CODEX_BUILTIN_TOOL_KEYS = new Set(Object.keys(getCodexBuiltinTools()))

const getTerminalTypeLabel = (): string => {
  const platform = window.api.os.platform()
  if (platform === 'win32') {
    return 'powershell'
  }

  const shellPath = window.api.process.env.SHELL || '/bin/sh'
  const shellName = shellPath.split(/[/\\]/).pop()
  return (shellName || shellPath).toLowerCase()
}

const formatCurrentDate = (): string => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getCurrentTimezone = (): string => {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

export const buildCodexEnvironmentPrompt = (
  chatId: string,
  builtinTools?: string[]
): string => {
  const hasCodexBuiltinTool = (builtinTools || []).some((toolName) => CODEX_BUILTIN_TOOL_KEYS.has(toolName))

  if (!hasCodexBuiltinTool) {
    return ''
  }

  const workPath = useCanvasStore().getWorkPath(chatId) || '未设置'
  const terminalType = getTerminalTypeLabel()
  const currentDate = formatCurrentDate()
  const timezone = getCurrentTimezone()

  return [
    '<environment_context>',
    `  <cwd>${workPath}</cwd>`,
    `  <shell>${terminalType}</shell>`,
    `  <current_date>${currentDate}</current_date>`,
    `  <timezone>${timezone}</timezone>`,
    '</environment_context>'
  ].join('\n')
}

const buildSubAgentSystemPrompt = (currentChat: Chat): string => {
  const taskInfo = currentChat.subTask ? `任务内容: ${currentChat.subTask.task}\n` : ''
  return (
    '【子智能体系统提示词】\n' +
    '你当前是子智能体，仅负责执行分配任务。\n' +
    `${taskInfo}` +
    '完成任务后，必须调用 finish_sub_task 工具提交最终结果给主智能体：\n' +
    '- mode="last_message"：将你最后一条回复作为返回内容\n' +
    '- mode="custom" + message：由你撰写面向主智能体的自定义返回内容\n' +
    '如果遇到阻塞或失败，请在当前回复中记录原因后，再调用 finish_sub_task 提交说明。'
  )
}

const buildMasterAgentSystemPrompt = (currentChat: Chat): string => {
  const chatsStore = useChatsStores()
  const agentStore = useAgentStore()
  const currentAgentId = currentChat.agentId

  // 获取当前智能体的 allowedSubAgents 配置
  const currentAgent = agentStore.getAgentById(currentAgentId || '')
  const allowedSubAgents = currentAgent?.allowedSubAgents

  let availableAgents = agentStore.allAgents.map((agent) => ({
    name: agent.name,
    description: agent.description || '无'
  }))

  // 如果配置了 allowedSubAgents，则只允许列表中的智能体
  if (allowedSubAgents && allowedSubAgents.length > 0) {
    availableAgents = availableAgents.filter((agent) =>
      allowedSubAgents.includes(agent.name)
    )
  }

  const childChats = chatsStore.getChildChats(currentChat.id)
  const childChatsText =
    childChats.length > 0
      ? childChats
          .map((chat) => {
            const childAgentName =
              agentStore.getAgentById(chat.agentId || '')?.name || chat.title || '子智能体'
            return `- 智能体: ${childAgentName}; 任务: ${chat.title}; 状态: ${chat.subTask?.status || 'pending'}`
          })
          .join('\n')
      : '无'

  if (availableAgents.length === 0) {
    return (
      '【主智能体系统提示词】\n' +
      '你当前是主智能体，会处理子智能体总结消息并整合结果。\n' +
      '当前没有可分派的其他智能体。仅在本会话内直接完成任务，不要调用 delegate_to_sub_agent。'
    )
  }

  const agentsText = availableAgents
    .map((agent) => `- 名称: ${agent.name}; 描述: ${agent.description}`)
    .join('\n')

  return (
    '【主智能体系统提示词】\n' +
    '你当前是主智能体，负责任务拆分、调度子智能体和汇总最终答复。\n' +
    '当任务可并行或专业性更强时，优先调用 delegate_to_sub_agent，并使用智能体名称来选择目标。\n' +
    '如果子任务需要理解当前会话背景，可在调用 delegate_to_sub_agent 时设置 inheritContext=true；默认不继承主会话上下文。\n' +
    '子智能体完成后会主动调用 finish_sub_task 工具将结果返回当前会话，无需手动等待。\n' +
    '可用智能体列表：\n' +
    `${agentsText}\n` +
    '当前子会话列表：\n' +
    `${childChatsText}`
  )
}

export const buildMultiAgentSystemPrompt = (cid: string): string => {
  const chatsStore = useChatsStores()
  const currentChat = chatsStore.getChatById(cid)
  if (!currentChat) return ''
  if (currentChat.parentChatId) return buildSubAgentSystemPrompt(currentChat)
  return buildMasterAgentSystemPrompt(currentChat)
}

export const buildContextCompressionPrompt = (contextToCompress: string): string => {
  return `请将以下对话历史压缩成简洁、可持续接力的摘要，保留后续继续对话必须知道的信息。

要求：
1. 保留用户目标、约束、已确认决策、关键结论、待办和未解决问题。
2. 如果历史里包含工具调用、文件、代码修改、错误信息或外部检索结果，要保留这些事实，不要只保留口语化结论。
3. 不要写无意义寒暄，不要遗漏时间、路径、命令、配置项、接口名等关键细节。
4. 输出适合直接作为后续上下文继续使用，不要提“以上是摘要”之类的说明。

${contextToCompress}

请输出摘要，至少包含：
1. 讨论的主要话题
2. 关键决策和结论
3. 需要记住的重要信息
4. 未解决的问题（如果有）`
}

export const buildTranslationPrompt = (text: string, targetLanguage: string): string => {
  return `请将以下文本翻译为${targetLanguage}，只返回翻译结果，不要添加任何解释或额外内容：\n\n${text}`
}
