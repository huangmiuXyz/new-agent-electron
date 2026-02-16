import { z } from 'zod'
import { useAgentStore } from '@renderer/stores/agent'

export interface SkillMetadata {
  name: string
  description: string
  path: string
}

export interface LoadedSkill {
  skillDirectory: string
  content: string
}

interface SkillFrontmatter {
  name: string
  description: string
  [key: string]: any
}

const SKILL_FILE_NAME = 'SKILL.md'
const LEGACY_PROJECT_SKILLS_DIR = 'skills'

/**
 * 解析 YAML frontmatter
 */
function parseFrontmatter(content: string): SkillFrontmatter {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match?.[1]) throw new Error('No frontmatter found')

  const yaml = match[1]
  const result: Record<string, any> = {}

  // Minimal YAML frontmatter parser for key-value fields.
  const lines = yaml.split('\n')
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const colonIndex = line.indexOf(':')
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim()
      let value = line.slice(colonIndex + 1).trim()

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
 * 获取技能目录路径列表
 * 当前仅支持旧的智能体路径：terminalStartupPath/skills
 */
export function getSkillsDirectories(): string[] {
  const agentStore = useAgentStore()
  const selectedAgent = agentStore.selectedAgent

  if (!selectedAgent?.terminalStartupPath) return []

  return [window.api.path.join(selectedAgent.terminalStartupPath, LEGACY_PROJECT_SKILLS_DIR)]
}

function isDirectory(path: string): boolean {
  try {
    const stat = window.api.fs.lstatSync(path)
    return (stat.mode & 0o170000) === 0o040000
  } catch {
    return false
  }
}

/**
 * 发现技能
 * 扫描技能目录中的所有技能（同步版本，多目录支持）
 */
export function discoverSkills(directories: string[] = getSkillsDirectories()): SkillMetadata[] {
  const skills: SkillMetadata[] = []
  const seenNames = new Set<string>()

  for (const skillsDir of directories) {
    let entries: string[]

    try {
      entries = window.api.fs.readdirSync(skillsDir)
    } catch {
      continue
    }

    for (const entry of entries) {
      const skillDir = window.api.path.join(skillsDir, entry)

      if (!isDirectory(skillDir)) continue

      const skillFile = window.api.path.join(skillDir, SKILL_FILE_NAME)

      try {
        const skillFileExists = window.api.fs.existsSync(skillFile)
        if (!skillFileExists) continue

        const content = window.api.fs.readFileSync(skillFile, 'utf-8')
        const frontmatter = parseFrontmatter(content)

        if (!frontmatter.name || !frontmatter.description) {
          console.warn(`Skill ${entry} missing name or description`)
          continue
        }

        const normalizedName = frontmatter.name.trim().toLowerCase()
        if (seenNames.has(normalizedName)) continue
        seenNames.add(normalizedName)

        skills.push({
          name: frontmatter.name.trim(),
          description: frontmatter.description.trim(),
          path: skillDir
        })
      } catch (error) {
        console.warn(`Failed to load skill ${entry}:`, error)
        continue
      }
    }
  }

  return skills
}

/**
 * 加载技能
 * 读取技能的完整内容
 */
export function loadSkill(skillName: string, skills: SkillMetadata[] = discoverSkills()): LoadedSkill | null {
  const skill = skills.find(s => s.name.toLowerCase() === skillName.toLowerCase())

  if (!skill) {
    return null
  }

  try {
    const skillFile = window.api.path.join(skill.path, SKILL_FILE_NAME)
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
 * 构建技能系统提示词（文档推荐做法）
 */
export function buildSkillsPrompt(skills: SkillMetadata[]): string {
  if (skills.length === 0) {
    return ''
  }

  const skillsList = skills
    .map(s => `- ${s.name}: ${s.description}`)
    .join('\n')

  return [
    '## Skills',
    'Use the `loadSkill` tool to load a skill when the user request would benefit from specialized instructions.',
    'After loading a skill, use `readFile` to open referenced files under the returned skill directory when needed.',
    '',
    'Available skills:',
    skillsList
  ].join('\n')
}

/**
 * 创建 loadSkill 工具定义
 */
export function createLoadSkillTool(skills: SkillMetadata[]) {
  return {
    title: '加载技能',
    description: '加载技能以获取专业指导和指令。',
    inputSchema: z.object({
      name: z.string().describe('要加载的技能名称')
    }),
    execute: async (args: unknown) => {
      const { name } = args as { name: string }
      const result = loadSkill(name, skills)

      if (!result) {
        const error = `技能 '${name}' 未找到。请检查技能名称是否正确。`
        return {
          error,
          toolResult: {
            content: [
              {
                type: 'text',
                text: error
              }
            ]
          }
        }
      }

      const resultText = `Skill directory: ${result.skillDirectory}\n\n${result.content}`

      return {
        skillDirectory: result.skillDirectory,
        content: result.content,
        toolResult: {
          content: [
            {
              type: 'text',
              text: resultText
            }
          ]
        }
      }
    }
  }
}
