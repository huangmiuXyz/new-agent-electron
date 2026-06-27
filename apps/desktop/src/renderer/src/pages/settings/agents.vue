<script setup lang="ts">
const { agents } = storeToRefs(useAgentStore())
const agentStore = useAgentStore()

const { Plus, Pencil, Trash, Robot } = useIcon(['Plus', 'Pencil', 'Trash', 'Robot'])
const { openAgentModal, handleDelete } = useAgent()

const builtinAgents = computed(() => agents.value.filter((a) => agentStore.isBuiltinAgent(a.id)))
const customAgents = computed(() => agents.value.filter((a) => !agentStore.isBuiltinAgent(a.id)))
</script>

<template>
  <FormContainer header-title="智能体管理">
    <template #content>
      <div class="agents-container">
        <div class="agents-header">
          <div class="header-title">
            <span class="header-count">{{ agents.length }}</span>
            <span class="header-label">个智能体</span>
          </div>
          <Button size="sm" @click="openAgentModal()">
            <template #icon>
              <Plus />
            </template>
            创建智能体
          </Button>
        </div>

        <!-- 内置分组 -->
        <div v-if="builtinAgents.length" class="section">
          <div class="section-label">内置</div>
          <div class="list-group">
            <div
              v-for="(agent, i) in builtinAgents"
              :key="agent.id"
              class="list-row"
              :class="{ 'list-row--first': i === 0, 'list-row--last': i === builtinAgents.length - 1 }"
              @click="openAgentModal(agent)"
            >
              <div class="avatar-wrap">
                <Image v-if="agent.avatar" class="avatar" :src="agent.avatar" alt="" />
                <div v-else class="avatar avatar--placeholder">
                  <Robot />
                </div>
                <span v-if="agent.id === 'default'" class="default-dot" />
              </div>
              <div class="info">
                <span class="name">{{ agent.name }}</span>
                <span v-if="agent.description" class="desc">{{ agent.description }}</span>
              </div>
              <div class="actions" @click.stop>
                <Button size="sm" variant="text" class="action-btn" @click="openAgentModal(agent)" title="编辑">
                  <template #icon><Pencil /></template>
                </Button>
              </div>
            </div>
          </div>
        </div>

        <!-- 自定义分组 -->
        <div v-if="customAgents.length" class="section">
          <div class="section-label">自定义</div>
          <div class="list-group">
            <div
              v-for="(agent, i) in customAgents"
              :key="agent.id"
              class="list-row"
              :class="{ 'list-row--first': i === 0, 'list-row--last': i === customAgents.length - 1 }"
              @click="openAgentModal(agent)"
            >
              <div class="avatar-wrap">
                <Image v-if="agent.avatar" class="avatar" :src="agent.avatar" alt="" />
                <div v-else class="avatar avatar--placeholder">
                  <Robot />
                </div>
              </div>
              <div class="info">
                <span class="name">{{ agent.name }}</span>
                <span v-if="agent.description" class="desc">{{ agent.description }}</span>
              </div>
              <div class="actions" @click.stop>
                <Button size="sm" variant="text" class="action-btn" @click="openAgentModal(agent)" title="编辑">
                  <template #icon><Pencil /></template>
                </Button>
                <Button size="sm" variant="text" class="action-btn delete-btn" @click="handleDelete(agent.id)" title="删除">
                  <template #icon><Trash /></template>
                </Button>
              </div>
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-if="agents.length === 0" class="empty-state">
          <div class="empty-icon"><Robot /></div>
          <div class="empty-title">尚未创建智能体</div>
          <div class="empty-hint">点击"创建智能体"开始配置</div>
        </div>
      </div>
    </template>
  </FormContainer>
</template>

<style scoped>
.agents-container {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 2px 2px 24px;
}

/* ===== 顶部 ===== */
.agents-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-title {
  display: flex;
  align-items: baseline;
  gap: 4px;
  padding-left: 2px;
}

.header-count {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.header-label {
  font-size: 13px;
  color: var(--text-tertiary);
  font-weight: 400;
}

/* ===== 分组 ===== */
.section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding-left: 4px;
}

/* ===== Apple Settings list-group 圆角容器 ===== */
.list-group {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  overflow: hidden;
}

/* ===== 单行 ===== */
.list-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 12px;
  cursor: pointer;
  position: relative;
  transition: background-color 0.18s var(--motion-ease-standard);
}

.list-row:not(.list-row--last)::after {
  content: '';
  position: absolute;
  left: 56px;
  right: 0;
  bottom: 0;
  height: 1px;
  background: var(--border-subtle);
}

.list-row:active {
  background: var(--bg-hover);
}

.avatar-wrap {
  flex-shrink: 0;
  position: relative;
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 7px;
  object-fit: cover;
  display: block;
}

.avatar--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--bg-hover), var(--bg-tertiary));
  color: var(--text-tertiary);
  border: 1px solid var(--border-subtle);
}

.avatar--placeholder :deep(svg) { font-size: 15px; }

.default-dot {
  position: absolute;
  right: -1px;
  bottom: -1px;
  width: 8px;
  height: 8px;
  background: var(--color-primary);
  border: 2px solid var(--bg-card);
  border-radius: 9999px;
  box-sizing: content-box;
}

.info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1px;
  flex: 1;
  min-width: 0;
}

.name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.31;
  letter-spacing: -0.008em;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.desc {
  font-size: 11px;
  font-weight: 400;
  color: var(--text-secondary);
  line-height: 1.36;
  letter-spacing: -0.003em;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.actions {
  display: flex;
  align-items: center;
  gap: 0;
  flex-shrink: 0;
  opacity: 0.3;
  transition: opacity 0.2s var(--motion-ease-standard);
}

.list-row:hover .actions { opacity: 1; }

.action-btn {
  color: var(--text-tertiary) !important;
  border-radius: 6px !important;
  transition: color 0.15s var(--motion-ease-standard),
    background-color 0.15s var(--motion-ease-standard),
    transform 0.1s var(--motion-ease-standard) !important;
}

.action-btn:hover {
  color: var(--text-primary) !important;
  background: var(--bg-hover) !important;
}

.action-btn:active { transform: scale(0.9); }
.delete-btn:hover { color: var(--color-danger) !important; }

/* ===== 空状态 ===== */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 56px 24px;
  background: var(--bg-tertiary);
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
}

.empty-icon {
  color: var(--text-tertiary);
  opacity: 0.3;
}

.empty-icon :deep(svg) { font-size: 36px; }

.empty-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  letter-spacing: -0.01em;
}

.empty-hint {
  font-size: 12px;
  color: var(--text-tertiary);
  font-weight: 400;
}
</style>