import { loadSkill, type SkillMetadata } from '@renderer/services/skillsService'
import Markdown from '@renderer/components/Markdown.vue'

export const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---/

export function getSkillFilePath(skillPath: string): string {
  return window.api.path.join(skillPath, 'SKILL.md')
}

export function getRawSkillContent(skill: SkillMetadata): string {
  return window.api.fs.readFileSync(getSkillFilePath(skill.path), 'utf-8')
}

export function stripFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
  return match ? content.slice(match[0].length).trim() : content.trim()
}

export function buildSkillFileContent(name: string, description: string, body: string, enabled = true): string {
  const normalizedBody = body.trim()
  return [
    '---',
    `name: ${name}`,
    `description: ${description}`,
    `enabled: ${enabled}`,
    '---',
    '',
    normalizedBody
  ].join('\n')
}

export function validateSkillName(name: string): boolean {
  return (
    /^[a-z0-9-]+$/.test(name) &&
    !name.startsWith('-') &&
    !name.endsWith('-') &&
    !name.includes('--')
  )
}

export function readSkillFileEnabled(skill: SkillMetadata): boolean {
  try {
    const content = getRawSkillContent(skill)
    const match = content.match(FRONTMATTER_PATTERN)
    if (!match) return true
    const frontmatterMatch = match[1].match(/(^|\n)enabled:\s*(true|false)\s*($|\n)/)
    return frontmatterMatch ? frontmatterMatch[2] === 'true' : true
  } catch {
    return true
  }
}

export function setSkillEnabledInContent(content: string, enabled: boolean): string {
  const match = content.match(FRONTMATTER_PATTERN)
  if (!match) return content
  const frontmatter = match[1]
  const updatedFrontmatter = /(^|\n)enabled:\s*(true|false)\s*($|\n)/.test(frontmatter)
    ? frontmatter.replace(/(^|\n)enabled:\s*(true|false)\s*($|\n)/, `$1enabled: ${enabled}$3`)
    : `${frontmatter}\nenabled: ${enabled}`
  return content.replace(FRONTMATTER_PATTERN, `---\n${updatedFrontmatter}\n---`)
}

