import localforage from 'localforage'

const DEBOUNCED_STORAGE_KEYS = new Set(['chats'])
const STORAGE_WRITE_DEBOUNCE_MS = 2000
const storageRestoreGuards = new Map<string, boolean>()
const allowedEmptyStorageWrites = new Map<string, number>()
const pendingStorageWrites = new Map<
  string,
  {
    timer: ReturnType<typeof setTimeout> | null
    value: string
  }
>()

export const setIndexedDBStorageRestoreGuard = (key: string, restoring: boolean) => {
  storageRestoreGuards.set(key, restoring)
}

export const isIndexedDBStorageRestoring = (key: string) => {
  return storageRestoreGuards.get(key) === true
}

export const allowNextIndexedDBEmptyWrite = (key: string) => {
  allowedEmptyStorageWrites.set(key, (allowedEmptyStorageWrites.get(key) || 0) + 1)
}

const writeStorageValue = async (key: string, value: string) => {
  await localforage.setItem(key, value)
}

const consumeAllowedEmptyStorageWrite = (key: string) => {
  const allowedCount = allowedEmptyStorageWrites.get(key) || 0
  if (allowedCount <= 0) return false
  if (allowedCount === 1) {
    allowedEmptyStorageWrites.delete(key)
  } else {
    allowedEmptyStorageWrites.set(key, allowedCount - 1)
  }
  return true
}

const parseStorageValue = (value: unknown) => {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }
  return value
}

const getPersistedChatCount = (value: unknown) => {
  const parsed = parseStorageValue(value) as { chats?: unknown } | null
  return Array.isArray(parsed?.chats) ? parsed.chats.length : 0
}

const isEmptyChatStateWrite = (key: string, value: string) => {
  return key === 'chats' && getPersistedChatCount(value) === 0
}

const shouldBlockEmptyChatStateWrite = async (key: string, value: string) => {
  if (!isEmptyChatStateWrite(key, value)) return false
  if (consumeAllowedEmptyStorageWrite(key)) return false
  const pendingWrite = pendingStorageWrites.get(key)
  if (pendingWrite && getPersistedChatCount(pendingWrite.value) > 0) {
    return true
  }
  const persistedValue = await localforage.getItem(key)
  return getPersistedChatCount(persistedValue) > 0
}

const flushPendingStorageWrite = (key: string) => {
  const pendingWrite = pendingStorageWrites.get(key)
  if (!pendingWrite) return Promise.resolve()
  if (pendingWrite.timer) {
    clearTimeout(pendingWrite.timer)
  }
  pendingStorageWrites.delete(key)
  return writeStorageValue(key, pendingWrite.value)
}

export const flushIndexedDBStorage = async (key?: string) => {
  if (key) {
    await flushPendingStorageWrite(key)
    return
  }
  await Promise.all(
    [...pendingStorageWrites.keys()].map((storageKey) => flushPendingStorageWrite(storageKey))
  )
}

export const indexedDBStorage = {
  async getItem(key: string): Promise<string | null> {
    await flushPendingStorageWrite(key)
    const value = await localforage.getItem<string>(key)
    if (value == null) return null
    if (typeof value === 'string') return value
    return JSON.stringify(value)
  },

  async setItem(key: string, value: string): Promise<void> {
    if (storageRestoreGuards.get(key)) return
    if (await shouldBlockEmptyChatStateWrite(key, value)) {
      console.warn(`[storage] blocked empty "${key}" state from overwriting existing chats`)
      return
    }
    if (!DEBOUNCED_STORAGE_KEYS.has(key)) {
      await writeStorageValue(key, value)
      return
    }
    const pendingWrite = pendingStorageWrites.get(key)
    if (pendingWrite?.timer) {
      clearTimeout(pendingWrite.timer)
    }
    pendingStorageWrites.set(key, {
      value,
      timer: setTimeout(() => {
        void flushPendingStorageWrite(key)
      }, STORAGE_WRITE_DEBOUNCE_MS)
    })
  },

  async removeItem(key: string): Promise<void> {
    const pendingWrite = pendingStorageWrites.get(key)
    if (pendingWrite?.timer) {
      clearTimeout(pendingWrite.timer)
    }
    pendingStorageWrites.delete(key)
    await localforage.removeItem(key)
  }
}

// 页面生命周期相关代码放在最后，不干扰模块初始化
const flushStorageOnPageLifecycleChange = () => {
  void flushIndexedDBStorage()
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushStorageOnPageLifecycleChange)
  window.addEventListener('pagehide', flushStorageOnPageLifecycleChange)
  window.addEventListener('freeze', flushStorageOnPageLifecycleChange)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushStorageOnPageLifecycleChange()
    }
  })

  void import('@capacitor/app')
    .then(({ App }) => {
      void App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) {
          flushStorageOnPageLifecycleChange()
        }
      })
    })
    .catch(() => {})
}
