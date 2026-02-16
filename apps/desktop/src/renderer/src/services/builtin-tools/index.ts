import { discoverSkills, type SkillMetadata } from '../skillsService'
import { getAgentBuiltinTools } from './tools/agent-tools'
import { getCodexBuiltinTools } from './tools/codex-tools'
import { getGeneralBuiltinTools } from './tools/general-tools'
import { getMediaBuiltinTools } from './tools/media-tools'
import { getNetworkBuiltinTools } from './tools/network-tools'

export const getBuiltinTools = (options?: {
  knowledgeBaseIds?: string[]
  skills?: SkillMetadata[]
}): Tools => {
  const { pluginLoader } = usePlugins()
  const manager = pluginLoader.getPluginManager()
  const skills = options?.skills ?? discoverSkills()

  return {
    ...getGeneralBuiltinTools(),
    ...getAgentBuiltinTools(skills),
    ...getNetworkBuiltinTools({ knowledgeBaseIds: options?.knowledgeBaseIds }),
    ...getMediaBuiltinTools(),
    ...getCodexBuiltinTools(),
    ...(manager?.getBuiltinTools ? Object.fromEntries(manager.getBuiltinTools()) : {})
  }
}
