import type { LanguageModelV3Middleware } from '@ai-sdk/provider'
import type { SkillMetadata } from '@renderer/services/skillsService'
import { loadSkill } from '@renderer/services/skillsService'

interface SkillReferenceMiddlewareOptions {
  skills?: SkillMetadata[]
}

const SKILL_REFERENCE_REGEX = /(^|[\s([{'"“‘])@(?:(?:skills|技能):)?([a-z0-9-]{1,64})(?=$|[\s)\]};,.!?'"，。！？、】【])/gi

export const createSkillReferenceMiddleware = (
  options: SkillReferenceMiddlewareOptions
): LanguageModelV3Middleware => {
  const { skills = [] } = options

  return {
    specificationVersion: 'v3',
    transformParams: async ({ params }) => {
      if (!skills.length) {
        return params
      }

      const lastUserMessageText = getLastUserMessageText(params.prompt)
      if (!lastUserMessageText) {
        return params
      }

      const referencedSkillNames = extractReferencedSkillNames(lastUserMessageText)
      if (!referencedSkillNames.length) {
        return params
      }

      const referencedSkills = referencedSkillNames
        .map((name) => {
          const metadata = skills.find((skill) => skill.name.toLowerCase() === name)
          if (!metadata) return null
          const loaded = loadSkill(metadata.name, skills)
          if (!loaded) return null

          return {
            metadata,
            content: loaded.content
          }
        })
        .filter((skill): skill is { metadata: SkillMetadata, content: string } => Boolean(skill))

      if (!referencedSkills.length) {
        return params
      }

      return replaceLastUserMessageText(
        params,
        buildSkillContextText(referencedSkills, lastUserMessageText)
      )
    }
  }
}

function extractReferencedSkillNames(input: string): string[] {
  const matches = Array.from(input.matchAll(SKILL_REFERENCE_REGEX))
  const names = matches
    .map((match) => match[2]?.toLowerCase())
    .filter((name): name is string => Boolean(name))

  return [...new Set(names)]
}

function buildSkillContextText(
  skills: Array<{ metadata: SkillMetadata, content: string }>,
  userInput: string
): string {
  const skillBlocks = skills
    .map(({ metadata, content }) => [
      `<skill name="${metadata.name}">`,
      `<description>${metadata.description}</description>`,
      content.trim(),
      '</skill>'
    ].join('\n'))
    .join('\n\n')

  return [
    '以下是用户通过 @ 引用的技能，请优先参考这些技能说明完成请求：',
    '',
    '<referenced_skills>',
    skillBlocks,
    '</referenced_skills>',
    '',
    '<user_message>',
    userInput,
    '</user_message>'
  ].join('\n')
}

function getLastUserMessageText(prompt: any): string | null {
  if (typeof prompt === 'string') {
    return prompt
  }

  if (Array.isArray(prompt)) {
    for (let i = prompt.length - 1; i >= 0; i -= 1) {
      const message = prompt[i]
      if (message.role !== 'user') continue

      if (typeof message.content === 'string') {
        return message.content
      }

      if (Array.isArray(message.content)) {
        const textPart = message.content.find((part: any) => part.type === 'text')
        if (textPart?.text) {
          return textPart.text
        }
      }
    }
  }

  return null
}

function replaceLastUserMessageText(params: any, text: string): any {
  if (typeof params.prompt === 'string') {
    return {
      ...params,
      prompt: text
    }
  }

  if (Array.isArray(params.prompt)) {
    const prompt = [...params.prompt]

    for (let i = prompt.length - 1; i >= 0; i -= 1) {
      const message = prompt[i]
      if (message.role !== 'user') continue

      if (typeof message.content === 'string') {
        prompt[i] = {
          ...message,
          content: text
        }
      } else if (Array.isArray(message.content)) {
        prompt[i] = {
          ...message,
          content: message.content.map((part: any) => {
            if (part.type === 'text') {
              return {
                ...part,
                text
              }
            }

            return part
          })
        }
      }

      break
    }

    return {
      ...params,
      prompt
    }
  }

  return params
}
