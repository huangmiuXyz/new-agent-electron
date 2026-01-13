import { zodSchemasToFormfields } from '../utils/zod-to-form'
import { createRegistry } from '../services/chatService/registry'

export const useAgent = () => {
  const agentStore = useAgentStore()
  const settingsStore = useSettingsStore()
  const { mcpServers } = storeToRefs(settingsStore)
  const { knowledgeBases } = storeToRefs(useKnowledgeStore())

  const { confirm, remove } = useModal()

  const getBuiltinToolOptions = () => {
    const tools = getBuiltinTools()
    return Object.entries(tools).map(([key, tool]: [string, Tool]) => ({
      label: tool.title!,
      value: key,
      description: tool.description
    }))
  }

  const getKnowledgeBaseOptions = () => {
    return knowledgeBases.value.map((kb) => ({
      label: kb.name,
      value: kb.id
    }))
  }

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

  const getSpeechVoiceOptions = () => {
    const { ttsModelId, ttsProviderId } = settingsStore.defaultModels
    const modelIds = Array.isArray(ttsModelId) ? ttsModelId : [ttsModelId]
    const providerIds = Array.isArray(ttsProviderId) ? ttsProviderId : [ttsProviderId]

    const options: { label: string; value: string }[] = []

    modelIds.forEach((mId, index) => {
      const pId = providerIds[index]
      if (!mId || !pId) return

      const provider = settingsStore.getAllProviders.find((p) => p.id === pId)
      if (!provider) return

      const model = provider.models?.find((m) => m.id === mId)
      if (!model || !model.voices) return

      model.voices.forEach((v) => {
        options.push({
          label: `${v.name} (${model.name})`,
          value: v.id
        })
      })
    })

    return options
  }

  const getAllToolOptions = (selectedMcpServers: string[]) => {
    const toolOptions: { label: string; value: string; description?: string }[] = []

    selectedMcpServers.forEach((serverName) => {
      const server = mcpServers.value[serverName]
      if (server && server.tools && Object.keys(server.tools).length > 0) {
        Object.entries(server.tools).forEach(([toolName, tool]: [string, Tool]) => {
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
    const modalTitle = isEdit ? '配置智能体' : '创建智能体'

    const {
      Robot,
      Settings,
      Wrench20Regular,
      Library16Filled,
      Screen,
      FormatImage,
      Speaker224Regular
    } = useIcon([
      'Robot',
      'Settings',
      'Wrench20Regular',
      'Library16Filled',
      'Screen',
      'FormatImage',
      'Speaker224Regular'
    ])

    const initialData: Partial<Agent> = agent
      ? {
          name: agent.name,
          description: agent.description,
          systemPrompt: agent.systemPrompt,
          knowledgeBaseIds: [...(agent.knowledgeBaseIds || [])],
          mcpServers: [...(agent.mcpServers || [])],
          tools: [...(agent.tools || [])],
          builtinTools: [...(agent.builtinTools || [])],
          ragEnabled: agent.ragEnabled ?? false,
          terminalStartupPath: agent.terminalStartupPath || '',
          backgrounds: agent.backgrounds ? [...agent.backgrounds] : [],
          avatar: agent.avatar || '',
          temperature: agent.temperature ?? 0.7,
          topP: agent.topP ?? 1,
          topK: agent.topK ?? 40,
          presencePenalty: agent.presencePenalty ?? 0,
          frequencyPenalty: agent.frequencyPenalty ?? 0,
          maxOutputTokens: agent.maxOutputTokens ?? 2000,
          contextCount: agent.contextCount ?? 10,
          speechVoice: agent.speechVoice || '',
          speechMode: agent.speechMode || 'sentence',
          speechSpeed: agent.speechSpeed ?? 1,
          speechLanguage: agent.speechLanguage || 'auto',
          speechProviderOptions: agent.speechProviderOptions
            ? { ...agent.speechProviderOptions }
            : {}
        }
      : {
          name: '',
          description: '',
          systemPrompt: '你是一个有帮助的AI助手。',
          knowledgeBaseIds: [],
          mcpServers: [],
          tools: [],
          builtinTools: [],
          ragEnabled: false,
          terminalStartupPath: '',
          backgrounds: [],
          avatar: '',
          temperature: 0.7,
          topP: 1,
          topK: 40,
          presencePenalty: 0,
          frequencyPenalty: 0,
          maxOutputTokens: 2000,
          contextCount: 10,
          speechVoice: '',
          speechMode: 'sentence',
          speechSpeed: 1,
          speechLanguage: 'auto',
          speechProviderOptions: {}
        }

    let previousMcpServers = initialData.mcpServers || []

    // 定义表单字段，按类别分组
    const basicFields: FormField<Partial<Agent>>[] = [
      {
        name: 'avatar',
        label: '头像',
        type: 'upload',
        multiple: false
      } as UploadField<Partial<Agent>>,
      {
        name: 'name',
        type: 'text',
        label: '名称',
        placeholder: '智能体名称',
        required: true
      } as TextField<Partial<Agent>>,
      {
        name: 'description',
        type: 'textarea',
        label: '描述',
        placeholder: '简单描述智能体的功能',
        rows: 2
      } as TextareaField<Partial<Agent>>,
      {
        name: 'systemPrompt',
        type: 'textarea',
        label: '系统提示词',
        placeholder: '定义智能体的行为和角色...',
        required: true,
        rows: 10
      } as TextareaField<Partial<Agent>>
    ]

    const modelFields: FormField<Partial<Agent>>[] = [
      {
        name: 'reset_model_params',
        type: 'custom',
        render: () => (
          <div style={{ display: 'flex', marginBottom: '16px' }}>
            <button
              style={{
                padding: '6px 12px',
                borderRadius: '4px',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-subtle)',
                color: 'var(--text-secondary)',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.2s'
              }}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const defaultParams = {
                  temperature: 0.7,
                  topP: 1,
                  topK: 40,
                  presencePenalty: 0,
                  frequencyPenalty: 0,
                  maxOutputTokens: 2000,
                  contextCount: 10
                }
                Object.entries(defaultParams).forEach(([key, value]) => {
                  formActions.setFieldValue(key, value)
                })
              }}
              onMouseover={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
              onMouseout={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
            >
              <span>重置</span>
            </button>
          </div>
        )
      } as CustomField<Partial<Agent>>,
      {
        name: 'temperature',
        label: '温度 (Temperature)',
        type: 'slider',
        min: 0,
        max: 2,
        step: 0.1,
        hint: '控制回复的随机性。值越大，回复越随机。'
      } as SliderField<Partial<Agent>>,
      {
        name: 'topP',
        label: 'Top-P (Nucleus Sampling)',
        type: 'slider',
        min: 0,
        max: 1,
        step: 0.05,
        hint: '另一种控制随机性的方式，仅从累积概率达到 P 的候选词中采样。'
      } as SliderField<Partial<Agent>>,
      {
        name: 'topK',
        label: 'Top-K Sampling',
        type: 'slider',
        min: 1,
        max: 100,
        step: 1,
        hint: '仅从概率最高的 K 个词中采样。'
      } as SliderField<Partial<Agent>>,
      {
        name: 'presencePenalty',
        label: '话题新鲜度 (Presence Penalty)',
        type: 'slider',
        min: -2,
        max: 2,
        step: 0.1,
        hint: '惩罚已出现的词，促使模型讨论新话题。'
      } as SliderField<Partial<Agent>>,
      {
        name: 'frequencyPenalty',
        label: '频率惩罚 (Frequency Penalty)',
        type: 'slider',
        min: -2,
        max: 2,
        step: 0.1,
        hint: '根据词出现的频率进行惩罚，减少重复用词。'
      } as SliderField<Partial<Agent>>,
      {
        name: 'maxOutputTokens',
        label: '最大输出 Token (Max Output Tokens)',
        type: 'number',
        min: 1,
        max: 128000,
        hint: '模型允许生成的最大 Token 数量。'
      } as TextField<Partial<Agent>>,
      {
        name: 'contextCount',
        type: 'number',
        label: '历史上下文条数',
        hint: '发送给模型进行参考的历史消息条数。'
      } as TextField<Partial<Agent>>
    ]

    const getDynamicSpeechFields = () => {
      const dynamicFields: FormField<Partial<Agent>>[] = []
      const providers = settingsStore.getAllProviders

      for (const provider of providers) {
        try {
          const registry = createRegistry({
            apiKey: provider.apiKey || '',
            baseURL: provider.baseUrl,
            name: provider.name
          })
          const providerInstance = registry.getProvider(provider.providerType)
          if (providerInstance?.speechCallOptionsSchema) {
            const fields = zodSchemasToFormfields<Partial<Agent>>(
              providerInstance.speechCallOptionsSchema,
              `speechProviderOptions.${provider.id}`
            )

            dynamicFields.push(
              ...fields.map((field) => ({
                ...field,
                ifShow: (data: Partial<Agent>) => {
                  if (
                    (typeof field.ifShow === 'boolean' && !field.ifShow) ||
                    (typeof field.ifShow === 'function' && !field.ifShow?.(data))
                  )
                    return false
                  if (!data.speechVoice) return false
                  return (
                    provider.models?.some((m) =>
                      m.voices?.some((v) => v.id === data.speechVoice)
                    ) || false
                  )
                }
              }))
            )
          }
        } catch (e) {
          console.warn(`Failed to get speech fields for provider ${provider.id}:`, e)
        }
      }
      return dynamicFields
    }

    const speechFields: FormField<Partial<Agent>>[] = [
      {
        name: 'speechVoice',
        type: 'select',
        label: '默认语音',
        options: getSpeechVoiceOptions(),
        placeholder: '请选择音色'
      } as SelectField<Partial<Agent>>,
      {
        name: 'speechMode',
        type: 'select',
        label: '生成模式',
        options: [
          { label: '一句一生成', value: 'sentence' },
          { label: '一段一生成', value: 'paragraph' },
          { label: '回复后生成', value: 'full' }
        ],
        hint: '控制语音生成的颗粒度。'
      } as SelectField<Partial<Agent>>,
      {
        name: 'speechSpeed',
        type: 'number',
        label: '语速',
        min: 0.1,
        max: 2,
        step: 0.1,
        hint: '语音生成的播放速度 (0.1 - 2.0)。'
      } as TextField<Partial<Agent>>,
      {
        name: 'speechLanguage',
        type: 'text',
        label: '语言',
        placeholder: '例如: en, zh, ja 或 auto',
        hint: '语音生成的语言代码 (ISO 639-1) 或 auto。'
      } as TextField<Partial<Agent>>,
      ...getDynamicSpeechFields()
    ]

    const toolFields: FormField<Partial<Agent>>[] = [
      {
        name: 'mcpServers',
        type: 'checkboxGroup',
        label: 'MCP 服务器',
        options: getMcpServerOptions()
      } as CheckboxGroupField<Partial<Agent>>,
      {
        name: 'tools',
        type: 'checkboxGroup',
        label: 'MCP工具',
        options: [],
        ifShow: (data) => data.mcpServers! && data.mcpServers!.length > 0
      } as CheckboxGroupField<Partial<Agent>>,
      {
        name: 'builtinTools',
        type: 'checkboxGroup',
        label: '内置工具',
        options: getBuiltinToolOptions()
      } as CheckboxGroupField<Partial<Agent>>
    ]

    const knowledgeFields: FormField<Partial<Agent>>[] = [
      {
        name: 'knowledgeBaseIds',
        type: 'checkboxGroup',
        label: '关联知识库',
        options: getKnowledgeBaseOptions()
      } as CheckboxGroupField<Partial<Agent>>,
      {
        name: 'ragEnabled',
        type: 'boolean',
        label: '启用RAG',
        hint: '启用后，将自动从关联的知识库中检索相关内容并插入到用户输入中',
        ifShow: (data) => data.knowledgeBaseIds! && data.knowledgeBaseIds!.length > 0
      } as BooleanField<Partial<Agent>>
    ]

    const appearanceFields: FormField<Partial<Agent>>[] = [
      {
        name: 'backgrounds',
        label: '背景图',
        type: 'upload',
        multiple: true
      } as UploadField<Partial<Agent>>
    ]

    const advancedFields: FormField<Partial<Agent>>[] = [
      {
        name: 'terminalStartupPath',
        type: 'path',
        label: '终端启动位置',
        placeholder: '选择或输入终端启动目录',
        hint: '留空则使用默认启动位置',
        dialogOptions: {
          properties: ['openDirectory'],
          title: '选择终端启动目录'
        }
      } as PathSelectorField<Partial<Agent>>
    ]

    const allFields = [
      ...basicFields,
      ...modelFields,
      ...speechFields,
      ...toolFields,
      ...knowledgeFields,
      ...appearanceFields,
      ...advancedFields
    ]

    const [Form, formActions] = useForm({
      title: modalTitle,
      showHeader: false,
      initialData,
      fields: allFields,
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
        // useForm 的 formData 会自动包含 fields 中定义的所有字段
        // 这里直接透传 data 即可，确保 updateAgent 和 createAgent 接收完整数据
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

    const ModalContent = defineComponent({
      setup() {
        const categories = [
          { id: 'basic', name: '基本信息', icon: Robot, fields: basicFields },
          { id: 'model', name: '模型参数', icon: Settings, fields: modelFields },
          { id: 'speech', name: '语音配置', icon: Speaker224Regular, fields: speechFields },
          { id: 'tools', name: '工具配置', icon: Wrench20Regular, fields: toolFields },
          { id: 'knowledge', name: '知识库', icon: Library16Filled, fields: knowledgeFields },
          { id: 'appearance', name: '外观设置', icon: FormatImage, fields: appearanceFields },
          { id: 'advanced', name: '高级设置', icon: Screen, fields: advancedFields }
        ]

        const activeCategory = ref('basic')

        return () => (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              height: '650px',
              maxHeight: '80vh',
              overflow: 'hidden'
            }}
          >
            <div
              class="tabs-container"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderBottom: '1px solid var(--border-subtle)',
                overflowX: 'auto',
                whiteSpace: 'nowrap',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none'
              }}
            >
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    fontWeight: activeCategory.value === cat.id ? '600' : '400',
                    backgroundColor:
                      activeCategory.value === cat.id ? 'var(--bg-active)' : 'transparent',
                    color:
                      activeCategory.value === cat.id
                        ? 'var(--text-primary)'
                        : 'var(--text-secondary)',
                    flexShrink: 0
                  }}
                  onClick={() => (activeCategory.value = cat.id)}
                >
                  <div
                    style={{
                      width: '14px',
                      height: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {cat.icon}
                  </div>
                  <span>{cat.name}</span>
                </div>
              ))}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 32px 16px' }}>
              <Form fields={categories.find((c) => c.id === activeCategory.value)?.fields || []} />
            </div>
          </div>
        )
      }
    })

    confirm({
      title: modalTitle,
      content: ModalContent,
      modalBodyStyle: { padding: 0 },
      maxHeight: '90vh',
      width: '800px',
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
