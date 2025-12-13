import localforage from 'localforage'
export { cloneDeep, throttle, mapValues, retry } from 'es-toolkit'
export { blobToDataURL, dataURLToBlob } from 'blob-util'
export const copyText = (text: string) => {
  if (text) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        console.log('消息已复制到剪贴板')
      })
      .catch((err) => {
        console.error('复制失败:', err)
      })
  }
}

export const indexedDBStorage = {
  async getItem(key: string): Promise<string | null> {
    const value = await localforage.getItem<string>(key)
    return value ?? null
  },

  async setItem(key: string, value: string): Promise<void> {
    await localforage.setItem(key, value)
  },

  async removeItem(key: string): Promise<void> {
    await localforage.removeItem(key)
  }
}
