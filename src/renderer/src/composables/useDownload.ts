import { ref, onUnmounted } from 'vue'

export interface DownloadProgress {
    total: number
    downloaded: number
    percent: number
}

export interface UseDownloadOptions {
    url: string
    destPath: string
    id: string
    onSuccess?: () => void
    onError?: (error: string) => void
    onProgress?: (progress: DownloadProgress) => void
}

export function useDownload() {
    const isDownloading = ref(false)
    const isPaused = ref(false)
    const progress = ref<DownloadProgress | null>(null)
    let unlisten: (() => void) | null = null

    const stopProgressListening = () => {
        if (unlisten) {
            unlisten()
            unlisten = null
        }
    }

    const startDownload = async (options: UseDownloadOptions) => {
        if (isDownloading.value && !isPaused.value) return

        const offset = progress.value?.downloaded || 0
        isDownloading.value = true
        isPaused.value = false

        // 开始监听进度
        stopProgressListening()
        if (window.api?.net?.onDownloadProgress) {
            unlisten = window.api.net.onDownloadProgress(options.id, (p: DownloadProgress) => {
                progress.value = p
                options.onProgress?.(p)
            })
        }

        try {
            const result = await window.api.net.download({
                url: options.url,
                destPath: options.destPath,
                id: options.id,
                offset
            })

            if (result.ok) {
                isDownloading.value = false
                isPaused.value = false
                progress.value = null
                options.onSuccess?.()
            } else {
                throw new Error(result.error)
            }
        } catch (err: any) {
            if (err.name !== 'AbortError') {
                isDownloading.value = false
                options.onError?.(err.message || String(err))
            }
        } finally {
            stopProgressListening()
        }
    }

    const pauseDownload = async (id: string) => {
        if (window.api?.net?.cancelDownload) {
            await window.api.net.cancelDownload(id)
            isDownloading.value = false
            isPaused.value = true
            stopProgressListening()
        }
    }

    const cancelDownload = async (id: string) => {
        if (window.api?.net?.cancelDownload) {
            await window.api.net.cancelDownload(id)
            isDownloading.value = false
            isPaused.value = false
            progress.value = null
            stopProgressListening()
        }
    }

    onUnmounted(() => {
        stopProgressListening()
    })

    return {
        isDownloading,
        isPaused,
        progress,
        startDownload,
        pauseDownload,
        cancelDownload
    }
}
