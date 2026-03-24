import { indexedDBStorage } from '@renderer/utils'
import { ensureSandboxState, type SandboxState } from '@renderer/services/sandbox'

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
    const apps = ref<SavedAppRecord[]>([])
    const isAfterRestore = restorePromise

    const normalizedApps = computed(() =>
      apps.value
        .map((app) => ({
          ...app,
          canvas: ensureSandboxState(app.canvas)
        }))
        .sort((a, b) => b.updatedAt - a.updatedAt)
    )

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
        canvas: ensureSandboxState(payload.canvas),
        sourceChatId: payload.sourceChatId || null,
        createdAt: now,
        updatedAt: now
      }

      const existingIndex = apps.value.findIndex((item) => item.id === nextRecord.id)
      if (existingIndex >= 0) {
        nextRecord.createdAt = apps.value[existingIndex]?.createdAt || now
        apps.value = apps.value.map((item, index) => (index === existingIndex ? nextRecord : item))
        return nextRecord
      }

      apps.value = [nextRecord, ...apps.value]
      return nextRecord
    }

    const deleteApp = (id: string) => {
      apps.value = apps.value.filter((item) => item.id !== id)
    }

    return {
      apps: normalizedApps,
      getAppById,
      saveApp,
      deleteApp,
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
