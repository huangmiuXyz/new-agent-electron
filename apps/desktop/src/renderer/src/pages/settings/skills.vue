<script setup lang="ts">
import { discoverSkills, type SkillMetadata } from '@renderer/services/skillsService'

const DEFAULT_SKILL_DIRECTORY = '~/.agents/skills'

interface SkillDirectoryEntry {
  key: string
  agentId: string
  agentName: string
  directory: string
}

const { Sparkles, Plus, Refresh, Folder, Eye, Pencil, Trash, Active, Inactive } = useIcon([
  'Sparkles', 'Plus', 'Refresh', 'Folder', 'Eye', 'Pencil', 'Trash', 'Active', 'Inactive'
])
const {
  openSkillMenu, getSkillMenuOptions,
  toggleSkillEnabled: _toggleSkillEnabled,
  openSkillDetail: _openSkillDetail,
  openEditSkillModal: _openEditSkillModal,
  deleteSkill: _deleteSkill,
  openCreateSkillModal: _openCreateSkillModal,
  openSkillDirectory: _openSkillDirectory
} = useSkills()

const agentStore = useAgentStore()
const chatsStore = useChatsStores()

const skills = ref<SkillMetadata[]>([])
const searchKeyword = ref('')
const selectedDirectoryKey = ref('')

const resolveSkillDirectory = (rawPath?: string) => {
  const normalizedPath = rawPath?.trim() || DEFAULT_SKILL_DIRECTORY
  if (normalizedPath.startsWith('~/')) {
    return window.api.path.join(window.api.os.homedir(), normalizedPath.slice(2))
  }
  return normalizedPath
}

const skillDirectoryEntries = computed<SkillDirectoryEntry[]>(() => {
  return agentStore.allAgents.map((agent) => ({
    key: agent.id,
    agentId: agent.id,
    agentName: agent.name || '未命名智能体',
    directory: resolveSkillDirectory(agent.skillDirectory)
  }))
})

const preferredDirectoryKey = computed(() => {
  const currentAgentId = chatsStore.currentChat?.agentId
  const matched = skillDirectoryEntries.value.find((entry) => entry.agentId === currentAgentId)
  return matched?.key || skillDirectoryEntries.value[0]?.key || ''
})

const activeDirectoryKey = computed(() => {
  return selectedDirectoryKey.value || preferredDirectoryKey.value
})

const currentDirectoryEntry = computed(() => {
  return (
    skillDirectoryEntries.value.find((entry) => entry.key === activeDirectoryKey.value) ||
    skillDirectoryEntries.value[0] ||
    null
  )
})

const skillDirectory = computed(() => currentDirectoryEntry.value?.directory || '')

const refreshSkills = () => {
  skills.value = skillDirectory.value
    ? discoverSkills([skillDirectory.value], { includeDisabled: true })
    : []
}

const toggleSkillEnabled = (skill: SkillMetadata) => {
  _toggleSkillEnabled(skill, refreshSkills)
}

const openSkillDetail = (skill: SkillMetadata) => {
  _openSkillDetail(skill)
}

const openEditSkillModal = (skill: SkillMetadata) => {
  _openEditSkillModal(skill, skillDirectory.value, refreshSkills)
}

const deleteSkill = async (skill: SkillMetadata) => {
  await _deleteSkill(skill, refreshSkills)
}

const openCreateSkillModal = () => {
  if (!skillDirectory.value) {
    messageApi.error('当前没有可用的技能目录，请先切换目录')
    return
  }
  _openCreateSkillModal(skillDirectory.value, refreshSkills)
}

const openSkillDirectory = async (targetPath?: string) => {
  await _openSkillDirectory(targetPath || skillDirectory.value)
}

const selectSkillDirectory = (directoryKey: string) => {
  if (!directoryKey || directoryKey === activeDirectoryKey.value) return
  selectedDirectoryKey.value = directoryKey
  refreshSkills()
}

const filteredSkills = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) return skills.value
  return skills.value.filter(
    (skill) =>
      skill.name.toLowerCase().includes(keyword) ||
      skill.description.toLowerCase().includes(keyword) ||
      skill.path.toLowerCase().includes(keyword)
  )
})

onMounted(() => {
  refreshSkills()
})

watch(
  [skillDirectoryEntries, activeDirectoryKey],
  () => {
    if (!skillDirectoryEntries.value.some((entry) => entry.key === activeDirectoryKey.value)) {
      selectedDirectoryKey.value = ''
    }
    refreshSkills()
  },
  { immediate: true }
)
</script>

