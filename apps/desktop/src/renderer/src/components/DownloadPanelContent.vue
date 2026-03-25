<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DownloadTask } from '@renderer/stores/downloads'
import { useDownloadStore } from '@renderer/stores/downloads'
import { useModal } from '@renderer/composables/useModal'
import { useIcon } from '../composables/useIcon'
import DownloadProgress from './DownloadProgress.vue'

const downloadStore = useDownloadStore()
const { confirm, remove } = useModal()

const { Trash, Refresh, Delete, Folder, Download } = useIcon([
  'Trash',
  'Refresh',
  'Delete',
  'Folder',
  'Download'
])

const sortedTasks = computed(() => downloadStore.sortedTasks)
const activeStatus = ref<'all' | DownloadTask['status']>('all')

const statusTabItems = computed(() => {
  const counts = {
    all: sortedTasks.value.length,
    pending: 0,
    downloading: 0,
    paused: 0,
    completed: 0,
    error: 0,
    canceled: 0
  } as Record<'all' | DownloadTask['status'], number>

  sortedTasks.value.forEach((task) => {
    counts[task.status] += 1
  })

  return [
    { id: 'all', name: `全部 ${counts.all}` },
    { id: 'pending', name: `等待中 ${counts.pending}` },
    { id: 'downloading', name: `下载中 ${counts.downloading}` },
    { id: 'paused', name: `已暂停 ${counts.paused}` },
    { id: 'error', name: `失败 ${counts.error}` },
    { id: 'completed', name: `已完成 ${counts.completed}` },
    { id: 'canceled', name: `已取消 ${counts.canceled}` }
  ]
})

const filteredTasks = computed(() => {
  if (activeStatus.value === 'all') return sortedTasks.value
  return sortedTasks.value.filter((task) => task.status === activeStatus.value)
})

const getStatusText = (status: DownloadTask['status']) => {
  switch (status) {
    case 'pending':
      return '等待中'
    case 'downloading':
      return '下载中'
    case 'paused':
      return '已暂停'
    case 'completed':
      return '已完成'
    case 'error':
      return '失败'
    case 'canceled':
      return '已取消'
    default:
      return status
  }
}

const getStatusClass = (status: DownloadTask['status']) => {
  if (status === 'completed') return 'ok'
  if (status === 'error') return 'error'
  if (status === 'downloading') return 'active'
  if (status === 'paused') return 'paused'
  return 'idle'
}

const askCompletedTaskDeleteMode = async (): Promise<'task-only' | 'task-and-file' | 'cancel'> => {
  return await new Promise((resolve) => {
    let settled = false
    const settle = (result: 'task-only' | 'task-and-file' | 'cancel') => {
      if (settled) return
      settled = true
      resolve(result)
    }

    void confirm({
      title: '删除下载任务',
      content: '是否同时删除本地文件？',
      confirmText: '任务和文件',
      cancelText: '仅任务',
      onOk: () => {
        remove()
        settle('task-and-file')
      },
      onCancel: () => {
        remove()
        settle('task-only')
      },
      onClose: () => {
        remove()
        settle('cancel')
      }
    })
  })
}

const handleRemoveTask = async (task: DownloadTask) => {
  if (task.status !== 'completed' && task.status !== 'canceled') return

  if (task.status === 'completed') {
    const mode = await askCompletedTaskDeleteMode()
    if (mode === 'cancel') return
    await downloadStore.removeTask(task.id, {
      removeLocalFile: mode === 'task-and-file'
    })
    return
  }

  await downloadStore.removeTask(task.id)
}

const openDownloadDirectory = async (task: DownloadTask) => {
  if (!window.api?.shell?.openPath || !window.api?.path?.dirname) return
  const dirPath = window.api.path.dirname(task.destPath)
  await window.api.shell.openPath(dirPath)
}
</script>

