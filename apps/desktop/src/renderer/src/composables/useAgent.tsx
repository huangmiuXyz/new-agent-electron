import { zodSchemasToFormfields } from '../utils/zod-to-form'
import { createRegistry } from '../services/chatService/registry'
import { discoverSkills, loadSkill, type SkillMetadata } from '../services/skillsService'
import Markdown from '@renderer/components/Markdown.vue'
import Button from '@renderer/components/Button.vue'

interface AgentFormData extends Omit<
  Agent,
  'backgrounds' | 'id' | 'createdAt' | 'updatedAt' | 'defaultModel'
> {
  backgrounds: string[]
  defaultModel?: { providerId: string; modelId: string }
}

const DEFAULT_SKILL_DIRECTORY = '~/.agents/skills'

export const useAgent = () => {
  const agentStore = useAgentStore()
  const settingsStore = useSettingsStore()
  const { mcpServers } = storeToRefs(settingsStore)
  const { knowledgeBases } = storeToRefs(useKnowledgeStore())

  const { confirm, remove } = useModal()

  const resolveSkillDirectory = (rawPath?: string) => {
    const normalizedPath = rawPath?.trim() || DEFAULT_SKILL_DIRECTORY
    if (normalizedPath.startsWith('~/')) {
      return window.api.path.join(window.api.os.homedir(), normalizedPath.slice(2))
    }
    return normalizedPath
  }

  const getBuiltinToolOptions = (selectedToolKeys?: string[], approvalToolKeys?: string[]) => {
    const tools = getBuiltinTools()
    const grouped = getBuiltinToolGroups()
    const groupByTool = new Map<string, string>()
    Object.entries(grouped).forEach(([group, toolKeys]) => {
      toolKeys.forEach((toolKey) => groupByTool.set(toolKey, group))
    })

    const selectedSet = selectedToolKeys?.length ? new Set(selectedToolKeys) : null
    const approvalSet = new Set(approvalToolKeys || [])

    return Object.entries(tools)
      .map(([key, tool]: [string, Tool]) => ({
        label: tool.title || key,
        value: key,
        description: tool.description,
        group: groupByTool.get(key) || '其他工具',
        actionActive: approvalSet.has(key),
        actionDisabled: selectedSet ? !selectedSet.has(key) : false,
        actionTitle: '配置',
        tags: approvalSet.has(key) ? ['需批准'] : [],
        tagColor: 'orange'
      }))
      .sort((a, b) => {
        if (a.group !== b.group) return a.group.localeCompare(b.group, 'zh-Hans-CN')
        return a.label.localeCompare(b.label, 'zh-Hans-CN')
      })
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
    const toolOptions: { label: string; value: string; description?: string; group?: string }[] = []

    selectedMcpServers.forEach((serverName) => {
      const server = mcpServers.value[serverName]
      if (server && server.tools && Object.keys(server.tools).length > 0) {
        Object.entries(server.tools).forEach(([toolName, tool]: [string, Tool]) => {
          toolOptions.push({
            label: toolName,
            value: `${serverName}.${toolName}`,
            description: tool.description || '',
            group: serverName
          })
        })
      }
    })

    return toolOptions.sort((a, b) => {
      const ag = a.group || ''
      const bg = b.group || ''
      if (ag !== bg) return ag.localeCompare(bg, 'zh-Hans-CN')
      return a.label.localeCompare(b.label, 'zh-Hans-CN')
    })
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
      Speaker224Regular,
      Sparkles,
      Folder,
      Active,
      Inactive,
      Eye,
      Pencil,
      Trash,
      Plus
    } = useIcon([
      'Robot',
      'Settings',
      'Wrench20Regular',
      'Library16Filled',
      'Screen',
      'FormatImage',
      'Speaker224Regular',
      'Sparkles',
      'Folder',
      'Active',
      'Inactive',
      'Eye',
      'Pencil',
      'Trash',
      'Plus'
    ])

    const initialData: AgentFormData = agent
      ? {
          name: agent.name,
          description: agent.description,
          systemPrompt: agent.systemPrompt,
          knowledgeBaseIds: [...(agent.knowledgeBaseIds || [])],
          mcpServers: [...(agent.mcpServers || [])],
          tools: [...(agent.tools || [])],
          builtinTools: [...(agent.builtinTools || [])],
          builtinToolsRequireApproval: [...(agent.builtinToolsRequireApproval || [])],
          execCommandRunInBackground: agent.execCommandRunInBackground ?? false,
          ragEnabled: agent.ragEnabled ?? false,
          terminalStartupPath: agent.terminalStartupPath || '',
          skillDirectory: agent.skillDirectory || DEFAULT_SKILL_DIRECTORY,
          disabledSkills: [...(agent.disabledSkills || [])],
          backgrounds: agent.backgrounds ? agent.backgrounds.map((bg) => bg.url) : [],
          avatar: agent.avatar || '',
          temperature: agent.temperature ?? 0.7,
          topP: agent.topP ?? 1,
          topK: agent.topK ?? 40,
          presencePenalty: agent.presencePenalty ?? 0,
          frequencyPenalty: agent.frequencyPenalty ?? 0,
          maxOutputTokens: agent.maxOutputTokens,
          contextCount: agent.contextCount ?? 50,
          contextTokenCount: agent.contextTokenCount ?? 12000,
          autoCompressContext: agent.autoCompressContext ?? false,
          compressModel: agent.compressModel,
          speechVoice: agent.speechVoice || '',
          speechMode: agent.speechMode || 'sentence',
          speechSpeed: agent.speechSpeed ?? 1,
          speechLanguage: agent.speechLanguage || 'auto',
          speechProviderOptions: agent.speechProviderOptions
            ? { ...agent.speechProviderOptions }
            : {},
          defaultModel: agent.defaultModel
        }
      : {
          name: '',
          description: '',
          systemPrompt: '你是一个有帮助的AI助手。',
          knowledgeBaseIds: [],
          mcpServers: [],
          tools: [],
          builtinTools: [],
          builtinToolsRequireApproval: [],
          execCommandRunInBackground: false,
          ragEnabled: false,
          terminalStartupPath: '',
          skillDirectory: DEFAULT_SKILL_DIRECTORY,
          disabledSkills: [],
          backgrounds: [],
          avatar: '',
          temperature: 0.7,
          topP: 1,
          topK: 40,
          presencePenalty: 0,
          frequencyPenalty: 0,
          contextCount: 10,
          contextTokenCount: 12000,
          autoCompressContext: false,
          speechVoice: '',
          speechMode: 'sentence',
          speechSpeed: 1,
          speechLanguage: 'auto',
          speechProviderOptions: {},
          defaultModel: undefined
        }

    let previousMcpServers = initialData.mcpServers || []
    const skillRefreshVersion = ref(0)

    const getSkillFilePath = (skillPath: string) => window.api.path.join(skillPath, 'SKILL.md')

    const getRawSkillContent = (skill: SkillMetadata) => {
      return window.api.fs.readFileSync(getSkillFilePath(skill.path), 'utf-8')
    }

    const stripFrontmatter = (content: string) => {
      return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim()
    }

    const buildSkillFileContent = (name: string, description: string, body: string) => {
      const normalizedBody = body.trim()
      return [
        '---',
        `name: ${name}`,
        `description: ${description}`,
        '---',
        '',
        normalizedBody
      ].join('\n')
    }

    const validateSkillName = (name: string) => {
      return (
        /^[a-z0-9-]+$/.test(name) &&
        !name.startsWith('-') &&
        !name.endsWith('-') &&
        !name.includes('--')
      )
    }

    const createSkillTemplate = (name: string, description: string) =>
      buildSkillFileContent(
        name,
        description,
        [
          `# ${name}`,
          '',
          description,
          '',
          '## Instructions',
          '',
          '- 在这里编写技能使用说明。',
          '- 需要引用文件时，使用相对路径。'
        ].join('\n')
      )

    // 定义表单字段，按类别分组
    const basicFields: FormField<AgentFormData>[] = [
      {
        name: 'defaultModel',
        type: 'modelSelector',
        label: '默认模型',
        placeholder: '选择默认模型',
        hint: '切换到该智能体时，如果当前没有设置模型，将自动使用此默认模型',
        modelCategory: 'text',
        popupPosition: 'bottom',
        clearable: true
      } as ModelSelectorField<AgentFormData>,
      {
        name: 'avatar',
        label: '头像',
        type: 'upload',
        multiple: false
      } as UploadField<AgentFormData>,
      {
        name: 'name',
        type: 'text',
        label: '名称',
        placeholder: '智能体名称',
        required: true
      } as TextField<AgentFormData>,
      {
        name: 'description',
        type: 'textarea',
        label: '描述',
        placeholder: '简单描述智能体的功能',
        rows: 2
      } as TextareaField<AgentFormData>,
      {
        name: 'systemPrompt',
        type: 'textarea',
        label: '系统提示词',
        placeholder: '定义智能体的行为和角色...',
        required: true,
        rows: 10
      } as TextareaField<AgentFormData>
    ]

    const modelFields: FormField<AgentFormData>[] = [
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
                  contextCount: 10,
                  contextTokenCount: 12000
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
      } as CustomField<AgentFormData>,
      {
        name: 'temperature',
        label: '温度 (Temperature)',
        type: 'slider',
        min: 0,
        max: 2,
        step: 0.1,
        hint: '控制回复的随机性。值越大，回复越随机。'
      } as SliderField<AgentFormData>,
      {
        name: 'topP',
        label: 'Top-P (Nucleus Sampling)',
        type: 'slider',
        min: 0,
        max: 1,
        step: 0.05,
        hint: '另一种控制随机性的方式，仅从累积概率达到 P 的候选词中采样。'
      } as SliderField<AgentFormData>,
      {
        name: 'topK',
        label: 'Top-K Sampling',
        type: 'slider',
        min: 1,
        max: 100,
        step: 1,
        hint: '仅从概率最高的 K 个词中采样。'
      } as SliderField<AgentFormData>,
      {
        name: 'presencePenalty',
        label: '话题新鲜度 (Presence Penalty)',
        type: 'slider',
        min: -2,
        max: 2,
        step: 0.1,
        hint: '惩罚已出现的词，促使模型讨论新话题。'
      } as SliderField<AgentFormData>,
      {
        name: 'frequencyPenalty',
        label: '频率惩罚 (Frequency Penalty)',
        type: 'slider',
        min: -2,
        max: 2,
        step: 0.1,
        hint: '根据词出现的频率进行惩罚，减少重复用词。'
      } as SliderField<AgentFormData>,
      {
        name: 'maxOutputTokens',
        label: '最大输出 Token (Max Output Tokens)',
        type: 'number',
        min: 1,
        max: 128000,
        hint: '模型允许生成的最大 Token 数量。'
      } as TextField<AgentFormData>
    ]

    const getDynamicSpeechFields = () => {
      const dynamicFields: FormField<AgentFormData>[] = []
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
            const fields = zodSchemasToFormfields<AgentFormData>(
              providerInstance.speechCallOptionsSchema,
              `speechProviderOptions.${provider.id}`
            )

            dynamicFields.push(
              ...fields.map((field) => ({
                ...field,
                ifShow: (data: AgentFormData) => {
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
          // console.warn(`Failed to get speech fields for provider ${provider.id}:`, e)
        }
      }
      return dynamicFields
    }

    const speechFields: FormField<AgentFormData>[] = [
      {
        name: 'speechVoice',
        type: 'select',
        label: '默认语音',
        options: getSpeechVoiceOptions(),
        placeholder: '请选择音色'
      } as SelectField<AgentFormData>,
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
      } as SelectField<AgentFormData>,
      {
        name: 'speechSpeed',
        type: 'number',
        label: '语速',
        min: 0.1,
        max: 2,
        step: 0.1,
        hint: '语音生成的播放速度 (0.1 - 2.0)。'
      } as TextField<AgentFormData>,
      {
        name: 'speechLanguage',
        type: 'text',
        label: '语言',
        placeholder: '例如: en, zh, ja 或 auto',
        hint: '语音生成的语言代码 (ISO 639-1) 或 auto。'
      } as TextField<AgentFormData>,
      ...getDynamicSpeechFields()
    ]

    const mcpFields: FormField<AgentFormData>[] = [
      {
        name: 'mcpServers',
        type: 'checkboxGroup',
        label: 'MCP 服务器',
        options: getMcpServerOptions(),
        columns: 2
      } as CheckboxGroupField<AgentFormData>,
      {
        name: 'tools',
        type: 'checkboxGroup',
        label: 'MCP工具',
        options: [],
        columns: 2,
        ifShow: (data) => data.mcpServers! && data.mcpServers!.length > 0
      } as CheckboxGroupField<AgentFormData>
    ]

    const setBuiltinToolApproval = (toolName: string, requiresApproval: boolean) => {
      const selectedBuiltinTools = (formActions.getFieldValue('builtinTools') as string[]) || []
      if (!selectedBuiltinTools.includes(toolName)) return

      const currentApprovalTools =
        (formActions.getFieldValue('builtinToolsRequireApproval') as string[]) || []
      const nextApprovalTools = requiresApproval
        ? Array.from(new Set([...currentApprovalTools, toolName]))
        : currentApprovalTools.filter((name) => name !== toolName)

      formActions.setFieldValue('builtinToolsRequireApproval', nextApprovalTools)
      formActions.updateFieldProps('builtinTools', {
        options: getBuiltinToolOptions(selectedBuiltinTools, nextApprovalTools)
      })
    }

    const openBuiltinToolApprovalModal = (option: CheckboxOption) => {
      const selectedBuiltinTools = (formActions.getFieldValue('builtinTools') as string[]) || []
      if (!selectedBuiltinTools.includes(option.value)) {
        messageApi.warning('请先启用这个内置工具，再配置工具设置')
        return
      }

      const currentApprovalTools =
        (formActions.getFieldValue('builtinToolsRequireApproval') as string[]) || []
      const currentValue = currentApprovalTools.includes(option.value)
      const currentExecCommandRunInBackground =
        (formActions.getFieldValue('execCommandRunInBackground') as boolean) ?? false
      const isExecCommand = option.value === 'exec_command'

      const [ApprovalForm, approvalFormActions] = useForm<{
        requireApproval: boolean
        execCommandRunInBackground: boolean
      }>({
        title: `工具设置 · ${option.label}`,
        showHeader: false,
        initialData: {
          requireApproval: currentValue,
          execCommandRunInBackground: currentExecCommandRunInBackground
        },
        fields: [
          {
            name: 'requireApproval',
            type: 'boolean',
            label: '执行前需手动批准',
            hint: '开启后，这个内置工具每次执行前都会先请求你的批准。'
          } as BooleanField<{
            requireApproval: boolean
            execCommandRunInBackground: boolean
          }>,
          {
            name: 'execCommandRunInBackground',
            type: 'boolean',
            label: '后台静默执行',
            hint: '开启后，exec_command 执行时不会自动展开终端面板，命令仍会在后台终端中运行。',
            ifShow: () => isExecCommand
          } as BooleanField<{
            requireApproval: boolean
            execCommandRunInBackground: boolean
          }>
        ],
        onSubmit: (data) => {
          setBuiltinToolApproval(option.value, !!data.requireApproval)
          if (isExecCommand) {
            formActions.setFieldValue(
              'execCommandRunInBackground',
              !!data.execCommandRunInBackground
            )
          }
          remove()
        }
      })

      confirm({
        title: `工具设置 · ${option.label}`,
        content: ApprovalForm,
        width: '420px',
        maxHeight: '60vh',
        onOk: async () => {
          approvalFormActions.submit()
        }
      })
    }

    const builtinToolFields: FormField<AgentFormData>[] = [
      {
        name: 'builtinTools',
        type: 'checkboxGroup',
        label: '内置工具',
        options: getBuiltinToolOptions(
          initialData.builtinTools || [],
          initialData.builtinToolsRequireApproval || []
        ),
        columns: 2,
        onOptionAction: (option: CheckboxOption) => openBuiltinToolApprovalModal(option)
      } as CheckboxGroupField<AgentFormData>
    ]

    const knowledgeFields: FormField<AgentFormData>[] = [
      {
        name: 'knowledgeBaseIds',
        type: 'checkboxGroup',
        label: '关联知识库',
        options: getKnowledgeBaseOptions()
      } as CheckboxGroupField<AgentFormData>,
      {
        name: 'ragEnabled',
        type: 'boolean',
        label: '启用RAG',
        hint: '启用后，将自动从关联的知识库中检索相关内容并插入到用户输入中'
      } as BooleanField<AgentFormData>
    ]

    const appearanceFields: FormField<AgentFormData>[] = [
      {
        name: 'backgrounds',
        label: '背景图',
        type: 'upload',
        multiple: true
      } as UploadField<AgentFormData>
    ]

    const getDisabledSkills = () =>
      ((formActions?.getFieldValue('disabledSkills') as string[]) || []).slice()

    const setDisabledSkills = (skillNames: string[]) => {
      const nextSkillNames = skillNames.filter(
        (name, index, array) =>
          array.findIndex((item) => item.toLowerCase() === name.toLowerCase()) === index
      )
      formActions.setFieldValue('disabledSkills', nextSkillNames)
      skillRefreshVersion.value += 1
    }

    const openSkillDetail = (skill: SkillMetadata, skills: SkillMetadata[]) => {
      const loaded = loadSkill(skill.name, skills)
      if (!loaded) {
        messageApi.error(`加载技能失败：${skill.name}`)
        return
      }

      const SkillDetailContent = defineComponent({
        setup() {
          const block = {
            text: loaded.content,
            state: 'done',
            type: 'text'
          } as any
          const message = {
            content: loaded.content,
            role: 'assistant',
            id: `skill-${skill.name}`
          } as any

          return {
            skill,
            block,
            message
          }
        },
        render() {
          return (
            <div class="skill-detail-modal">
              <div class="skill-detail-header-card">
                <div class="skill-detail-meta">
                  <div>
                    <div class="skill-detail-name">{this.skill.name}</div>
                    <div class="skill-detail-desc">{this.skill.description}</div>
                  </div>
                </div>
              </div>
              <div class="skill-detail-body">
                <Markdown block={this.block} message={this.message} />
              </div>
            </div>
          )
        }
      })

      confirm({
        title: `技能详情 · ${skill.name}`,
        content: SkillDetailContent,
        width: '760px',
        maxHeight: '80vh',
        showCancel: false
      })
    }

    const openEditSkillModal = (skill: SkillMetadata) => {
      let rawContent = ''
      try {
        rawContent = getRawSkillContent(skill)
      } catch (error) {
        messageApi.error(`读取技能失败：${error instanceof Error ? error.message : String(error)}`)
        return
      }

      const [SkillForm, skillFormActions] = useForm({
        title: `编辑技能 · ${skill.name}`,
        showHeader: false,
        initialData: {
          name: skill.name,
          description: skill.description,
          body: stripFrontmatter(rawContent)
        },
        fields: [
          {
            name: 'name',
            type: 'text',
            label: '技能名称',
            required: true,
            placeholder: '例如：design-review'
          },
          {
            name: 'description',
            type: 'textarea',
            label: '技能描述',
            required: true,
            placeholder: '简要描述这个技能负责什么'
          },
          {
            name: 'body',
            type: 'textarea',
            label: '技能正文',
            required: true,
            placeholder: '请输入技能正文 Markdown',
            rows: 18
          }
        ],
        onSubmit: (data) => {
          const nextName = data.name.trim()
          const nextDescription = data.description.trim()
          const nextBody = data.body.trim()

          if (!nextName || !nextDescription || !nextBody) {
            messageApi.error('请填写完整的技能名称、描述和正文')
            return
          }

          if (!validateSkillName(nextName)) {
            messageApi.error('技能名称只能包含小写字母、数字和中划线')
            return
          }

          const skillDirectory = resolveSkillDirectory(
            formActions.getFieldValue('skillDirectory') as string
          )
          const nextDir = window.api.path.join(skillDirectory, nextName)
          const nextFile = getSkillFilePath(nextDir)
          const currentDir = skill.path

          if (nextName !== skill.name && window.api.fs.existsSync(nextDir)) {
            messageApi.error(`目标技能目录已存在：${nextName}`)
            return
          }

          try {
            if (nextName !== skill.name) {
              window.api.fs.renameSync(currentDir, nextDir)
            }

            window.api.fs.writeFileSync(
              nextFile,
              buildSkillFileContent(nextName, nextDescription, nextBody),
              'utf-8'
            )

            if (nextName !== skill.name) {
              const nextDisabledSkills = getDisabledSkills().map((name) =>
                name.toLowerCase() === skill.name.toLowerCase() ? nextName : name
              )
              setDisabledSkills(nextDisabledSkills)
            } else {
              skillRefreshVersion.value += 1
            }

            remove()
            messageApi.success(`已更新技能：${nextName}`)
          } catch (error) {
            messageApi.error(
              `更新技能失败：${error instanceof Error ? error.message : String(error)}`
            )
          }
        }
      })

      confirm({
        title: `编辑技能 · ${skill.name}`,
        content: SkillForm,
        width: '720px',
        maxHeight: '80vh',
        onOk: async () => {
          skillFormActions.submit()
        }
      })
    }

    const deleteSkill = async (skill: SkillMetadata) => {
      const confirmed = await confirm({
        title: '删除技能',
        content: `确定要删除技能 "${skill.name}" 吗？此操作不可撤销。`
      })

      if (!confirmed) return

      try {
        window.api.fs.rmSync(skill.path, { recursive: true, force: true })
        setDisabledSkills(
          getDisabledSkills().filter((name) => name.toLowerCase() !== skill.name.toLowerCase())
        )
        messageApi.success(`已删除技能：${skill.name}`)
      } catch (error) {
        messageApi.error(`删除技能失败：${error instanceof Error ? error.message : String(error)}`)
      }
    }

    const openCreateSkillModal = () => {
      const skillDirectory = resolveSkillDirectory(
        formActions.getFieldValue('skillDirectory') as string
      )
      if (!skillDirectory) {
        messageApi.error('当前没有可用的技能目录，请先设置技能目录')
        return
      }

      const [SkillForm, skillFormActions] = useForm({
        title: '新技能',
        showHeader: false,
        initialData: {
          name: '',
          description: ''
        },
        fields: [
          {
            name: 'name',
            type: 'text',
            label: '技能名称',
            required: true,
            placeholder: '例如：design-review'
          },
          {
            name: 'description',
            type: 'textarea',
            label: '技能描述',
            required: true,
            placeholder: '简要描述这个技能负责什么'
          }
        ],
        onSubmit: (data) => {
          const name = data.name.trim()
          const description = data.description.trim()

          if (!name || !description) {
            messageApi.error('请填写完整的技能名称和描述')
            return
          }

          if (!validateSkillName(name)) {
            messageApi.error('技能名称只能包含小写字母、数字和中划线')
            return
          }

          const targetDir = window.api.path.join(skillDirectory, name)
          const skillFile = window.api.path.join(targetDir, 'SKILL.md')

          if (window.api.fs.existsSync(targetDir)) {
            messageApi.error(`技能目录已存在：${name}`)
            return
          }

          try {
            window.api.fs.mkdirSync(targetDir, { recursive: true })
            window.api.fs.writeFileSync(skillFile, createSkillTemplate(name, description), 'utf-8')
            skillRefreshVersion.value += 1
            remove()
            messageApi.success(`已创建技能：${name}`)
          } catch (error) {
            messageApi.error(
              `创建技能失败：${error instanceof Error ? error.message : String(error)}`
            )
          }
        }
      })

      confirm({
        title: '新技能',
        content: SkillForm,
        width: '560px',
        maxHeight: '70vh',
        onOk: async () => {
          skillFormActions.submit()
        }
      })
    }

    const skillFields: FormField<AgentFormData>[] = [
      {
        name: 'skillDirectory',
        type: 'path',
        label: '技能位置',
        placeholder: '选择或输入技能目录',
        hint: '智能体会从这个目录读取技能。',
        dialogOptions: {
          properties: ['openDirectory'],
          title: '选择技能目录'
        }
      } as PathSelectorField<AgentFormData>,
      {
        name: 'disabledSkills',
        type: 'custom',
        render: (formData) => {
          void skillRefreshVersion.value
          const skillDirectory = resolveSkillDirectory(formData.skillDirectory)
          const disabledSkillNames = new Set(
            ((formData.disabledSkills as string[]) || []).map((name) => name.toLowerCase())
          )
          const skills = skillDirectory
            ? discoverSkills([skillDirectory], {
                includeDisabled: true,
                disabledSkillNames: formData.disabledSkills as string[],
                applyCurrentAgentFilters: false
              })
            : []

          const toggleSkill = (skill: SkillMetadata) => {
            const currentDisabledSkills = getDisabledSkills()
            const nextDisabledSkills = skill.enabled
              ? currentDisabledSkills
                  .concat(skill.name)
                  .filter((value, index, array) => array.indexOf(value) === index)
              : currentDisabledSkills.filter(
                  (name) => name.toLowerCase() !== skill.name.toLowerCase()
                )
            setDisabledSkills(nextDisabledSkills)
          }

          const openSkillDirectory = async (targetPath: string) => {
            if (!targetPath) return
            await window.api.shell.openPath(targetPath)
          }

          return (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}
            >
              {skills.length > 0 ? (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: '10px'
                  }}
                >
                  {skills.map((skill) => {
                    const isDisabled = disabledSkillNames.has(skill.name.toLowerCase())
                    const isEnabled = !isDisabled
                    return (
                      <div
                        key={skill.name}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          background: 'var(--bg-card)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '10px',
                          padding: '12px 14px',
                          minHeight: '88px',
                          overflow: 'hidden',
                          opacity: isEnabled ? 1 : 0.7
                        }}
                      >
                        <div
                          style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '10px',
                            background: 'var(--bg-hover)',
                            border: '1px solid var(--border-subtle)',
                            color: 'var(--text-secondary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}
                        >
                          {Sparkles}
                        </div>
                        <div
                          style={{
                            minWidth: 0,
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px'
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              minWidth: 0
                            }}
                          >
                            <div
                              style={{
                                fontSize: '15px',
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                                lineHeight: 1.25,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}
                            >
                              {skill.name}
                            </div>
                            {!isEnabled && (
                              <div
                                style={{
                                  flexShrink: 0,
                                  fontSize: '10px',
                                  color: 'var(--text-tertiary)',
                                  background: 'var(--bg-hover)',
                                  border: '1px solid var(--border-subtle)',
                                  borderRadius: '999px',
                                  padding: '1px 6px'
                                }}
                              >
                                已禁用
                              </div>
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: '11px',
                              color: 'var(--text-secondary)',
                              lineHeight: 1.35,
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden'
                            }}
                          >
                            {skill.description}
                          </div>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            flexShrink: 0
                          }}
                        >
                          <Button
                            size="sm"
                            variant="text"
                            title={isEnabled ? '禁用技能' : '启用技能'}
                            onClick={() => toggleSkill(skill)}
                          >
                            {isEnabled ? Active : Inactive}
                          </Button>
                          <Button
                            size="sm"
                            variant="text"
                            title="查看详情"
                            onClick={() => openSkillDetail(skill, skills)}
                          >
                            {Eye}
                          </Button>
                          <Button
                            size="sm"
                            variant="text"
                            title="编辑技能"
                            onClick={() => openEditSkillModal(skill)}
                          >
                            {Pencil}
                          </Button>
                          <Button
                            size="sm"
                            variant="text"
                            title="打开文件夹"
                            onClick={() => openSkillDirectory(skill.path)}
                          >
                            {Folder}
                          </Button>
                          <Button
                            size="sm"
                            variant="text"
                            title="删除技能"
                            onClick={() => void deleteSkill(skill)}
                          >
                            {Trash}
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '10px',
                    textAlign: 'center',
                    padding: '32px 24px',
                    background: 'var(--bg-hover)',
                    borderRadius: '12px',
                    border: '1px dashed var(--border-subtle)'
                  }}
                >
                  <div
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '12px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {Sparkles}
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    还没有技能
                  </div>
                  <div
                    style={{
                      maxWidth: '560px',
                      fontSize: '13px',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.6
                    }}
                  >
                    当前智能体会从这个目录自动发现技能。你可以修改技能目录，或直接往目录里放入
                    `SKILL.md`。
                  </div>
                  <Button size="sm" onClick={openCreateSkillModal}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      {Plus}
                      <span>新建技能</span>
                    </span>
                  </Button>
                </div>
              )}
            </div>
          )
        }
      } as CustomField<AgentFormData>
    ]

    const advancedFields: FormField<AgentFormData>[] = [
      {
        name: 'contextCount',
        type: 'number',
        label: '历史上下文条数',
        hint: '发送给模型进行参考的历史消息条数。当消息数量接近此限制时，将触发自动压缩（如果已启用）。'
      } as TextField<AgentFormData>,
      {
        name: 'contextTokenCount',
        type: 'number',
        label: '历史上下文 Token',
        hint: '发送给模型的历史消息估算 token 阈值。达到该阈值时，也会触发自动压缩。'
      } as TextField<AgentFormData>,
      {
        name: 'autoCompressContext',
        type: 'boolean',
        label: '自动压缩上下文',
        hint: '当对话历史条数或估算 token 接近阈值时，自动调用压缩模型生成摘要。'
      } as BooleanField<AgentFormData>,
      {
        name: 'compressModel',
        type: 'modelSelector',
        label: '压缩模型',
        hint: '用于生成上下文压缩摘要的模型。建议选择轻量级模型以节省成本。',
        modelCategory: 'text',
        popupPosition: 'bottom',
        ifShow: (data) => data.autoCompressContext === true
      } as ModelSelectorField<AgentFormData>,
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
      } as PathSelectorField<AgentFormData>
    ]

    const allFields: FormField<AgentFormData>[] = [
      ...basicFields,
      ...modelFields,
      ...speechFields,
      ...builtinToolFields,
      ...mcpFields,
      ...skillFields,
      ...knowledgeFields,
      ...appearanceFields,
      ...advancedFields
    ]

    const [Form, formActions] = useForm<AgentFormData>({
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
        if (field === 'builtinTools') {
          const selectedBuiltinTools = value as string[]
          const currentApprovalTools = (
            (formData.builtinToolsRequireApproval as string[]) || []
          ).filter((toolName) => selectedBuiltinTools.includes(toolName))
          formActions.setFieldValue('builtinToolsRequireApproval', currentApprovalTools)
          formActions.updateFieldProps('builtinTools', {
            options: getBuiltinToolOptions(selectedBuiltinTools, currentApprovalTools)
          })
        }
      },
      onSubmit: (data) => {
        // 转换 defaultModel 格式
        const defaultModel =
          data.defaultModel?.providerId && data.defaultModel?.modelId
            ? {
                providerId: data.defaultModel.providerId,
                modelId: data.defaultModel.modelId
              }
            : undefined

        const finalData = {
          ...data,
          backgrounds:
            data.backgrounds?.map((url) => {
              const isVideo = isVideoUrl(url)
              return {
                type: isVideo ? 'video' : 'image',
                url
              }
            }) || [],
          defaultModel
        } as Partial<Agent>

        if (isEdit && agent) {
          agentStore.updateAgent(agent.id, finalData)
        } else {
          agentStore.createAgent(finalData as Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>)
        }
      }
    })

    formActions.updateFieldProps('tools', {
      options: getAllToolOptions(initialData.mcpServers || [])
    })
    formActions.updateFieldProps('builtinTools', {
      options: getBuiltinToolOptions(
        initialData.builtinTools || [],
        initialData.builtinToolsRequireApproval || []
      )
    })

    const ModalContent = defineComponent({
      setup() {
        const categories = [
          { id: 'basic', name: '基本信息', icon: Robot, fields: basicFields },
          { id: 'model', name: '模型参数', icon: Settings, fields: modelFields },
          { id: 'speech', name: '语音配置', icon: Speaker224Regular, fields: speechFields },
          {
            id: 'builtin-tools',
            name: '内置工具',
            icon: Wrench20Regular,
            fields: builtinToolFields
          },
          { id: 'mcp', name: 'MCP 服务', icon: Wrench20Regular, fields: mcpFields },
          { id: 'skills', name: '技能配置', icon: Sparkles, fields: skillFields },
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

  return {
    openAgentModal,
    handleDelete
  }
}
