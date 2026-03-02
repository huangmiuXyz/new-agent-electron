import { computed, onUnmounted, ref, watch } from 'vue'
import { useDownloadStore } from '@renderer/stores/downloads'

export interface DownloadProgress {
  total: number
  downloaded: number
  percent: number
}

export interface UseDownloadOptions {
  url: string
  destPath: string
  id: string
  fileName?: string
  pluginName?: string
  onSuccess?: () => void
  onError?: (error: string) => void
  onAborted?: (state: 'paused' | 'canceled' | 'aborted') => void
  onProgress?: (progress: DownloadProgress) => void
}

export function useDownload(pluginName?: string) {
  const downloadStore = useDownloadStore()
  const currentTaskId = ref<string | null>(null)
  let stopProgressWatch: (() => void) | null = null

  const stopProgressCallback = () => {
    if (stopProgressWatch) {
      stopProgressWatch()
      stopProgressWatch = null
    }
  }

  const task = computed(() => {
    if (!currentTaskId.value) return null
    return downloadStore.getTaskById(currentTaskId.value) || null
  })

  const isDownloading = computed(() => task.value?.status === 'downloading')
  const isPaused = computed(() => task.value?.status === 'paused')
  const progress = computed(() => task.value?.progress || null)

  const startDownload = async (options: UseDownloadOptions) => {
    currentTaskId.value = options.id

    stopProgressCallback()
    if (options.onProgress) {
      stopProgressWatch = watch(
        () => downloadStore.getTaskById(options.id)?.progress,
        (newProgress) => {
          if (newProgress) {
            options.onProgress?.(newProgress)
          }
        },
        { deep: true, immediate: true }
      )
    }

    const result = await downloadStore.startDownload({
      id: options.id,
      url: options.url,
      destPath: options.destPath,
      fileName: options.fileName,
      pluginName: options.pluginName || pluginName
    })

    if (result.ok) {
      options.onSuccess?.()
      return
    }

    if (result.aborted) {
      const state = downloadStore.getTaskById(options.id)?.status
      if (state === 'paused' || state === 'canceled') {
        options.onAborted?.(state)
      } else {
        options.onAborted?.('aborted')
      }
      return
    }

    if (!result.aborted) {
      options.onError?.(result.error || '下载失败')
    }
  }

  const pauseDownload = async (id: string) => {
    if (currentTaskId.value !== id) {
      currentTaskId.value = id
    }
    await downloadStore.pauseDownload(id)
  }

  const cancelDownload = async (id: string) => {
    if (currentTaskId.value !== id) {
      currentTaskId.value = id
    }
    await downloadStore.cancelDownload(id)
  }

  onUnmounted(() => {
    stopProgressCallback()
  })

  return {
    isDownloading,
    isPaused,
    progress,
    startDownload,
    pauseDownload,
    cancelDownload,
    task,
    tasks: computed(() => downloadStore.sortedTasks),
    retryDownload: downloadStore.retryDownload,
    removeTask: downloadStore.removeTask,
    resumeDownload: downloadStore.resumeDownload
  }
}

export type UseDownloadReturn = ReturnType<typeof useDownload>
