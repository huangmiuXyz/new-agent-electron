import { z } from 'zod'
import { useAgentStore } from '@renderer/stores/agent'

export interface SkillMetadata {
  name: string
  description: string
  path: string
}

interface SkillFrontmatter {
  name: string
  description: string
  [key: string]: any
}

/**
 * 解析 YAML frontmatter
 */
function parseFrontmatter(content: string): SkillFrontmatter {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match?.[1]) throw new Error('No frontmatter found')

  const yaml = match[1]
  const result: Record<string, any> = {}

  // 简单的 YAML 解析（支持基本格式）
  const lines = yaml.split('\n')
  for (const line of lines) {
    const colonIndex = line.indexOf(':')
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim()
      let value = line.slice(colonIndex + 1).trim()
      // 去除引号
      if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      result[key] = value
    }
  }

  return result as SkillFrontmatter
}

/**
 * 移除 frontmatter，返回 markdown 正文
 */
function stripFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
  return match ? content.slice(match[0].length).trim() : content.trim()
}

/**
 * 获取技能目录路径
 * 基于当前选中智能体的终端启动路径 + /skills
 */
export function getSkillsDirectory(): string | null {
  const agentStore = useAgentStore()
  const selectedAgent = agentStore.selectedAgent

  if (!selectedAgent?.terminalStartupPath) {
    return null
  }

  return window.api.path.join(selectedAgent.terminalStartupPath, 'skills')
}

/**
 * 发现技能
 * 扫描技能目录中的所有技能（同步版本）
 */
export function discoverSkills(): SkillMetadata[] {
  const skillsDir = getSkillsDirectory()

  if (!skillsDir) {
    return []
  }

  const skills: SkillMetadata[] = []
  const seenNames = new Set<string>()

  try {
    // 检查目录是否存在
    const exists = window.api.fs.existsSync(skillsDir)
    if (!exists) {
      return []
    }

    // 读取目录内容
    const entries = window.api.fs.readdirSync(skillsDir)

    for (const entry of entries) {
      const skillDir = window.api.path.join(skillsDir, entry)

      // 只处理目录 (使用 mode 位运算判断，因为 context bridge 会丢失方法)
      let isDir = false
      try {
        const stat = window.api.fs.lstatSync(skillDir)
        // S_IFDIR = 0o040000, 检查 mode 的高位
        isDir = (stat.mode & 0o170000) === 0o040000
      } catch {
        continue
      }
      if (!isDir) continue

      const skillFile = window.api.path.join(skillDir, 'SKILL.md')

      try {
        // 检查 SKILL.md 是否存在
        const skillFileExists = window.api.fs.existsSync(skillFile)
        if (!skillFileExists) continue

        // 读取 SKILL.md 内容
        const content = window.api.fs.readFileSync(skillFile, 'utf-8')
        const frontmatter = parseFrontmatter(content)

        if (!frontmatter.name || !frontmatter.description) {
          console.warn(`Skill ${entry} missing name or description`)
          continue
        }

        // 同名技能已存在则跳过
        if (seenNames.has(frontmatter.name)) continue
        seenNames.add(frontmatter.name)

        skills.push({
          name: frontmatter.name,
          description: frontmatter.description,
          path: skillDir
        })
      } catch (error) {
        console.warn(`Failed to load skill ${entry}:`, error)
        continue
      }
    }
  } catch (error) {
    console.error('Failed to discover skills:', error)
  }

  return skills
}

/**
 * 加载技能
 * 读取技能的完整内容
 */
export function loadSkill(skillName: string): { skillDirectory: string; content: string } | null {
  const skills = discoverSkills()
  const skill = skills.find(s => s.name.toLowerCase() === skillName.toLowerCase())

  if (!skill) {
    return null
  }

  try {
    const skillFile = window.api.path.join(skill.path, 'SKILL.md')
    const content = window.api.fs.readFileSync(skillFile, 'utf-8')
    const body = stripFrontmatter(content)

    return {
      skillDirectory: skill.path,
      content: body
    }
  } catch (error) {
    console.error(`Failed to load skill ${skillName}:`, error)
    return null
  }
}

/**
 * 构建技能列表描述
 * 用于 loadSkill 工具的描述中
 */
export function buildSkillsListDescription(skills: SkillMetadata[]): string {
  if (skills.length === 0) {
    return ''
  }

  const skillsList = skills
    .map(s => `- ${s.name}: ${s.description}`)
    .join('\n')

  return `\n\n可用技能列表：\n${skillsList}`
}

/**
 * 创建 loadSkill 工具定义
 */
export function createLoadSkillTool(skills: SkillMetadata[]) {
  const skillsListDesc = buildSkillsListDescription(skills)

  return {
    title: '加载技能',
    description: `加载技能以获取专业指导和指令。当用户请求需要专业技能时，从以下列表中选择合适的技能名称并调用此工具加载。${skillsListDesc}`,
    inputSchema: z.object({
      name: z.string().describe('要加载的技能名称，从可用技能列表中选择')
    }),
    execute: async (args: unknown) => {
      const { name } = args as { name: string }
      const result = loadSkill(name)

      if (!result) {
        return {
          toolResult: {
            content: [
              {
                type: 'text',
                text: `技能 '${name}' 未找到。请检查技能名称是否正确。`
              }
            ]
          }
        }
      }

      return {
        toolResult: {
          content: [
            {
              type: 'text',
              text: result.content
            }
          ]
        }
      }
    }
  }
}
