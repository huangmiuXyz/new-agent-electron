import { discoverSkills, type SkillMetadata } from '../skillsService'
import { getBuiltinToolGroupEntries } from './grouped-tools'

type BuiltinToolGroups = Record<string, string[]>

export const getBuiltinToolGroups = (options?: {
  knowledgeBaseIds?: string[]
  skills?: SkillMetadata[]
}): BuiltinToolGroups => {
  const { pluginLoader } = usePlugins()
  const manager = pluginLoader.getPluginManager()
  const skills = options?.skills ?? discoverSkills()
  const groupEntries = getBuiltinToolGroupEntries({
    knowledgeBaseIds: options?.knowledgeBaseIds,
    skills
  })

  const groups: BuiltinToolGroups = Object.fromEntries(
    groupEntries.map(({ group, tools }) => [group, Object.keys(tools)])
  )

  if (manager?.getBuiltinTools) {
    const pluginTools = manager.getBuiltinTools()
    for (const [key] of pluginTools) {
      if (!groups.插件工具) groups.插件工具 = []
      groups.插件工具.push(key)
    }
  }

  return groups
}

export const getBuiltinTools = (options?: {
  knowledgeBaseIds?: string[]
  skills?: SkillMetadata[]
}): Tools => {
  const { pluginLoader } = usePlugins()
  const manager = pluginLoader.getPluginManager()
  const skills = options?.skills ?? discoverSkills()

  return {
    ...Object.assign(
      {},
      ...getBuiltinToolGroupEntries({
        knowledgeBaseIds: options?.knowledgeBaseIds,
        skills
      }).map(({ tools }) => tools)
    ),
    ...(manager?.getBuiltinTools ? Object.fromEntries(manager.getBuiltinTools()) : {})
  }
}
