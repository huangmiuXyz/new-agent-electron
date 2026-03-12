<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DownloadTask } from '@renderer/stores/downloads'
import { useDownloadStore } from '@renderer/stores/downloads'
import { useModal } from '@renderer/composables/useModal'
import { useIcon } from '../composables/useIcon'
import DownloadProgress from './DownloadProgress.vue'
import RightSlidePanel from './RightSlidePanel.vue'

const downloadStore = useDownloadStore()
const { confirm, remove } = useModal()

const { Trash, Download, Refresh, Delete, Folder } = useIcon([
  'Trash',
  'Download',
  'Refresh',
  'Delete',
  'Folder'
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
  <RightSlidePanel
    :visible="downloadStore.isPanelOpen"
    title="下载列表"
    :icon="Download"
    :badge="downloadStore.unfinishedCount"
    width="360px"
    @close="downloadStore.closePanel"
  >
    <template #actions>
      <button
        v-if="downloadStore.hasTasks"
        class="action-btn"
        title="清理已完成/已取消"
        @click="downloadStore.clearCompleted"
      >
        <component :is="Trash" />
      </button>
    </template>

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
          <!-- <span v-if="task.pluginName" class="plugin-tag">{{ task.pluginName }}</span> -->
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

        <div class="error-text" v-if="task.status === 'error' && task.error">
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
  </RightSlidePanel>
</template>

<style scoped>
.status-tabs {
  margin-bottom: 10px;
}

.empty-state {
  height: 100%;
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
  gap: 8px;
}

.download-item {
  padding: 10px;
  border-radius: 8px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.name-row {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.item-name {
  font-size: 12px;
  color: var(--text-primary);
  font-weight: 500;
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-chip {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 999px;
  border: 1px solid transparent;
}

.status-chip.active {
  color: #1677ff;
  background: rgba(22, 119, 255, 0.1);
}

.status-chip.paused {
  color: #ad6800;
  background: rgba(250, 173, 20, 0.15);
}

.status-chip.ok {
  color: #389e0d;
  background: rgba(82, 196, 26, 0.16);
}

.status-chip.error {
  color: #cf1322;
  background: rgba(255, 77, 79, 0.12);
}

.status-chip.idle {
  color: var(--text-secondary);
  background: var(--bg-hover);
}

.plugin-tag {
  color: var(--text-tertiary);
  font-size: 10px;
  white-space: nowrap;
}

.item-path {
  color: var(--text-tertiary);
  font-size: 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.progress-wrap {
  padding: 4px 0;
}

.error-text {
  color: #cf1322;
  font-size: 11px;
  word-break: break-all;
}

.item-actions {
  display: flex;
  gap: 6px;
}

.item-btn {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  background: var(--bg-hover);
  cursor: pointer;
}

.item-btn:hover {
  color: var(--text-primary);
}

.item-btn.primary {
  color: #1677ff;
  background: rgba(22, 119, 255, 0.12);
}

.item-btn.warning {
  color: #ad6800;
  background: rgba(250, 173, 20, 0.14);
}

.item-btn.danger {
  color: #cf1322;
  background: rgba(255, 77, 79, 0.12);
}
</style>
