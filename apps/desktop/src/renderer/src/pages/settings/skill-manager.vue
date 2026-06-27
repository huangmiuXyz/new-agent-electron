<script setup lang="ts">
import { discoverSkills, getPrimarySkillDirectory, type SkillMetadata } from '@renderer/services/skillsService'
import { readSkillFileEnabled } from '@renderer/composables/useSkills'

const { Sparkles, Refresh } = useIcon(['Sparkles', 'Refresh'])
const { toggleSkillEnabled, openSkillMenu } = useSkills()

const skills = ref<SkillMetadata[]>([])
const searchQuery = ref('')

const query = computed(() => searchQuery.value.toLowerCase().trim())

const builtinSkills = computed(() =>
  skills.value.filter(s => s.builtin && matchesQuery(s))
)

const customSkills = computed(() =>
  skills.value.filter(s => !s.builtin && matchesQuery(s))
)

const filteredCount = computed(() => builtinSkills.value.length + customSkills.value.length)

const matchesQuery = (skill: SkillMetadata) => {
  if (!query.value) return true
  return (
    skill.name.toLowerCase().includes(query.value) ||
    skill.description.toLowerCase().includes(query.value)
  )
}

const skillDir = ref('')

const refreshSkills = () => {
  const dir = getPrimarySkillDirectory()
  if (!dir) return
  skillDir.value = dir
  const discovered = discoverSkills([dir], { includeDisabled: true, applyCurrentAgentFilters: false, includeBuiltin: true })
  skills.value = discovered.map(skill => ({
    ...skill,
    enabled: readSkillFileEnabled(skill)
  }))
}

onMounted(() => {
  refreshSkills()
})
</script>

<template>
  <FormContainer header-title="技能管理">
    <template #content>
      <div class="settings-page-wrapper">
      <SettingsList
        :count="filteredCount"
        count-label="个技能"
        :search-term="searchQuery"
        :show-search="skills.length > 0"
        search-placeholder="搜索技能"
        @update:search-term="searchQuery = $event"
      >
        <template #actions>
          <Button size="sm" variant="secondary" @click="refreshSkills">
            <template #icon><Refresh /></template>
            刷新
          </Button>
        </template>

        <SettingsGroup v-if="builtinSkills.length" label="内置">
          <SettingsRow
            v-for="skill in builtinSkills"
            :key="skill.name"
            :name="skill.name"
            :desc="skill.description"
            fade-actions
          >
            <template #icon>
              <div class="skill-icon"><Sparkles /></div>
            </template>
            <template #actions>
              <span class="builtin-label">内置</span>
            </template>
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup v-if="customSkills.length" label="自定义">
          <SettingsRow
            v-for="skill in customSkills"
            :key="skill.name"
            :name="skill.name"
            :desc="skill.description"
            fade-actions
          >
            <template #icon>
              <div class="skill-icon"><Sparkles /></div>
            </template>
            <template #actions>
              <div class="skill-actions">
                <div class="switch-wrap" @click.stop="toggleSkillEnabled(skill, refreshSkills)">
                  <Switch :model-value="skill.enabled" size="sm" />
                </div>
                <Button
                  size="sm"
                  variant="text"
                  class="action-btn gear-btn"
                  title="技能设置"
                  @click="openSkillMenu(skill, $event, skillDir, refreshSkills)"
                >
                  <template #icon>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                    </svg>
                  </template>
                </Button>
              </div>
            </template>
          </SettingsRow>
        </SettingsGroup>

        <template #empty>
          <div class="empty-icon"><Sparkles /></div>
          <div class="empty-title">{{ query ? '没有匹配的技能' : '尚未发现技能' }}</div>
          <div class="empty-hint">{{ query ? '试试其他关键词' : '技能文件存放在技能目录中' }}</div>
        </template>
      </SettingsList>
      </div>
    </template>
  </FormContainer>
</template>

<style scoped>
.skill-icon {
  width: 32px;
  height: 32px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--bg-hover), var(--bg-tertiary));
  color: var(--text-tertiary);
  border: 1px solid var(--border-subtle);
}
.skill-icon :deep(svg) { font-size: 15px; }
.skill-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}
.switch-wrap {
  display: flex;
  align-items: center;
  cursor: pointer;
}
.gear-btn {
  color: var(--text-tertiary) !important;
  border-radius: 6px !important;
}
.gear-btn:hover {
  color: var(--text-primary) !important;
  background: var(--bg-hover) !important;
}
.builtin-label {
  font-size: 10px;
  color: var(--accent-color);
  background: color-mix(in srgb, var(--accent-color) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent-color) 24%, var(--border-subtle));
  border-radius: 999px;
  padding: 1px 6px;
}
</style>