<template>
  <FormContainer header-title="技能">
    <template #content>
      <div class="skills-container">
        <div class="skills-overview">
          <div class="skills-title-block">
            <div class="skills-title-row">
              <div class="skills-title">本地技能</div>
              <div class="skills-count">{{ skills.length }} 个</div>
              <div v-if="currentDirectoryEntry" class="skills-directory-badge">
                {{ currentDirectoryEntry.agentName }}
              </div>
            </div>
            <div class="skills-directory-inline" :title="skillDirectory">
              {{ skillDirectory }}
            </div>
            <div v-if="skillDirectoryEntries.length > 1" class="skills-directory-switcher">
              <button
                v-for="entry in skillDirectoryEntries"
                :key="entry.key"
                type="button"
                class="skills-directory-chip"
                :class="{ active: entry.key === activeDirectoryKey }"
                :title="`${entry.agentName} · ${entry.directory}`"
                @click="selectSkillDirectory(entry.key)"
              >
                {{ entry.agentName }}
              </button>
            </div>
          </div>
          <div class="skills-overview-actions">
            <Button size="sm" variant="text" @click="openSkillDirectory()">
              <template #icon>
                <Folder />
              </template>
              打开目录
            </Button>
          </div>
        </div>

        <div class="skills-toolbar">
          <div class="skills-search">
            <SearchInput
              v-model="searchKeyword"
              placeholder="搜索技能名称、描述或路径"
              :enable-a-i-search="false"
              :show-icon="true"
            />
          </div>
          <div class="skills-actions">
            <Button size="sm" variant="secondary" @click="refreshSkills">
              <template #icon>
                <Refresh />
              </template>
              刷新
            </Button>
            <Button size="sm" @click="openCreateSkillModal()">
              <template #icon>
                <Plus />
              </template>
              新建技能
            </Button>
          </div>
        </div>

        <div class="skill-list">
          <div v-for="skillItem in filteredSkills" :key="skillItem.name" class="skill-card">
            <div class="skill-card-icon">
              <Sparkles />
            </div>
            <div class="skill-card-main">
              <div class="skill-card-name-row">
                <div class="skill-card-name">{{ skillItem.name }}</div>
                <div v-if="skillItem.builtin" class="skill-status-badge builtin">内置</div>
                <div v-if="!skillItem.enabled" class="skill-status-badge">已禁用</div>
              </div>
              <div class="skill-card-desc">{{ skillItem.description }}</div>
              <div class="skill-card-path" :title="skillItem.path">{{ skillItem.path }}</div>
            </div>
            <div class="skill-card-actions">
              <Button
                size="sm"
                variant="text"
                :title="skillItem.builtin ? '内置技能始终可用' : skillItem.enabled ? '禁用技能' : '启用技能'"
                :disabled="skillItem.builtin"
                @click="toggleSkillEnabled(skillItem)"
              >
                <template #icon>
                  <component :is="skillItem.enabled ? Active : Inactive" />
                </template>
              </Button>
              <Button size="sm" variant="text" title="查看详情" @click="openSkillDetail(skillItem)">
                <template #icon>
                  <Eye />
                </template>
              </Button>
              <Button
                size="sm"
                variant="text"
                :title="skillItem.builtin ? '内置技能不可直接编辑' : '编辑技能'"
                :disabled="skillItem.builtin"
                @click="openEditSkillModal(skillItem)"
              >
                <template #icon>
                  <Pencil />
                </template>
              </Button>
              <Button
                size="sm"
                variant="text"
                title="打开文件夹"
                @click="openSkillDirectory(skillItem.path)"
              >
                <template #icon>
                  <Folder />
                </template>
              </Button>
              <Button
                size="sm"
                variant="text"
                class="delete-btn"
                :title="skillItem.builtin ? '内置技能不可删除' : '删除技能'"
                :disabled="skillItem.builtin"
                @click="deleteSkill(skillItem)"
              >
                <template #icon>
                  <Trash />
                </template>
              </Button>
            </div>
          </div>

          <div v-if="filteredSkills.length === 0" class="empty-state">
            <div class="empty-state-icon">
              <Sparkles />
            </div>
            <div class="empty-state-title">
              {{ skills.length === 0 ? '还没有技能' : '没有匹配的技能' }}
            </div>
            <div class="empty-state-text">
              {{
                skills.length === 0
                  ? '技能会从当前目录自动发现。你可以直接创建一个新技能，或打开目录手动放入 SKILL.md。'
                  : '换个关键词试试，或刷新当前技能目录。'
              }}
            </div>
            <div class="empty-state-actions">
              <Button size="sm" variant="secondary" @click="openSkillDirectory()">
                <template #icon>
                  <Folder />
                </template>
                打开目录
              </Button>
              <Button size="sm" @click="openCreateSkillModal()">
                <template #icon>
                  <Plus />
                </template>
                新建技能
              </Button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </FormContainer>
