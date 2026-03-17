const buildSubAgentSystemPrompt = (currentChat: Chat): string => {
  const taskInfo = currentChat.subTask ? `任务内容: ${currentChat.subTask.task}\n` : ''
  return (
    '【子智能体系统提示词】\n' +
    '你当前是子智能体，仅负责执行分配任务并通过通信工具回传。\n' +
    `${taskInfo}` +
    '你已自动具备通信工具 agent_communicate。\n' +
    '默认保持静默，不发送中途通信以节省 token。\n' +
    '仅在以下情况才允许中途通信：任务被阻塞、需要主智能体决策、发现高风险问题。\n' +
    '如需中途通信，请合并关键信息后一次发送，避免频繁小消息。\n' +
    '禁止只汇报进展、禁止轮询式沟通、禁止重复确认；除非确实需要主智能体决策，否则持续执行直到最终回传。\n' +
    '任务结束时必须调用一次 agent_communicate 回传最终结果，并设置 isFinal=true。\n' +
    '成功时：success=true，并在 message 写明最终结论；失败时：success=false 并填写 error。\n' +
    '禁止只汇报进展而不回传最终结果。'
  )
}

const buildMasterAgentSystemPrompt = (currentChat: Chat): string => {
  const chatsStore = useChatsStores()
  const agentStore = useAgentStore()
  const currentAgentId = currentChat.agentId

  const availableAgents = agentStore.allAgents
    .filter((agent) => agent.id !== currentAgentId)
    .map((agent) => ({
      name: agent.name,
      description: agent.description || '无'
    }))

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
      '你当前是主智能体，会处理子智能体通信消息并整合结果。\n' +
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
    '主子智能体统一使用 agent_communicate 通信；主智能体回信时使用 targetAgentName 指定子智能体名称。\n' +
    '采用最少通信原则：除非子智能体请求决策或任务方向需要调整，否则不要主动频繁回信。\n' +
    '若需要回信，合并指令一次发送，避免多条短消息。\n' +
    '【强制通信规则】\n' +
    '1. 任务分派后，保持静默直到子智能体返回 isFinal=true。\n' +
    '2. 仅在以下情况可主动通信：子智能体明确请求决策（使用疑问句）；任务方向需要重大调整（不可逆的错误）。\n' +
    '3. 禁止行为：不要轮询进度（如“完成了吗”“进行如何”）；不要中间过程干预（除非子智能体求助）；不要发送重复确认消息。\n' +
    '4. 一次通信包含所有必要信息，避免碎片化。\n' +
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
