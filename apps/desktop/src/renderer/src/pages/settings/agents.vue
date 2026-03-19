<script setup lang="ts">
const { agents } = storeToRefs(useAgentStore())

const { Plus, Pencil, Trash, Robot } = useIcon(['Plus', 'Pencil', 'Trash', 'Robot'])
const { openAgentModal, handleDelete } = useAgent()

const getAgentTags = (agent: Agent) => {
  if (agent.id === 'default') {
    return agent.tags?.length ? agent.tags : ['默认']
  }
  return agent.tags || []
}
</script>

<template>
  <FormContainer header-title="智能体管理">
    <template #content>
      <div class="agents-container">
        <div class="agents-header">
          <Button size="sm" @click="openAgentModal()">
            <template #icon>
              <Plus />
            </template>
            创建智能体
          </Button>
        </div>

        <div class="agent-list">
          <div v-for="agent in agents" :key="agent.id" class="agent-card">
            <div class="card-header">
              <div class="agent-avatar-wrap">
                <Image v-if="agent.avatar" class="agent-avatar" :src="agent.avatar" alt="" />
                <div v-else class="agent-avatar agent-avatar--placeholder">
                  <Robot />
                </div>
              </div>
              <div class="agent-info" :class="{ 'agent-info--center': !agent.description }">
                <div class="agent-name-row">
                  <div class="agent-name">{{ agent.name }}</div>
                  <Tags v-if="getAgentTags(agent).length" :tags="getAgentTags(agent)" color="orange" size="sm" />
                </div>
                <div v-if="agent.description" class="agent-description">
                  {{ agent.description }}
                </div>
              </div>
              <div class="agent-actions" @click.stop>
                <Button size="sm" variant="text" @click="openAgentModal(agent)" title="编辑">
                  <template #icon>
                    <Pencil />
                  </template>
                </Button>
                <Button
                  v-if="agent.id !== 'default'"
                  size="sm"
                  variant="text"
                  class="delete-btn"
                  @click="handleDelete(agent.id)"
                  title="删除"
                >
                  <template #icon>
                    <Trash />
                  </template>
                </Button>
              </div>
            </div>
          </div>

          <div v-if="agents.length === 0" class="empty-state">
            尚未创建智能体。点击"创建智能体"开始配置。
          </div>
        </div>
      </div>
    </template>
  </FormContainer>
</template>

<style scoped>
.agents-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.agents-header {
  display: flex;
  justify-content: flex-end;
  align-items: center;
}

.agent-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: stretch;
  gap: 10px;
}

.agent-card {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  padding: 12px 14px;
  box-sizing: border-box;
  height: 88px;
  transition: all 0.2s;
  cursor: pointer;
  overflow: hidden;
}

.agent-card:hover {
  border-color: var(--border-hover);
  background: var(--bg-hover);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  height: 100%;
}

.agent-avatar-wrap {
  flex-shrink: 0;
}

.agent-avatar {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  object-fit: cover;
  display: block;
}

.agent-avatar--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-hover);
  color: var(--text-secondary);
  border: 1px solid var(--border-subtle);
}

.agent-avatar--placeholder :deep(svg) {
  font-size: 18px;
}

.agent-info {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.agent-info--center {
  justify-content: center;
}

.agent-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.25;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.agent-description {
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.agent-actions {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  flex-shrink: 0;
  padding-top: 0;
}

.delete-btn {
  color: var(--text-tertiary);
}

.delete-btn:hover {
  color: var(--color-danger);
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--text-tertiary);
  background: var(--bg-hover);
  border-radius: 8px;
  border: 1px dashed var(--border-subtle);
  font-size: 13px;
}

@media (max-width: 1100px) {
  .agent-list {
    grid-template-columns: 1fr;
  }
}
</style>