<template>
  <div class="download-panel-content">
    <div class="panel-tools">
      <button
        v-if="downloadStore.hasTasks"
        class="action-btn"
        title="清理已完成/已取消"
        @click="downloadStore.clearCompleted"
      >
        <component :is="Trash" />
      </button>
    </div>

    <div v-if="sortedTasks.length > 0" class="status-tabs">
      <Tabs v-model="activeStatus" :items="statusTabItems" size="sm" />
    </div>

    <div v-if="sortedTasks.length === 0" class="empty-state">
      <component :is="Download" class="empty-icon" />
      <p>暂无下载任务</p>
    </div>

    <div v-else-if="filteredTasks.length === 0" class="empty-state filtered-empty">
      <p>当前状态下暂无任务</p>
    </div>

    <TransitionGroup v-else name="list" tag="div" class="download-list">
      <div v-for="task in filteredTasks" :key="task.id" class="download-item">
        <div class="item-header">
          <div class="name-row">
            <span class="item-name" :title="task.fileName">{{ task.fileName }}</span>
            <span class="status-chip" :class="getStatusClass(task.status)">
              {{ getStatusText(task.status) }}
            </span>
          </div>
        </div>

        <div class="item-path" :title="task.destPath">{{ task.destPath }}</div>

        <div
          v-if="task.status === 'downloading' || task.status === 'paused'"
          class="progress-wrap"
        >
          <DownloadProgress
            :progress="task.progress"
            :is-downloading="task.status === 'downloading'"
            :is-paused="task.status === 'paused'"
            @pause="downloadStore.pauseDownload(task.id)"
            @resume="downloadStore.resumeDownload(task.id)"
            @cancel="downloadStore.cancelDownload(task.id)"
            @open-directory="openDownloadDirectory(task)"
          />
        </div>

        <div v-if="task.status === 'error' && task.error" class="error-text">
          {{ task.error }}
        </div>

        <div class="item-actions">
          <button
            v-if="task.status !== 'downloading' && task.status !== 'paused'"
            class="item-btn"
            title="打开下载目录"
            @click="openDownloadDirectory(task)"
          >
            <component :is="Folder" />
          </button>

          <button
            v-if="task.status === 'error' || task.status === 'canceled'"
            class="item-btn primary"
            title="重试"
            @click="downloadStore.retryDownload(task.id)"
          >
            <component :is="Refresh" />
          </button>

          <button
            v-if="task.status === 'completed' || task.status === 'canceled'"
            class="item-btn"
            title="移除任务"
            @click="handleRemoveTask(task)"
          >
            <component :is="Delete" />
          </button>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.download-panel-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.panel-tools {
  display: flex;
  justify-content: flex-end;
}

.status-tabs {
  margin-bottom: 2px;
}

.empty-state {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  gap: 12px;
}

.filtered-empty {
  min-height: 120px;
}

.empty-icon {
  width: 48px;
  height: 48px;
  opacity: 0.5;
}

.download-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.download-item {
  padding: 12px;
  border-radius: 8px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.item-header,
.name-row,
.item-actions {
  display: flex;
  align-items: center;
}

.name-row {
  gap: 8px;
  min-width: 0;
}

.item-name,
.item-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-name {
  flex: 1;
  color: var(--text-primary);
  font-weight: 600;
}

.item-path {
  font-size: 12px;
  color: var(--text-secondary);
}

.status-chip {
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 11px;
  white-space: nowrap;
}

.status-chip.ok {
  background: rgba(var(--color-success-rgb), 0.12);
  color: var(--color-success);
}

.status-chip.error {
  background: rgba(var(--color-danger-rgb), 0.12);
  color: var(--color-danger);
}

.status-chip.active {
  background: rgba(var(--color-info-rgb), 0.12);
  color: var(--color-info);
}

.status-chip.paused {
  background: rgba(var(--color-warning-rgb), 0.12);
  color: var(--color-warning);
}

.status-chip.idle {
  background: var(--bg-hover);
  color: var(--text-secondary);
}

.item-actions {
  justify-content: flex-end;
  gap: 8px;
}

.item-btn,
.action-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.item-btn:hover,
.action-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.item-btn.primary {
  color: var(--color-info);
}

.error-text {
  font-size: 12px;
  color: var(--color-danger);
  line-height: 1.5;
  word-break: break-all;
}

.list-enter-active,
.list-leave-active,
.list-move {
  transition: all 0.25s ease;
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
