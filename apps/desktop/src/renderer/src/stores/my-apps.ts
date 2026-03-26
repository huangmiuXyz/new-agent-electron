import { indexedDBStorage } from '@renderer/utils'
import { type SandboxState } from '@renderer/services/sandbox'

export interface SavedAppRecord {
  id: string
  name: string
  description: string
  iconEmoji: string
  canvas: SandboxState
  sourceChatId: string | null
  createdAt: number
  updatedAt: number
}

let resolveRestore: () => void
const restorePromise = new Promise<void>((resolve) => {
  resolveRestore = resolve
})

export const useMyAppsStore = defineStore(
  'my-apps',
  () => {
    const appRecords = ref<SavedAppRecord[]>([])
    const isAfterRestore = restorePromise

    const normalizedApps = computed(() => appRecords.value.slice().sort((a, b) => b.updatedAt - a.updatedAt))

    const getAppById = (id: string) => normalizedApps.value.find((item) => item.id === id) || null

    const saveApp = (payload: {
      id?: string
      name: string
      description?: string
      iconEmoji?: string
      canvas: SandboxState
      sourceChatId?: string | null
    }) => {
      const now = Date.now()
      const name = String(payload.name || '').trim()
      if (!name) {
        throw new Error('应用名称不能为空')
      }

      const nextRecord: SavedAppRecord = {
        id: payload.id || nanoid(),
        name,
        description: String(payload.description || '').trim(),
        iconEmoji: String(payload.iconEmoji || '✨').trim() || '✨',
        canvas: payload.canvas,
        sourceChatId: payload.sourceChatId || null,
        createdAt: now,
        updatedAt: now
      }

      const existingIndex = appRecords.value.findIndex((item) => item.id === nextRecord.id)
      if (existingIndex >= 0) {
        nextRecord.createdAt = appRecords.value[existingIndex]?.createdAt || now
        appRecords.value = appRecords.value.map((item, index) => (index === existingIndex ? nextRecord : item))
        return nextRecord
      }

      appRecords.value = [nextRecord, ...appRecords.value]
      return nextRecord
    }

    const deleteApp = (id: string) => {
      appRecords.value = appRecords.value.filter((item) => item.id !== id)
    }

    return {
      apps: normalizedApps,
      appRecords,
      getAppById,
      saveApp,
      deleteApp,
      isAfterRestore
    }
  },
  {
    persist: {
      storage: indexedDBStorage,
      paths: ['appRecords'],
      afterRestore: () => {
        resolveRestore()
      }
    }
  }
)
