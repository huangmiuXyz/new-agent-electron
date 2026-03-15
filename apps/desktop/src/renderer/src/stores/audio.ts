import { defineStore } from 'pinia'
import { ref } from 'vue'
import { indexedDBStorage } from '@renderer/utils'

export interface AudioBatch {
  id: string
  messageId?: string
  prompt: string
  model: string
  modelName?: string
  audioData?: string
  audioMediaType?: string
  audioFormat?: string
  providerId?: string
  providerName?: string
  status?: 'pending' | 'processing' | 'completed' | 'failed'
  error?: string
  params?: any
  mediaType?: 'speech' | 'music'
  duration?: number
  items?: AudioBatchItem[]
}

export interface AudioBatchItem {
  id: string
  audioData?: string
  audioMediaType?: string
  audioFormat?: string
  status?: 'pending' | 'processing' | 'completed' | 'failed'
  error?: string
  duration?: number
}

export const useAudioStore = defineStore(
  'audio',
  () => {
    const generatedBatches = ref<AudioBatch[]>([])

    const addBatch = (batch: AudioBatch) => {
      generatedBatches.value = [...generatedBatches.value, batch]
    }

    const updateBatch = (batchId: string, updates: Partial<AudioBatch>) => {
      generatedBatches.value = generatedBatches.value.map((batch) =>
        batch.id === batchId ? { ...batch, ...updates } : batch
      )
    }

    const addBatchItem = (batchId: string, item: AudioBatchItem) => {
      generatedBatches.value = generatedBatches.value.map((batch) =>
        batch.id === batchId
          ? { ...batch, items: [...(batch.items || []), item], status: item.status ?? batch.status }
          : batch
      )
    }

    const updateBatchItem = (batchId: string, itemId: string, updates: Partial<AudioBatchItem>) => {
      generatedBatches.value = generatedBatches.value.map((batch) =>
        batch.id === batchId
          ? {
              ...batch,
              items: (batch.items || []).map((item) =>
                item.id === itemId ? { ...item, ...updates } : item
              )
            }
          : batch
      )
    }

    const removeBatch = (batchId: string) => {
      generatedBatches.value = generatedBatches.value.filter((b) => b.id !== batchId)
    }

    const clearBatches = () => {
      generatedBatches.value = []
    }

    return {
      generatedBatches,
      addBatch,
      updateBatch,
      addBatchItem,
      updateBatchItem,
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
