import localforage from 'localforage'

export interface KeyValueRepository<T> {
  get(key: string): Promise<T | null>
  set(key: string, value: T): Promise<void>
  remove(key: string): Promise<void>
  keys(): Promise<string[]>
}

export function createLocalForageRepository<T>(): KeyValueRepository<T> {
  return {
    get: (key) => localforage.getItem<T>(key),
    set: async (key, value) => { await localforage.setItem(key, value) },
    remove: (key) => localforage.removeItem(key),
    keys: () => localforage.keys()
  }
}
