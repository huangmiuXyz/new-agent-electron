<script setup lang="ts">
const { agents } = storeToRefs(useAgentStore())
const agentStore = useAgentStore()

const { Plus, Pencil, Trash, Robot } = useIcon(['Plus', 'Pencil', 'Trash', 'Robot'])
const { openAgentModal, handleDelete } = useAgent()

const searchQuery = ref('')

const query = computed(() => searchQuery.value.toLowerCase().trim())

const builtinAgents = computed(() =>
  agents.value.filter(
    (a) => agentStore.isBuiltinAgent(a.id) && matchesQuery(a)
  )
)

const customAgents = computed(() =>
  agents.value.filter(
    (a) => !agentStore.isBuiltinAgent(a.id) && matchesQuery(a)
  )
)

const filteredCount = computed(() => builtinAgents.value.length + customAgents.value.length)

const matchesQuery = (agent: Agent) => {
  if (!query.value) return true
  return (
    agent.name.toLowerCase().includes(query.value) ||
    agent.description?.toLowerCase().includes(query.value)
  )
}
</script>

<template>
  <FormContainer header-title="智能体管理">
    <template #content>
      <div class="settings-page-wrapper">
      <SettingsList
        :count="filteredCount"
        count-label="个智能体"
        :search-term="searchQuery"
        :show-search="agents.length > 0"
        search-placeholder="搜索智能体"
        @update:search-term="searchQuery = $event"
      >
        <template #actions>
          <Button size="sm" @click="openAgentModal()">
            <template #icon><Plus /></template>
            创建智能体
          </Button>
        </template>

        <SettingsGroup v-if="builtinAgents.length" label="内置">
          <SettingsRow
            v-for="agent in builtinAgents"
            :key="agent.id"
            :name="agent.name"
            :desc="agent.description"
            :dot="agent.id === 'default'"
            clickable
            fade-actions
            @click="openAgentModal(agent)"
          >
            <template #icon>
              <Image v-if="agent.avatar" class="avatar" :src="agent.avatar" alt="" />
              <div v-else class="avatar avatar--ph"><Robot /></div>
            </template>
            <template #actions>
              <Button size="sm" variant="text" class="action-btn" @click="openAgentModal(agent)" title="编辑">
                <template #icon><Pencil /></template>
              </Button>
            </template>
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup v-if="customAgents.length" label="自定义">
          <SettingsRow
            v-for="agent in customAgents"
            :key="agent.id"
            :name="agent.name"
            :desc="agent.description"
            clickable
            fade-actions
            @click="openAgentModal(agent)"
          >
            <template #icon>
              <Image v-if="agent.avatar" class="avatar" :src="agent.avatar" alt="" />
              <div v-else class="avatar avatar--ph"><Robot /></div>
            </template>
            <template #actions>
              <Button size="sm" variant="text" class="action-btn" @click="openAgentModal(agent)" title="编辑">
                <template #icon><Pencil /></template>
              </Button>
              <Button size="sm" variant="text" class="action-btn delete-btn" @click="handleDelete(agent.id)" title="删除">
                <template #icon><Trash /></template>
              </Button>
            </template>
          </SettingsRow>
        </SettingsGroup>

        <template #empty>
          <div class="empty-icon"><Robot /></div>
          <div class="empty-title">{{ query ? '没有匹配的智能体' : '尚未创建智能体' }}</div>
          <div class="empty-hint">{{ query ? '试试其他关键词' : '点击"创建智能体"开始配置' }}</div>
        </template>
      </SettingsList>
      </div>
    </template>
  </FormContainer>
</template>

<style scoped>
.avatar {
  width: 32px;
  height: 32px;
  border-radius: 7px;
  object-fit: cover;
  display: block;
}

.avatar--ph {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--bg-hover), var(--bg-tertiary));
  color: var(--text-tertiary);
  border: 1px solid var(--border-subtle);
}

.avatar--ph :deep(svg) { font-size: 15px; }
</style>