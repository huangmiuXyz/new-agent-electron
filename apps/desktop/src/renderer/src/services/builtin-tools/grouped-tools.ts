import type { SkillMetadata } from '../skillsService'
import { getAgentBuiltinTools } from './tools/agent-tools'
import { getCanvasBuiltinTools } from './tools/canvas-tools'
import { getCodexBuiltinTools } from './tools/codex-tools'
import { getComputerBuiltinTools } from './tools/computer-tools'
import { getGeneralBuiltinTools } from './tools/general-tools'
import { getKnowledgeBuiltinTools } from './tools/knowledge-tools'
import { getMediaBuiltinTools } from './tools/media-tools'
import { getNetworkBuiltinTools } from './tools/network-tools'
import { getNotesBuiltinTools } from './tools/notes-tools'
import { getTodoBuiltinTools } from './tools/todo-tools'

export type BuiltinToolGroupEntry = {
  group: string
  tools: Partial<Tools>
}

export const getBuiltinToolGroupEntries = (options?: {
  knowledgeBaseIds?: string[]
  skills?: SkillMetadata[]
  agentTools?: Partial<Tools>
  builtinToolConfigs?: Agent['builtinToolConfigs']
  builtinTools?: string[]
}): BuiltinToolGroupEntry[] => {
  const skills = options?.skills ?? []

  return [
    { group: '通用工具', tools: getGeneralBuiltinTools() },
    { group: '画布工具', tools: getCanvasBuiltinTools() },
    { group: '电脑操作', tools: getComputerBuiltinTools(options?.builtinToolConfigs?.computer_use) },
    { group: 'Agent工具', tools: options?.agentTools ?? getAgentBuiltinTools(skills) },
    { group: '网络工具', tools: getNetworkBuiltinTools() },
    {
      group: '知识库',
      tools: getKnowledgeBuiltinTools({ knowledgeBaseIds: options?.knowledgeBaseIds })
    },
    { group: '笔记工具', tools: getNotesBuiltinTools() },
    { group: '多媒体工具', tools: getMediaBuiltinTools() },
    {
      group: 'Codex工具',
      tools: {
        ...getCodexBuiltinTools({ editFileMode: options?.builtinToolConfigs?.edit_file?.mode, builtinTools: options?.builtinTools }),
        ...getTodoBuiltinTools()
      }
    }
  ]
}