</template>

<style scoped>
.skills-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.skills-overview {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 4px 0;
}

.skills-title-block {
  min-width: 0;
  flex: 1;
}

.skills-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.skills-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.skills-count {
  font-size: 11px;
  color: var(--accent-color);
  background: var(--bg-active);
  border: 1px solid rgba(var(--accent-rgb), 0.2);
  border-radius: 999px;
  padding: 2px 8px;
  white-space: nowrap;
}

.skills-directory-badge {
  font-size: 11px;
  color: var(--accent-color);
  background: var(--bg-active);
  border: 1px solid rgba(var(--accent-rgb), 0.2);
  border-radius: 999px;
  padding: 2px 8px;
  white-space: nowrap;
}

.skills-directory-inline {
  font-size: 12px;
  color: var(--text-secondary);
  font-family: monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.skills-directory-switcher {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.skills-directory-chip {
  max-width: 100%;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.3;
  font-family: monospace;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.skills-directory-chip:hover {
  border-color: var(--border-hover);
  color: var(--text-primary);
}

.skills-directory-chip.active {
  color: var(--accent-color);
  border-color: rgba(var(--accent-rgb), 0.35);
  background: var(--bg-active);
}

.skills-overview-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.skills-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.skills-search {
  flex: 1;
  min-width: 0;
}

.skills-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.skill-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  align-items: stretch;
}

.skill-card {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  padding: 12px 14px;
  box-sizing: border-box;
  min-height: 88px;
  overflow: hidden;
}

.skill-card:hover {
  border-color: var(--border-hover);
  background: var(--bg-hover);
}

.skill-card-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--bg-hover);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.skill-card-icon :deep(svg) {
  font-size: 18px;
}

.skill-card-main {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.skill-card-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.skill-card-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.skill-status-badge {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--text-tertiary);
  background: var(--bg-hover);
  border: 1px solid var(--border-subtle);
  border-radius: 999px;
  padding: 1px 6px;
}

.skill-status-badge.builtin {
  color: var(--accent-color);
  background: color-mix(in srgb, var(--accent-color) 10%, transparent);
  border-color: color-mix(in srgb, var(--accent-color) 24%, var(--border-subtle));
}

.skill-card-desc {
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.skill-card-path {
  font-size: 10px;
  color: var(--text-tertiary);
  font-family: monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.skill-card-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.delete-btn {
  color: var(--text-tertiary);
}

.delete-btn:hover {
  color: var(--color-danger);
}

.empty-state {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
  padding: 36px 24px;
  background: var(--bg-hover);
  border-radius: 12px;
  border: 1px dashed var(--border-subtle);
}

.empty-state-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-state-icon :deep(svg) {
  font-size: 20px;
}

.empty-state-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.empty-state-text {
  max-width: 560px;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.empty-state-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

:deep(.skill-detail-modal) {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

:deep(.skill-detail-header-card) {
  padding: 14px 16px;
  border: 1px solid var(--border-color-light);
  border-radius: 10px;
  background: var(--bg-hover);
}

:deep(.skill-detail-meta) {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

:deep(.skill-detail-name) {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

:deep(.skill-detail-desc) {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-top: 6px;
}

:deep(.skill-detail-body) {
  padding: 14px;
  max-height: 50vh;
  overflow: auto;
  background: var(--bg-hover);
  border: 1px solid var(--border-color-light);
  border-radius: 10px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.55;
}

:deep(.skill-detail-body .incremark) {
  font-size: 13px;
  line-height: 1.65;
}

@media (max-width: 1100px) {
  .skills-overview {
    align-items: flex-start;
    flex-direction: column;
  }

  .skills-overview-actions {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .skills-directory-chip {
    max-width: 100%;
  }

  .skill-list {
    grid-template-columns: 1fr;
  }
}
</style>
