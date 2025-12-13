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

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export const saveFilesToUserData = async (
  files: {
    name: string
    buffer: ArrayBuffer
  }[]
) => {
  if (!window.api?.fs || !window.api?.path) {
    throw new Error('Required APIs not available')
  }

  const userDataPath = window.api.getPath('userData')
  const uploadDir = window.api.path.join(userDataPath, 'uploads')

  if (!window.api.fs.existsSync(uploadDir)) {
    window.api.fs.mkdirSync(uploadDir, { recursive: true })
  }

  const results: { name: string; path: string }[] = []

  for (const file of files) {
    const filePath = window.api.path.join(uploadDir, file.name)
    const buffer = Buffer.from(file.buffer)

    window.api.fs.writeFileSync(filePath, buffer)

    results.push({
      ...file,
      path: filePath
    })
  }

  return results
}
