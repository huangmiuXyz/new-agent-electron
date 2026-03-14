import { z } from 'zod'
import { useAgentStore } from '@renderer/stores/agent'

export interface SkillMetadata {
  name: string
  description: string
  path: string
  enabled: boolean
}

export interface LoadedSkill {
  skillDirectory: string
  content: string
}

interface SkillFrontmatter {
  name: string
  description: string
  enabled?: boolean | string
  [key: string]: any
}

interface DiscoverSkillsOptions {
  includeDisabled?: boolean
  disabledSkillNames?: string[]
  applyCurrentAgentFilters?: boolean
}

const SKILL_FILE_NAME = 'SKILL.md'
const DEFAULT_SKILLS_DIR = '~/.agents/skills'
const SKILL_NAME_PATTERN = /^[a-z0-9-]+$/
const MAX_NAME_LENGTH = 64
const MAX_DESCRIPTION_LENGTH = 1024

function hasLocalSkillApi(): boolean {
  return Boolean(window.api?.fs && window.api?.path && window.api?.os)
}

function unquote(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function parseScalarValue(value: string): string | boolean {
  const normalized = unquote(value)
  if (normalized === 'true') return true
  if (normalized === 'false') return false
  return normalized
}

function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

/**
 * 解析 YAML frontmatter
 */
function parseFrontmatter(content: string): SkillFrontmatter {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match?.[1]) throw new Error('No frontmatter found')

  const yaml = match[1]
  const result: Record<string, any> = {}
  const lines = yaml.split('\n')
  let nestedKey: string | null = null

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue

    // Only parse one-level nested maps (for optional metadata blocks).
    if (/^[ \t]+/.test(line) && nestedKey) {
      const trimmed = line.trim()
      const nestedColonIndex = trimmed.indexOf(':')
      if (nestedColonIndex > 0) {
        const key = trimmed.slice(0, nestedColonIndex).trim()
        const value = parseScalarValue(trimmed.slice(nestedColonIndex + 1))
        if (typeof result[nestedKey] !== 'object' || result[nestedKey] === null) {
          result[nestedKey] = {}
        }
        result[nestedKey][key] = value
      }
      continue
    }

    const colonIndex = line.indexOf(':')
    if (colonIndex <= 0) continue

    const key = line.slice(0, colonIndex).trim()
    const value = line.slice(colonIndex + 1).trim()
    if (!key) continue

    if (!value) {
      nestedKey = key
      if (!(key in result)) {
        result[key] = {}
      }
      continue
    }

    nestedKey = null
    result[key] = parseScalarValue(value)
  }

  return result as SkillFrontmatter
}

function validateFrontmatter(frontmatter: SkillFrontmatter): {
  name: string
  description: string
  enabled: boolean
} | null {
  const name = frontmatter.name?.trim()
  const description = frontmatter.description?.trim()

  if (!name || !description) {
    return null
  }

  if (name.length > MAX_NAME_LENGTH || description.length > MAX_DESCRIPTION_LENGTH) {
    return null
  }

  if (
    !SKILL_NAME_PATTERN.test(name) ||
    name.startsWith('-') ||
    name.endsWith('-') ||
    name.includes('--')
  ) {
    return null
  }

  return {
    name,
    description,
    enabled: true
  }
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
 * 优先使用智能体配置的技能目录，留空时回退默认目录
 */
export function getSkillsDirectories(): string[] {
  if (!hasLocalSkillApi()) {
    return []
  }

  const chatsStore = useChatsStores()
  const agentStore = useAgentStore()
  const agentId = chatsStore.currentChat?.agentId || 'default'
  const currentAgent = agentStore.getAgentById(agentId)
  const rawPath = currentAgent?.skillDirectory?.trim() || DEFAULT_SKILLS_DIR

  if (rawPath.startsWith('~/')) {
    return [window.api.path.join(window.api.os.homedir(), rawPath.slice(2))]
  }

  return [rawPath]
}

export function getPrimarySkillDirectory(): string {
  return getSkillsDirectories()[0] || DEFAULT_SKILLS_DIR
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
export function discoverSkills(
  directories: string[] = getSkillsDirectories(),
  options: DiscoverSkillsOptions = {}
): SkillMetadata[] {
  if (!hasLocalSkillApi() || directories.length === 0) {
    return []
  }

  const skills: SkillMetadata[] = []
  const seenNames = new Set<string>()

  const includeDisabled = options.includeDisabled === true
  const applyCurrentAgentFilters = options.applyCurrentAgentFilters !== false
  const chatsStore = useChatsStores()
  const agentStore = useAgentStore()
  const currentAgentId = chatsStore.currentChat?.agentId || 'default'
  const currentAgent = agentStore.getAgentById(currentAgentId)
  const disabledSkillNames = new Set(
    (
      options.disabledSkillNames ||
      (applyCurrentAgentFilters ? currentAgent?.disabledSkills : []) ||
      []
    ).map((name) => name.trim().toLowerCase())
  )

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
        const validated = validateFrontmatter(frontmatter)

        if (!validated) {
          console.warn(`Skill ${entry} has invalid frontmatter for Agent Skills spec`)
          continue
        }

        const normalizedName = validated.name.toLowerCase()
        if (seenNames.has(normalizedName)) continue
        seenNames.add(normalizedName)

        const enabled = !disabledSkillNames.has(normalizedName)
        if (!includeDisabled && !enabled) continue

        skills.push({
          name: validated.name,
          description: validated.description,
          path: skillDir,
          enabled
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
export function loadSkill(
  skillName: string,
  skills: SkillMetadata[] = discoverSkills()
): LoadedSkill | null {
  if (!hasLocalSkillApi()) {
    return null
  }

  const skill = skills.find((s) => s.name.toLowerCase() === skillName.toLowerCase())

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
  const targetSkillDirectory = getPrimarySkillDirectory()

  if (skills.length === 0) {
    return [
      '## Skills',
      `Current agent skill directory: ${escapeXml(targetSkillDirectory)}`,
      'When a workflow installs a skill, use this directory as the destination instead of any default skills path.'
    ].join('\n')
  }

  const skillsXml = skills
    .map((s) =>
      [
        '  <skill>',
        `    <name>${escapeXml(s.name)}</name>`,
        `    <description>${escapeXml(s.description)}</description>`,
        `    <location>${escapeXml(window.api.path.join(s.path, SKILL_FILE_NAME))}</location>`,
        '  </skill>'
      ].join('\n')
    )
    .join('\n')

  return [
    '## Skills',
    'Use the `loadSkill` tool when a user request would benefit from specialized instructions.',
    'After loading a skill, open referenced files under the returned skill directory when needed.',
    `Current agent skill directory: ${escapeXml(targetSkillDirectory)}`,
    'When a workflow installs a skill, use this directory as the destination instead of any default skills path.',
    '',
    '<available_skills>',
    skillsXml,
    '</available_skills>'
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