export function createSkillTemplate(name: string, description: string): string {
  return buildSkillFileContent(
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
}

export function useSkills() {
  const { confirm, remove } = useModal()
  const { showContextMenu } = useContextMenu<SkillMetadata>()
  const { Eye, Pencil, Folder, Trash } = useIcon(['Eye', 'Pencil', 'Folder', 'Trash'])

  const toggleSkillEnabled = (skill: SkillMetadata, onRefresh?: () => void) => {
    if (skill.builtin) {
      messageApi.info('内置技能随应用提供，始终可用')
      return
    }

    try {
      const rawContent = getRawSkillContent(skill)
      const nextEnabled = !readSkillFileEnabled(skill)
      const nextContent = setSkillEnabledInContent(rawContent, nextEnabled)
      window.api.fs.writeFileSync(getSkillFilePath(skill.path), nextContent, 'utf-8')
      onRefresh?.()
      messageApi.success(nextEnabled ? `已启用技能：${skill.name}` : `已禁用技能：${skill.name}`)
    } catch (error) {
      messageApi.error(`更新技能状态失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const openSkillDirectory = async (targetPath?: string) => {
    if (!targetPath) return
    await window.api.shell.openPath(targetPath)
  }

  const openSkillDetail = (skill: SkillMetadata) => {
    const loaded = loadSkill(skill.name)
    if (!loaded) {
      messageApi.error(`加载技能失败：${skill.name}`)
      return
    }

    const fullContent = `> ${skill.description}\n\n${loaded.content}`

    const SkillDetailContent = defineComponent({
      setup() {
        const block = { text: fullContent, state: 'done', type: 'text' } as any
        const message = { content: fullContent, role: 'assistant', id: `skill-${skill.name}` } as any
        return { skill, block, message }
      },
      render() {
        return h('div', { class: 'skill-detail-modal' },
          h('div', { class: 'skill-detail-body' }, [
            h(Markdown, { block: this.block, message: this.message, disableTranslation: false })
          ])
        )
      }
    })

    confirm({
      title: `技能详情 · ${skill.name}`,
      content: SkillDetailContent,
      width: '80vw',
      maxHeight: '80vh',
      showCancel: false,
      beforeClose: async () => {
        const confirmed = await confirm({ title: '关闭', content: '是否关闭？' })
        return !!confirmed
      }
    })
  }

  const openEditSkillModal = (skill: SkillMetadata, skillDirectory: string, onRefresh?: () => void) => {
    if (skill.builtin) {
      messageApi.info('内置技能不可直接编辑；需要改动时可以复制到本地技能目录')
      return
    }

    let rawContent = ''
    try {
      rawContent = getRawSkillContent(skill)
    } catch (error) {
      messageApi.error(`读取技能失败：${error instanceof Error ? error.message : String(error)}`)
      return
    }

    const [FormComponent, formActions] = useForm({
      title: `编辑技能 · ${skill.name}`,
      showHeader: false,
      initialData: {
        name: skill.name,
        description: skill.description,
        body: stripFrontmatter(rawContent)
      },
      fields: [
        { name: 'name', type: 'text', label: '技能名称', required: true, placeholder: '例如：design-review' },
        { name: 'description', type: 'textarea', label: '技能描述', required: true, placeholder: '简要描述这个技能负责什么' },
        { name: 'body', type: 'textarea', label: '技能正文', required: true, placeholder: '请输入技能正文 Markdown', rows: 18 }
      ],
      onSubmit: (data: Record<string, any>) => {
        const nextName = data.name.trim()
        const nextDescription = data.description.trim()
        const nextBody = data.body.trim()
        if (!nextName || !nextDescription || !nextBody) { messageApi.error('请填写完整的技能名称、描述和正文'); return }
        if (!validateSkillName(nextName)) { messageApi.error('技能名称只能包含小写字母、数字和中划线'); return }

        const nextDir = window.api.path.join(skillDirectory, nextName)
        const nextFile = getSkillFilePath(nextDir)
        const currentDir = skill.path
        if (nextName !== skill.name && window.api.fs.existsSync(nextDir)) { messageApi.error(`目标技能目录已存在：${nextName}`); return }

        try {
          if (nextName !== skill.name) window.api.fs.renameSync(currentDir, nextDir)
          window.api.fs.writeFileSync(nextFile, buildSkillFileContent(nextName, nextDescription, nextBody, readSkillFileEnabled(skill)), 'utf-8')
          onRefresh?.()
          remove()
          messageApi.success(`已更新技能：${nextName}`)
        } catch (error) {
          messageApi.error(`更新技能失败：${error instanceof Error ? error.message : String(error)}`)
        }
      }
    })

    confirm({
      title: `编辑技能 · ${skill.name}`,
      content: FormComponent,
      width: '720px',
      maxHeight: '80vh',
      onOk: async () => { formActions.submit() }
    })
  }

  const deleteSkill = async (skill: SkillMetadata, onRefresh?: () => void) => {
    if (skill.builtin) { messageApi.info('内置技能不可删除'); return }
    const confirmed = await confirm({ title: '删除技能', content: `确定要删除技能 "${skill.name}" 吗？此操作不可撤销。` })
    if (!confirmed) return
    try {
      window.api.fs.rmSync(skill.path, { recursive: true, force: true })
      onRefresh?.()
      messageApi.success(`已删除技能：${skill.name}`)
    } catch (error) {
      messageApi.error(`删除技能失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const openCreateSkillModal = (skillDirectory: string, onRefresh?: () => void) => {
    if (!skillDirectory) { messageApi.error('当前没有可用的技能目录，请先切换目录'); return }

    const [FormComponent, formActions] = useForm({
      title: '新技能',
      showHeader: false,
      initialData: { name: '', description: '' },
      fields: [
        { name: 'name', type: 'text', label: '技能名称', required: true, placeholder: '例如：design-review' },
        { name: 'description', type: 'textarea', label: '技能描述', required: true, placeholder: '简要描述这个技能负责什么' }
      ],
      onSubmit: (data: Record<string, any>) => {
        const name = data.name.trim()
        const description = data.description.trim()
        if (!name || !description) { messageApi.error('请填写完整的技能名称和描述'); return }
        if (!validateSkillName(name)) { messageApi.error('技能名称只能包含小写字母、数字和中划线'); return }

        const targetDir = window.api.path.join(skillDirectory, name)
        const skillFile = getSkillFilePath(targetDir)
        if (window.api.fs.existsSync(targetDir)) { messageApi.error(`技能目录已存在：${name}`); return }

        try {
          window.api.fs.mkdirSync(targetDir, { recursive: true })
          window.api.fs.writeFileSync(skillFile, createSkillTemplate(name, description), 'utf-8')
          onRefresh?.()
          remove()
          messageApi.success(`已创建技能：${name}`)
        } catch (error) {
          messageApi.error(`创建技能失败：${error instanceof Error ? error.message : String(error)}`)
        }
      }
    })

    confirm({
      title: '新技能',
      content: FormComponent,
      width: '560px',
      maxHeight: '70vh',
      onOk: async () => { formActions.submit() }
    })
  }

  const getSkillMenuOptions = (skill: SkillMetadata, skillDirectory: string, onRefresh?: () => void): MenuItem<SkillMetadata>[] => [
    { label: '查看详情', icon: Eye, onClick: () => openSkillDetail(skill) },
    { label: skill.builtin ? '内置技能不可编辑' : '编辑技能', icon: Pencil, disabled: skill.builtin, onClick: () => openEditSkillModal(skill, skillDirectory, onRefresh) },
    { label: '打开文件夹', icon: Folder, onClick: () => void openSkillDirectory(skill.path) },
    { type: 'divider' },
    { label: skill.builtin ? '内置技能不可删除' : '删除技能', icon: Trash, disabled: skill.builtin, danger: true, onClick: () => void deleteSkill(skill, onRefresh) }
  ]

  const openSkillMenu = (skill: SkillMetadata, event: MouseEvent, skillDirectory: string, onRefresh?: () => void) => {
    showContextMenu(event, getSkillMenuOptions(skill, skillDirectory, onRefresh), skill)
  }

  return {
    toggleSkillEnabled,
    openSkillDetail,
    openEditSkillModal,
    openCreateSkillModal,
    deleteSkill,
    openSkillDirectory,
    openSkillMenu,
    getSkillMenuOptions,
    getSkillFilePath,
    getRawSkillContent,
    stripFrontmatter,
    buildSkillFileContent,
    validateSkillName,
    readSkillFileEnabled,
    setSkillEnabledInContent,
    createSkillTemplate
  }
}
