import type { LanguageModelMiddleware } from 'ai'
import type { SkillMetadata } from '@renderer/services/skillsService'
import { loadSkill } from '@renderer/services/skillsService'
import {
  getWorkspaceEntry,
  listWorkspaceEntries,
  readWorkspaceFileText,
  searchWorkspaceEntries,
  type WorkspaceFileEntry
} from '@renderer/services/fileMentionsService'
import {
  getNoteEntry,
  getNotePlainTextContent,
  listNoteEntries,
  searchNoteEntries,
  type NoteMentionEntry
} from '@renderer/services/noteMentionsService'

interface SkillReferenceMiddlewareOptions {
  skills?: SkillMetadata[]
  workPath?: string
}

const SKILL_REFERENCE_REGEX = /(^|[\s([{'"“‘])@(?:(?:skills|技能):)?([a-z0-9-]{1,64})(?=$|[\s)\]};,.!?'"，。！？、】【])/gi
const FILE_REFERENCE_REGEX =
  /(^|[\s([{'"“‘])@(?:file|文件):(?:"([^"\n\r]+)"|'([^'\n\r]+)'|([^\s)\]};,.!?'"，。！？、】【]+))/gi
const NOTE_REFERENCE_REGEX =
  /(^|[\s([{'"“‘])@(?:note|笔记):(?:"([^"\n\r]+)"|'([^'\n\r]+)'|([^\s)\]};,.!?'"，。！？、】【]+))/gi
const DIRECTORY_TREE_MAX_DEPTH = 2
const DIRECTORY_TREE_MAX_ENTRIES = 120
const NOTE_TREE_MAX_DEPTH = 2
const NOTE_TREE_MAX_ENTRIES = 120

export const createSkillReferenceMiddleware = (
  options: SkillReferenceMiddlewareOptions
): LanguageModelMiddleware => {
  const { skills = [], workPath } = options

  return {
    specificationVersion: 'v4',
    transformParams: async ({ params }) => {
      const _t1 = createTimeLog('SkillReferences中间件')
      const lastUserMessageText = getLastUserMessageText(params.prompt)
      if (!lastUserMessageText) {
        syncTimeLog(_t1, 'SkillReferences中间件')
        return params
      }

      const referencedSkillNames = extractReferencedSkillNames(lastUserMessageText)
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

      const referencedFilePaths = workPath ? extractReferencedFilePaths(lastUserMessageText) : []
      const referencedFiles = workPath
        ? referencedFilePaths
            .map((path) => buildFileReferenceBlock(workPath, path))
            .filter((file): file is string => Boolean(file))
        : []
      const referencedNotePaths = extractReferencedNotePaths(lastUserMessageText)
      const referencedNotes = referencedNotePaths
        .map((path) => buildNoteReferenceBlock(path))
        .filter((note): note is string => Boolean(note))

      if (!referencedSkills.length && !referencedFiles.length && !referencedNotes.length) {
        syncTimeLog(_t1, 'SkillReferences中间件')
        return params
      }

      syncTimeLog(_t1, 'SkillReferences中间件')
      return replaceLastUserMessageText(
        params,
        buildMentionContextText({
          userInput: lastUserMessageText,
          skills: referencedSkills,
          files: referencedFiles,
          notes: referencedNotes
        })
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

function extractReferencedFilePaths(input: string): string[] {
  const matches = Array.from(input.matchAll(FILE_REFERENCE_REGEX))
  const paths = matches
    .map((match) => match[2] || match[3] || match[4] || '')
    .map((path) => path.trim())
    .filter((path): path is string => Boolean(path))

  return [...new Set(paths)]
}

function extractReferencedNotePaths(input: string): string[] {
  const matches = Array.from(input.matchAll(NOTE_REFERENCE_REGEX))
  const paths = matches
    .map((match) => match[2] || match[3] || match[4] || '')
    .map((path) => path.trim())
    .filter((path): path is string => Boolean(path))

  return [...new Set(paths)]
}

function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function buildSkillContextSection(
  skills: Array<{ metadata: SkillMetadata, content: string }>,
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
    '</referenced_skills>'
  ].join('\n')
}

function buildDirectoryTree(workPath: string, relativePath: string): string {
  const lines: string[] = []
  let totalEntries = 0
  let truncated = false

  const walk = (currentRelativePath: string, depth: number) => {
    if (depth >= DIRECTORY_TREE_MAX_DEPTH || truncated) return

    const entries = listWorkspaceEntries(workPath, currentRelativePath)
    for (const entry of entries) {
      if (totalEntries >= DIRECTORY_TREE_MAX_ENTRIES) {
        truncated = true
        return
      }

      lines.push(`${'  '.repeat(depth)}${entry.kind === 'directory' ? 'd' : '-'} ${entry.name}`)
      totalEntries += 1

      if (entry.kind === 'directory') {
        walk(entry.relativePath, depth + 1)
      }
    }
  }

  walk(relativePath, 0)

  if (!lines.length) {
    return '(empty)'
  }

  if (truncated) {
    lines.push('... [truncated]')
  }

  return lines.join('\n')
}

function buildResolvedFileBlock(
  workPath: string,
  entry: WorkspaceFileEntry,
  sourceReference: string
): string {
  if (entry.kind === 'directory') {
    return [
      `<directory path="${escapeXml(entry.relativePath)}" source="${escapeXml(sourceReference)}">`,
      '<tree>',
      escapeXml(buildDirectoryTree(workPath, entry.relativePath)),
      '</tree>',
      '</directory>'
    ].join('\n')
  }

  const textFile = readWorkspaceFileText(workPath, entry.relativePath)
  if (!textFile) {
    return [
      `<file path="${escapeXml(entry.relativePath)}" source="${escapeXml(sourceReference)}" type="non-text">`,
      '该文件不是可直接内联的文本文件，未注入文件内容。',
      '</file>'
    ].join('\n')
  }

  return [
    `<file path="${escapeXml(textFile.entry.relativePath)}" source="${escapeXml(sourceReference)}" truncated="${textFile.truncated ? 'true' : 'false'}">`,
    '<content>',
    escapeXml(textFile.content),
    '</content>',
    '</file>'
  ].join('\n')
}

function buildFileReferenceBlock(workPath: string, reference: string): string | null {
  const exactEntry = getWorkspaceEntry(workPath, reference)
  if (exactEntry) {
    return buildResolvedFileBlock(workPath, exactEntry, reference)
  }

  const fuzzyMatches = searchWorkspaceEntries(workPath, reference, { limit: 6 })
  if (fuzzyMatches.length === 1) {
    return buildResolvedFileBlock(workPath, fuzzyMatches[0], reference)
  }

  if (fuzzyMatches.length > 1) {
    return [
      `<reference query="${escapeXml(reference)}" status="ambiguous">`,
      '<candidates>',
      escapeXml(fuzzyMatches.map((entry) => entry.relativePath).join('\n')),
      '</candidates>',
      '</reference>'
    ].join('\n')
  }

  return [
    `<reference query="${escapeXml(reference)}" status="missing">`,
    '未在当前 workPath 下找到匹配的文件或目录。',
    '</reference>'
  ].join('\n')
}

function buildFileContextSection(files: string[]): string {
  return [
    '以下是用户通过 @file 引用的工作路径内容，请优先参考这些文件或目录：',
    '',
    '<referenced_files>',
    files.join('\n\n'),
    '</referenced_files>'
  ].join('\n')
}

function buildNoteTree(folderId: string | null): string {
  const lines: string[] = []
  let totalEntries = 0
  let truncated = false

  const walk = (currentFolderId: string | null, depth: number) => {
    if (depth >= NOTE_TREE_MAX_DEPTH || truncated) return

    const entries = listNoteEntries(currentFolderId)
    for (const entry of entries) {
      if (totalEntries >= NOTE_TREE_MAX_ENTRIES) {
        truncated = true
        return
      }

      lines.push(`${'  '.repeat(depth)}${entry.kind === 'folder' ? 'd' : '-'} ${entry.name}`)
      totalEntries += 1

      if (entry.kind === 'folder') {
        walk(entry.id, depth + 1)
      }
    }
  }

  walk(folderId, 0)

  if (!lines.length) {
    return '(empty)'
  }

  if (truncated) {
    lines.push('... [truncated]')
  }

  return lines.join('\n')
}

function buildResolvedNoteBlock(entry: NoteMentionEntry, sourceReference: string): string {
  if (entry.kind === 'folder') {
    return [
      `<note_folder path="${escapeXml(entry.path)}" source="${escapeXml(sourceReference)}">`,
      '<tree>',
      escapeXml(buildNoteTree(entry.id)),
      '</tree>',
      '</note_folder>'
    ].join('\n')
  }

  return [
    `<note path="${escapeXml(entry.path)}" source="${escapeXml(sourceReference)}" id="${escapeXml(entry.id)}">`,
    '<content>',
    escapeXml(getNotePlainTextContent(entry) || ''),
    '</content>',
    '</note>'
  ].join('\n')
}

function buildNoteReferenceBlock(reference: string): string | null {
  const exactEntry = getNoteEntry(reference)
  if (exactEntry) {
    return buildResolvedNoteBlock(exactEntry, reference)
  }

  const fuzzyMatches = searchNoteEntries(reference, { limit: 6 })
  if (fuzzyMatches.length === 1) {
    return buildResolvedNoteBlock(fuzzyMatches[0], reference)
  }

  if (fuzzyMatches.length > 1) {
    return [
      `<note_reference query="${escapeXml(reference)}" status="ambiguous">`,
      '<candidates>',
      escapeXml(fuzzyMatches.map((entry) => entry.path).join('\n')),
      '</candidates>',
      '</note_reference>'
    ].join('\n')
  }

  return [
    `<note_reference query="${escapeXml(reference)}" status="missing">`,
    '未找到匹配的笔记或笔记文件夹。',
    '</note_reference>'
  ].join('\n')
}

function buildNoteContextSection(notes: string[]): string {
  return [
    '以下是用户通过 @note 引用的笔记内容，请优先参考这些笔记：',
    '',
    '<referenced_notes>',
    notes.join('\n\n'),
    '</referenced_notes>'
  ].join('\n')
}

function buildMentionContextText(options: {
  userInput: string
  skills: Array<{ metadata: SkillMetadata, content: string }>
  files: string[]
  notes: string[]
}): string {
  const sections = [
    options.skills.length > 0 ? buildSkillContextSection(options.skills) : '',
    options.files.length > 0 ? buildFileContextSection(options.files) : '',
    options.notes.length > 0 ? buildNoteContextSection(options.notes) : ''
  ].filter(Boolean)

  return [
    ...sections,
    '',
    '<user_message>',
    options.userInput,
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
