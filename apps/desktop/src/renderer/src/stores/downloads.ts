import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { indexedDBStorage } from '@renderer/utils'
import type { DownloadProgress } from '@agent-qi/types'

export type DownloadTaskStatus =
  | 'pending'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'error'
  | 'canceled'

export interface DownloadTask {
  id: string
  url: string
  destPath: string
  fileName: string
  pluginName?: string
  status: DownloadTaskStatus
  progress: DownloadProgress | null
  error?: string
  createdAt: number
  updatedAt: number
}

export interface DownloadStartOptions {
  id: string
  url: string
  destPath: string
  fileName?: string
  pluginName?: string
}

export interface RemoveTaskOptions {
  removeLocalFile?: boolean
}

interface DownloadRunResult {
  ok: boolean
  aborted?: boolean
  error?: string
}

const isAbortMessage = (message?: string) => {
  if (!message) return false
  const normalized = message.toLowerCase()
  return normalized.includes('abort')
}

export const useDownloadStore = defineStore(
  'downloads',
  () => {
    const tasks = ref<DownloadTask[]>([])
    const isPanelOpen = ref(false)
    const progressListeners = new Map<string, () => void>()
    const runTokens = new Map<string, symbol>()

    const getTaskIndex = (id: string) => tasks.value.findIndex((task) => task.id === id)
    const getTaskById = (id: string) => tasks.value.find((task) => task.id === id)

    const updateTask = (id: string, patch: Partial<DownloadTask>) => {
      const index = getTaskIndex(id)
      if (index === -1) return null
      tasks.value[index] = {
        ...tasks.value[index],
        ...patch,
        updatedAt: patch.updatedAt ?? Date.now()
      }
      return tasks.value[index]
    }

    const getLocalFileSize = (destPath: string) => {
      try {
        if (window.api?.fs?.existsSync(destPath)) {
          return window.api.fs.statSync(destPath).size
        }
      } catch {
      }
      return 0
    }

    const syncTaskProgressWithFile = (id: string) => {
      const task = getTaskById(id)
      if (!task) return
      const fileSize = getLocalFileSize(task.destPath)
      if (fileSize <= 0 && !task.progress) return
      const total = Math.max(task.progress?.total || 0, fileSize)
      const percent = total > 0 ? Math.min(100, Math.round((fileSize / total) * 100)) : 0
      updateTask(id, {
        progress: { total, downloaded: fileSize, percent }
      })
    }

    const stopProgressListening = (id: string) => {
      const unlisten = progressListeners.get(id)
      if (unlisten) {
        unlisten()
        progressListeners.delete(id)
      }
    }

    const startProgressListening = (id: string) => {
      stopProgressListening(id)
      if (!window.api?.net?.onDownloadProgress) return
      const unlisten = window.api.net.onDownloadProgress(id, (progress: DownloadProgress) => {
        const task = getTaskById(id)
        if (!task || task.status !== 'downloading') return
        updateTask(id, { progress })
      })
      progressListeners.set(id, unlisten)
    }

    const ensureDownloadDirectory = (destPath: string) => {
      if (!window.api?.fs || !window.api?.path) return
      const destDir = window.api.path.dirname(destPath)
      if (!window.api.fs.existsSync(destDir)) {
        window.api.fs.mkdirSync(destDir, { recursive: true })
      }
    }

    const getResumeOffset = (task: DownloadTask) => {
      const canResumeFromBreakpoint = task.status === 'paused' || task.status === 'error'
      if (!canResumeFromBreakpoint) {
        return 0
      }
      const fileSize = getLocalFileSize(task.destPath)
      return Math.max(task.progress?.downloaded || 0, fileSize)
    }

    const enqueueTask = (options: DownloadStartOptions) => {
      const now = Date.now()
      const fileName =
        options.fileName || window.api?.path?.basename(options.destPath) || options.destPath
      const existing = getTaskById(options.id)
      if (existing) {
        updateTask(options.id, {
          url: options.url,
          destPath: options.destPath,
          fileName,
          pluginName: options.pluginName ?? existing.pluginName
        })
        return getTaskById(options.id)!
      }

      const task: DownloadTask = {
        id: options.id,
        url: options.url,
        destPath: options.destPath,
        fileName,
        pluginName: options.pluginName,
        status: 'pending',
        progress: null,
        createdAt: now,
        updatedAt: now
      }
      tasks.value.unshift(task)
      syncTaskProgressWithFile(task.id)
      return task
    }

    const startDownload = async (
      taskOrOptions: string | DownloadStartOptions
    ): Promise<DownloadRunResult> => {
      const task =
        typeof taskOrOptions === 'string' ? getTaskById(taskOrOptions) : enqueueTask(taskOrOptions)
      if (!task) {
        return { ok: false, error: '下载任务不存在' }
      }

      const token = Symbol(task.id)
      runTokens.set(task.id, token)

      const offset = getResumeOffset(task)
      const currentTotal = task.progress?.total || 0
      const startTotal = Math.max(currentTotal, offset)
      const startProgress =
        offset > 0
          ? {
            total: startTotal,
            downloaded: offset,
            percent: startTotal > 0 ? Math.min(100, Math.round((offset / startTotal) * 100)) : 0
          }
          : null

      updateTask(task.id, {
        status: 'downloading',
        error: undefined,
        progress: startProgress || null
      })

      ensureDownloadDirectory(task.destPath)
      startProgressListening(task.id)

      try {
        const result = await window.api.net.download({
          url: task.url,
          destPath: task.destPath,
          id: task.id,
          offset
        })

        if (runTokens.get(task.id) !== token) {
          return { ok: false, aborted: true }
        }

        if (result?.ok) {
          const latestTask = getTaskById(task.id)
          const fileSize = getLocalFileSize(task.destPath)
          const total = Math.max(latestTask?.progress?.total || 0, fileSize)
          updateTask(task.id, {
            status: 'completed',
            error: undefined,
            progress: {
              total,
              downloaded: total,
              percent: 100
            }
          })
          return { ok: true }
        }

        const message = result?.error || '下载失败'
        const aborted = Boolean(result?.aborted) || isAbortMessage(message)
        const current = getTaskById(task.id)

        if (aborted && (current?.status === 'paused' || current?.status === 'canceled')) {
          return { ok: false, aborted: true }
        }

        if (aborted) {
          updateTask(task.id, { status: 'paused' })
          syncTaskProgressWithFile(task.id)
          return { ok: false, aborted: true }
        }

        updateTask(task.id, { status: 'error', error: message })
        return { ok: false, error: message }
      } catch (error) {
        if (runTokens.get(task.id) !== token) {
          return { ok: false, aborted: true }
        }

        const message = error instanceof Error ? error.message : String(error)
        const current = getTaskById(task.id)
        if (isAbortMessage(message) && (current?.status === 'paused' || current?.status === 'canceled')) {
          return { ok: false, aborted: true }
        }

        if (isAbortMessage(message)) {
          updateTask(task.id, { status: 'paused' })
          syncTaskProgressWithFile(task.id)
          return { ok: false, aborted: true }
        }

        updateTask(task.id, { status: 'error', error: message })
        return { ok: false, error: message }
      } finally {
        if (runTokens.get(task.id) === token) {
          runTokens.delete(task.id)
        }
        stopProgressListening(task.id)
      }
    }

    const pauseDownload = async (id: string) => {
      const task = getTaskById(id)
      if (!task) return

      updateTask(id, { status: 'paused', error: undefined })
      runTokens.delete(id)

      try {
        await window.api?.net?.cancelDownload(id)
      } finally {
        stopProgressListening(id)
        syncTaskProgressWithFile(id)
      }
    }

    const cancelDownload = async (id: string) => {
      const task = getTaskById(id)
      if (!task) return

      updateTask(id, { status: 'canceled', error: undefined, progress: null })
      runTokens.delete(id)

      try {
        await window.api?.net?.cancelDownload(id)
      } finally {
        stopProgressListening(id)
        try {
          if (window.api?.fs?.existsSync(task.destPath)) {
            window.api.fs.unlinkSync(task.destPath)
          }
        } catch {
        }
        updateTask(id, { progress: null })
      }
    }

    const resumeDownload = async (id: string) => {
      return await startDownload(id)
    }

    const retryDownload = async (id: string) => {
      const task = getTaskById(id)
      if (!task) {
        return { ok: false, error: '下载任务不存在' }
      }
      if (task.status !== 'canceled') {
        updateTask(id, { status: 'paused', error: undefined })
      }
      return await startDownload(id)
    }

    const removeTask = async (id: string, options: RemoveTaskOptions = {}) => {
      const task = getTaskById(id)
      if (!task) return
      if (task.status !== 'completed' && task.status !== 'canceled') return
      stopProgressListening(id)
      runTokens.delete(id)

      if (options.removeLocalFile && task.status === 'completed') {
        try {
          if (window.api?.fs?.existsSync(task.destPath)) {
            window.api.fs.unlinkSync(task.destPath)
          }
        } catch {
        }
      }

      const index = getTaskIndex(id)
      if (index !== -1) {
        tasks.value.splice(index, 1)
      }
    }

    const clearCompleted = async () => {
      const removable = tasks.value
        .filter((task) => task.status === 'completed' || task.status === 'canceled')
        .map((task) => task.id)
      for (const id of removable) {
        await removeTask(id)
      }
    }

    const reconcileTasksAfterRestore = () => {
      tasks.value = tasks.value.map((task) => {
        const fileName = task.fileName || window.api?.path?.basename(task.destPath) || task.destPath
        const status: DownloadTaskStatus =
          task.status === 'downloading' || task.status === 'pending' ? 'paused' : task.status
        return {
          ...task,
          fileName,
          status
        }
      })

      tasks.value.forEach((task) => {
        syncTaskProgressWithFile(task.id)
      })
    }

    const sortedTasks = computed(() =>
      [...tasks.value].sort((a, b) => b.updatedAt - a.updatedAt)
    )

    const downloadingCount = computed(
      () => tasks.value.filter((task) => task.status === 'downloading').length
    )

    const unfinishedCount = computed(
      () =>
        tasks.value.filter((task) =>
          task.status === 'pending' ||
          task.status === 'downloading' ||
          task.status === 'paused' ||
          task.status === 'error'
        ).length
    )

    const hasTasks = computed(() => tasks.value.length > 0)

    const openPanel = () => {
      isPanelOpen.value = true
    }

    const closePanel = () => {
      isPanelOpen.value = false
    }

    const togglePanel = () => {
      isPanelOpen.value = !isPanelOpen.value
    }

    return {
      tasks,
      sortedTasks,
      hasTasks,
      isPanelOpen,
      downloadingCount,
      unfinishedCount,
      getTaskById,
      enqueueTask,
      startDownload,
      pauseDownload,
      cancelDownload,
      resumeDownload,
      retryDownload,
      removeTask,
      clearCompleted,
      reconcileTasksAfterRestore,
      openPanel,
      closePanel,
      togglePanel
    }
  },
  {
    persist: {
      storage: indexedDBStorage,
      paths: ['tasks'],
      afterRestore: (ctx?: { store?: unknown }) => {
        ;(ctx?.store as any)?.reconcileTasksAfterRestore?.()
      }
    }
  }
)
