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
}

export const useImageStore = defineStore(
  'image',
  () => {
    const generatedBatches = ref<ImageBatch[]>([])

    const addBatch = (batch: ImageBatch) => {
      generatedBatches.value.push(batch)
    }

    const updateBatch = (batchId: number, updates: Partial<ImageBatch>) => {
      const index = generatedBatches.value.findIndex((b) => b.id === batchId)
      if (index !== -1) {
        generatedBatches.value[index] = { ...generatedBatches.value[index], ...updates }
      }
    }

    const removeBatch = (batchId: number) => {
      generatedBatches.value = generatedBatches.value.filter((b) => b.id !== batchId)
    }

    const clearBatches = () => {
      generatedBatches.value = []
    }

    return {
      generatedBatches,
      addBatch,
      updateBatch,
      removeBatch,
      clearBatches
    }
  },
  {
    persist: {
      storage: indexedDBStorage
    }
  }
)
