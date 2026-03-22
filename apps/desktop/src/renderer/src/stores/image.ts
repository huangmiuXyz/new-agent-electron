import { defineStore } from 'pinia'
import { ref } from 'vue'
import { indexedDBStorage } from '@renderer/utils'

export interface ImageBatch {
  id: number
  prompt: string
  size?: string
  n: number
  model: string
  modelName?: string
  images: (string | { loading: boolean; id: number })[]
  taskId?: string
  providerId?: string
  status?: 'pending' | 'submitting' | 'processing' | 'completed' | 'failed'
  error?: string
  seed?: number
  params?: any
  referenceImages?: string[]
  // 媒体类型：image 或 video
  mediaType?: 'image' | 'video'
  // 视频特有字段
  duration?: number
  resolution?: `${number}x${number}`
}

let resolveRestore: () => void
const restorePromise = new Promise<void>((resolve) => {
  resolveRestore = resolve
})

export const useImageStore = defineStore(
  'image',
  () => {
    const generatedBatches = ref<ImageBatch[]>([])

    const addBatch = (batch: ImageBatch) => {
      generatedBatches.value = [...generatedBatches.value, batch]
    }

    const updateBatch = (batchId: number, updates: Partial<ImageBatch>) => {
      generatedBatches.value = generatedBatches.value.map((batch) =>
        batch.id === batchId ? { ...batch, ...updates } : batch
      )
    }

    const removeBatch = (batchId: number) => {
      generatedBatches.value = generatedBatches.value.filter((b) => b.id !== batchId)
    }

    const clearBatches = () => {
      generatedBatches.value = []
    }

    const isAfterRestore = restorePromise

    return {
      generatedBatches,
      addBatch,
      updateBatch,
      removeBatch,
      clearBatches,
      isAfterRestore
    }
  },
  {
    persist: {
      storage: indexedDBStorage,
      afterRestore: () => {
        resolveRestore()
      }
    }
  }
)
