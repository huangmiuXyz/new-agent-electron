export const useAgent = () => {
  const agentStore = useAgentStore()
  const settingsStore = useSettingsStore()
  const { mcpServers } = storeToRefs(settingsStore)
  const { knowledgeBases } = storeToRefs(useKnowledgeStore())

  const { confirm, remove } = useModal()

  // 获取内置工具选项
  const getBuiltinToolOptions = () => {
    const tools = getBuiltinTools()
    return Object.entries(tools).map(([key, tool]) => ({
      label: tool.title!,
      value: key,
      description: tool.description
    }))
  }

  // 知识库选项
  const getKnowledgeBaseOptions = () => {
    return knowledgeBases.value.map((kb) => ({
      label: kb.name,
      value: kb.id
    }))
  }

  // 获取所有MCP服务器的选项列表
  const getMcpServerOptions = () => {
    return Object.entries(mcpServers.value).map(([name, server]) => {
      const desc =
        server.description ||
        (server as any).command ||
        (server as any).url ||
        server.transport ||
        ''
      return {
        label: name,
        value: name,
        description: desc
      }
    })
  }

  const getAllToolOptions = (selectedMcpServers: string[]) => {
    const toolOptions: { label: string; value: string; description?: string }[] = []

    selectedMcpServers.forEach((serverName) => {
      const server = mcpServers.value[serverName]
      if (server && server.tools && Object.keys(server.tools).length > 0) {
        Object.entries(server.tools).forEach(([toolName, tool]) => {
          toolOptions.push({
            label: `${serverName}.${toolName}`,
            value: `${serverName}.${toolName}`,
            description: tool.description || ''
          })
        })
      }
    })

    return toolOptions
  }

  const openAgentModal = async (agent?: Agent) => {
    const isEdit = !!agent
    const modalTitle = isEdit ? '编辑智能体' : '创建智能体'

    const initialData: Partial<Agent> = agent
      ? {
          name: agent.name,
          description: agent.description,
          systemPrompt: agent.systemPrompt,
          knowledgeBaseId: agent.knowledgeBaseId,
          mcpServers: [...(agent.mcpServers || [])],
          tools: [...(agent.tools || [])],
          builtinTools: [...(agent.builtinTools || [])]
        }
      : {
          name: '',
          description: '',
          systemPrompt: '你是一个有帮助的AI助手。',
          mcpServers: [],
          tools: [],
          builtinTools: []
        }

    let previousMcpServers = initialData.mcpServers || []

    const [FormComponent, formActions] = useForm({
      title: modalTitle,
      showHeader: false,
      initialData,
      fields: [
        {
          name: 'name',
          type: 'text',
          label: '名称',
          placeholder: '智能体名称',
          required: true
        },
        {
          name: 'description',
          type: 'textarea',
          label: '描述',
          placeholder: '简单描述智能体的功能',
          rows: 2
        },
        {
          name: 'systemPrompt',
          type: 'textarea',
          label: '系统提示词',
          placeholder: '定义智能体的行为和角色...',
          required: true,
          rows: 6
        },
        {
          name: 'knowledgeBaseId',
          type: 'select',
          label: '关联知识库',
          placeholder: '选择知识库（可选）',
          options: getKnowledgeBaseOptions()
        },
        {
          name: 'mcpServers',
          type: 'checkboxGroup',
          label: 'MCP 服务器',
          options: getMcpServerOptions()
        },
        {
          name: 'tools',
          type: 'checkboxGroup',
          label: 'MCP工具',
          options: [],
          ifShow: (data) => data.mcpServers! && data.mcpServers!.length > 0
        },
        {
          name: 'builtinTools',
          type: 'checkboxGroup',
          label: '内置工具',
          options: getBuiltinToolOptions()
        }
      ],
      onChange: (field, value, formData) => {
        if (field === 'mcpServers') {
          const selectedMcpServers = value as string[]
          const newToolOptions = getAllToolOptions(selectedMcpServers)
          formActions.updateFieldProps('tools', {
            options: newToolOptions
          })
          const addedServers = selectedMcpServers.filter(
            (server) => !previousMcpServers.includes(server)
          )
          const removedServers = previousMcpServers.filter(
            (server) => !selectedMcpServers.includes(server)
          )
          let currentTools = (formData.tools as string[]) || []
          addedServers.forEach((serverName) => {
            const server = mcpServers.value[serverName]
            if (server && server.tools) {
              Object.keys(server.tools).forEach((toolName) => {
                const toolId = `${serverName}.${toolName}`
                if (!currentTools.includes(toolId)) {
                  currentTools.push(toolId)
                }
              })
            }
          })
          removedServers.forEach((serverName) => {
            currentTools = currentTools.filter((toolId) => !toolId.startsWith(`${serverName}.`))
          })
          formActions.setFieldValue('tools', currentTools)
          previousMcpServers = [...selectedMcpServers]
        }
      },
      onSubmit: (data) => {
        if (isEdit && agent) {
          agentStore.updateAgent(agent.id, data as Partial<Agent>)
        } else {
          agentStore.createAgent(data as Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>)
        }
      }
    })

    formActions.updateFieldProps('tools', {
      options: getAllToolOptions(initialData.mcpServers || [])
    })

    confirm({
      title: modalTitle,
      content: FormComponent,
      maxHeight: '80vh',
      width: '600px',
      onOk: async () => {
        if (formActions.submit()) remove()
      }
    })
  }

  const handleDelete = (id: string) => {
    if (id === 'default') {
      alert('默认智能体不能删除')
      return
    }
    agentStore.deleteAgent(id)
  }

  const selectAgent = (agentId: string) => {
    agentStore.selectAgent(agentId)
  }
  return {
    openAgentModal,
    handleDelete,
    selectAgent
  }
}
