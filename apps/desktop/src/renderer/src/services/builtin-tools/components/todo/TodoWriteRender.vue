<script setup lang="ts">
import { extractResultError, extractResultText, truncate } from '../codex/codexUtils'
import CodexSummaryBar from '../codex/CodexSummaryBar.vue'

const props = defineProps<{
  args?: any
  result?: any
  message?: any
  tool_part?: any
}>()

const todos = computed(() => {
  const list = props.args?.todos
  return Array.isArray(list) ? list : []
})

const total = computed(() => todos.value.length)
const pending = computed(() => todos.value.filter((t: any) => t?.status === 'pending').length)
const inProgress = computed(() => todos.value.filter((t: any) => t?.status === 'in_progress').length)
const completed = computed(() => todos.value.filter((t: any) => t?.status === 'completed').length)
const cancelled = computed(() => todos.value.filter((t: any) => t?.status === 'cancelled').length)
const progressPct = computed(() => (total.value > 0 ? Math.round((completed.value / total.value) * 100) : 0))
const errorMsg = computed(() => extractResultError(props.result))
const hasError = computed(() => !!errorMsg.value)
const resultText = computed(() => extractResultText(props.result))

const statusIcon: Record<string, string> = {
  pending: '◻',
  in_progress: '▶',
  completed: '✓',
  cancelled: '✗'
}

const priorityLabel: Record<string, { label: string; cls: string }> = {
  high: { label: '高', cls: 'priority-high' },
  medium: { label: '中', cls: 'priority-medium' },
  low: { label: '低', cls: 'priority-low' }
}

const statusLabel: Record<string, string> = {
  pending: '未开始',
  in_progress: '进行中',
  completed: '已完成',
  cancelled: '已取消'
}
</script>

<template>
  <div class="todo-render">
    <CodexSummaryBar text="任务清单" :message="message" />

    <div v-if="hasError" class="error-box">{{ truncate(errorMsg, 1000) }}</div>

    <template v-else-if="todos.length > 0">
      <div class="todo-progress">
        <div class="progress-stats">
          <span class="stat-total">共 {{ total }} 项</span>
          <span v-if="inProgress > 0" class="stat-progress">{{ inProgress }} 进行中</span>
          <span v-if="completed > 0" class="stat-done">{{ completed }} 已完成</span>
          <span v-if="cancelled > 0" class="stat-cancel">{{ cancelled }} 已取消</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" :style="{ width: progressPct + '%' }" />
        </div>
        <div class="progress-pct">{{ progressPct }}%</div>
      </div>

      <div class="todo-list">
        <div v-for="(item, idx) in todos" :key="idx" class="todo-item" :class="item.status">
          <span class="todo-status-icon" :title="statusLabel[item.status] || item.status">
            {{ statusIcon[item.status] || '◻' }}
          </span>
          <span class="todo-content">{{ item.content }}</span>
          <span
            v-if="item.priority && item.priority !== 'medium'"
            class="todo-priority"
            :class="priorityLabel[item.priority]?.cls || ''"
          >
            {{ priorityLabel[item.priority]?.label || item.priority }}
          </span>
        </div>
      </div>
    </template>

    <div v-else-if="resultText" class="raw-output">{{ truncate(resultText, 2000) }}</div>

    <div v-else class="empty-hint">暂无任务</div>
  </div>
</template>

<style scoped>
.todo-render {
  display: flex;
  flex-direction: column;
}

.error-box {
  padding: 6px 8px;
  color: var(--color-error);
  font-size: 11px;
  background: rgba(var(--color-error-rgb, 239, 68, 68), 0.06);
}

.todo-progress {
  padding: 8px 10px 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-stats {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 10px;
  color: var(--text-secondary);
  flex: 1;
}

.progress-stats span {
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--bg-hover);
}

.stat-progress {
  color: var(--color-warning);
}

.stat-done {
  color: var(--color-success);
}

.stat-cancel {
  color: var(--text-tertiary);
}

.progress-bar-bg {
  flex: none;
  width: 80px;
  height: 4px;
  border-radius: 2px;
  background: var(--bg-hover);
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--color-success);
  transition: width 0.3s ease;
}

.progress-pct {
  flex: none;
  font-size: 10px;
  font-weight: 600;
  color: var(--color-success);
  min-width: 28px;
  text-align: right;
}

.todo-list {
  padding: 2px 0 4px;
  display: flex;
  flex-direction: column;
}

.todo-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 3px 10px;
  font-size: 11px;
  line-height: 1.5;
  border-left: 2px solid transparent;
}

.todo-item.in_progress {
  border-left-color: var(--color-warning);
  background: rgba(var(--color-warning-rgb, 245, 158, 11), 0.03);
}

.todo-item.completed {
  border-left-color: var(--color-success);
  opacity: 0.65;
}

.todo-item.completed .todo-content {
  text-decoration: line-through;
}

.todo-item.cancelled {
  border-left-color: var(--text-tertiary);
  opacity: 0.45;
}

.todo-item.cancelled .todo-content {
  text-decoration: line-through;
}

.todo-status-icon {
  flex: none;
  font-size: 10px;
  line-height: 1.6;
  width: 14px;
  text-align: center;
}

.todo-item.in_progress .todo-status-icon {
  color: var(--color-warning);
}

.todo-item.completed .todo-status-icon {
  color: var(--color-success);
}

.todo-item.cancelled .todo-status-icon {
  color: var(--text-tertiary);
}

.todo-content {
  flex: 1;
  min-width: 0;
  word-break: break-word;
  color: var(--text-primary);
}

.todo-priority {
  flex: none;
  font-size: 9px;
  font-weight: 600;
  padding: 0 4px;
  border-radius: 3px;
  line-height: 1.6;
}

.priority-high {
  color: var(--color-error);
  background: rgba(var(--color-error-rgb, 239, 68, 68), 0.08);
}

.priority-low {
  color: var(--text-tertiary);
  background: var(--bg-hover);
}

.raw-output {
  padding: 8px;
  font-size: 10px;
  line-height: 1.5;
  color: var(--text-primary);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  white-space: pre-wrap;
  word-break: break-all;
}

.empty-hint {
  padding: 8px;
  font-size: 10px;
  color: var(--text-tertiary);
  text-align: center;
}
</style>
