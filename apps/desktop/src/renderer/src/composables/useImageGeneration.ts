import { createRegistry } from '@renderer/services/chatService/registry'
import { useSettingsStore } from '@renderer/stores/settings'
import { ImageBatch, useImageStore } from '@renderer/stores/image'
import { blobToDataURL } from 'blob-util'

const activeProcessingIds = new Set<number>()
const activePolls = new Set<number>()

export interface GenerateImageOptions {
  prompt: string
  model: string
  providerId: string
  size?: string
  n?: number
  seed?: number
  providerOptions?: any
  referenceImages?: string[]
}

export interface GenerateVideoOptions {
  prompt: string
  model: string
  providerId: string
  n?: number
  seed?: number
  duration?: number
  resolution?: string
  providerOptions?: any
  referenceImages?: string[]
}

export function useImageGeneration() {
  const settingsStore = useSettingsStore()
  const imgStore = useImageStore()
  const { generatedBatches } = storeToRefs(imgStore)
  const service = chatService()

  const getProviderInstance = (providerId: string) => {
    const provider = settingsStore.getProviderById(providerId)
    if (!provider) {
      throw new Error('未找到所选模型的提供商')
    }

    const registry = createRegistry({
      apiKey: provider.apiKey || '',
      baseURL: provider.baseUrl,
      name: provider.name
    })
    return {
      instance: registry.getProvider(provider.providerType),
      provider
    }
  }

  const processImages = (batchId: number, rawImages: any[]) => {
    const newImages = rawImages
      .map((img: any) => {
        if (typeof img === 'string') return img
        if (img.base64) {
          return img.base64.startsWith('data:') ? img.base64 : `data:image/png;base64,${img.base64}`
        }
        return img.url || ''
      })
      .filter(Boolean)

    const batch = generatedBatches.value.find((b) => b.id === batchId)
    if (batch) {
      let placeholderIndex = 0
      const updatedImages = batch.images.map((item) => {
        if (typeof item === 'object' && item.loading) {
          return newImages[placeholderIndex++] || item
        }
        return item
      })
      imgStore.updateBatch(batchId, {
        images: updatedImages,
        status: 'completed'
      })
    }
  }

  const processVideos = (batchId: number, rawVideos: any[]) => {
    const newVideos = rawVideos
      .map((video: any) => {
        if (typeof video === 'string') return video
        if (video.url) return video.url
        if (video.base64) {
          return video.base64.startsWith('data:') ? video.base64 : `data:video/mp4;base64,${video.base64}`
        }
        return ''
      })
      .filter(Boolean)

    const batch = generatedBatches.value.find((b) => b.id === batchId)
    if (batch) {
      let placeholderIndex = 0
      const updatedVideos = batch.images.map((item) => {
        if (typeof item === 'object' && item.loading) {
          return newVideos[placeholderIndex++] || item
        }
        return item
      })
      imgStore.updateBatch(batchId, {
        images: updatedVideos,
        status: 'completed'
      })
    }
  }

  const pollAsyncResult = async (batchId: number, taskId: string, providerInstance: any) => {
    if (activePolls.has(batchId)) return
    activePolls.add(batchId)

    const poll = async () => {
      try {
        const exists = generatedBatches.value.some((b) => b.id === batchId)
        if (!exists) {
          activePolls.delete(batchId)
          return
        }

        const result = await providerInstance.asyncResult({ task_id: taskId })
        if (result.images && result.images.length > 0) {
          processImages(batchId, result.images)
          activePolls.delete(batchId)
        } else if (result.status === 'failed') {
          throw new Error(result.error || '生成失败')
        } else {
          setTimeout(poll, 3000)
        }
      } catch (error: any) {
        console.error('异步获取图像失败:', error)
        activePolls.delete(batchId)
        imgStore.updateBatch(batchId, { status: 'failed', error: error.message })
      }
    }

    poll()
  }

  const pollAsyncVideoResult = async (batchId: number, taskId: string, providerInstance: any) => {
    if (activePolls.has(batchId)) return
    activePolls.add(batchId)

    const poll = async () => {
      try {
        const exists = generatedBatches.value.some((b) => b.id === batchId)
        if (!exists) {
          activePolls.delete(batchId)
          return
        }

        const result = await providerInstance.asyncVideoResult?.({ task_id: taskId })
        if (result.videos && result.videos.length > 0) {
          processVideos(batchId, result.videos)
          activePolls.delete(batchId)
        } else if (result.status === 'failed') {
          throw new Error(result.error || '视频生成失败')
        } else {
          setTimeout(poll, 5000)
        }
      } catch (error: any) {
        console.error('异步获取视频失败:', error)
        activePolls.delete(batchId)
        imgStore.updateBatch(batchId, { status: 'failed', error: error.message })
      }
    }

    poll()
  }

  const startGeneration = async (batch: ImageBatch) => {
    if (activeProcessingIds.has(batch.id)) return
    activeProcessingIds.add(batch.id)

    const processedImages = await Promise.all(
      (batch.referenceImages || []).map(async (img) => {
        if (img.startsWith('data:')) {
          return img.split(',')[1]
        }
        if (img.startsWith('blob:')) {
          const response = await fetch(img)
          const blob = await response.blob()
          const base64 = await blobToDataURL(blob)
          return base64.split(',')[1]
        }
        return img
      })
    )

    const prompt = processedImages.length > 0 ? { text: batch.prompt, images: processedImages } : batch.prompt

    try {
      const { instance: providerInstance, provider } = getProviderInstance(batch.providerId!)

      if (providerInstance?.generateImageAsyncTask) {
        const { task_id } = await providerInstance.generateImageAsyncTask({
          model: providerInstance.imageModel(batch.model),
          prompt: batch.prompt,
          size: batch.size as `${number}x${number}`,
          n: batch.n,
          ...batch.params
        })

        imgStore.updateBatch(batch.id, { taskId: task_id, status: 'processing' })
        await pollAsyncResult(batch.id, task_id, providerInstance)
      } else {
        const result = await service.generateImage(prompt, {
          model: batch.model,
          apiKey: provider.apiKey || '',
          baseURL: provider.baseUrl || '',
          provider: provider.id,
          providerType: provider.providerType,
          size: batch.size as `${number}x${number}`,
          n: batch.n,
          seed: batch.seed,
          providerOptions: batch.params?.providerOptions
        })
        if (result.images) {
          processImages(batch.id, result.images)
        }
      }
    } catch (error: any) {
      console.error('图像生成失败:', { error })
      imgStore.updateBatch(batch.id, { status: 'failed', error: error.message })
    } finally {
      activeProcessingIds.delete(batch.id)
    }
  }

  const resumeGeneration = async (batch: ImageBatch) => {
    if (activeProcessingIds.has(batch.id) || batch.status === 'completed') return
    activeProcessingIds.add(batch.id)

    try {
      const { instance: providerInstance } = getProviderInstance(batch.providerId!)
      if (batch.taskId && providerInstance?.asyncResult) {
        await pollAsyncResult(batch.id, batch.taskId, providerInstance)
      }
    } catch (error: any) {
      console.error('恢复图像生成失败:', error)
      imgStore.updateBatch(batch.id, { status: 'failed', error: error.message })
    } finally {
      activeProcessingIds.delete(batch.id)
    }
  }

  const startVideoGeneration = async (batch: ImageBatch) => {
    if (activeProcessingIds.has(batch.id)) return
    activeProcessingIds.add(batch.id)

    try {
      const { instance: providerInstance, provider } = getProviderInstance(batch.providerId!)

      if (providerInstance?.generateVideoAsyncTask) {
        // 处理参考图片
        const processedImages = await Promise.all(
          (batch.referenceImages || []).map(async (img) => {
            if (img.startsWith('data:')) {
              return img
            }
            if (img.startsWith('blob:')) {
              const response = await fetch(img)
              const blob = await response.blob()
              const base64 = await blobToDataURL(blob)
              return base64
            }
            return img
          })
        )

        const { task_id } = await providerInstance.generateVideoAsyncTask!({
          model: batch.model,
          prompt: batch.prompt,
          n: batch.n,
          duration: batch.duration,
          resolution: batch.resolution,
          seed: batch.seed,
          providerOptions: batch.params?.providerOptions,
          files: processedImages
        } as any)

        imgStore.updateBatch(batch.id, { taskId: task_id, status: 'processing' })
        await pollAsyncVideoResult(batch.id, task_id, providerInstance)
      } else {
        const result = await service.generateVideo(batch.prompt, {
          model: batch.model,
          apiKey: provider.apiKey || '',
          baseURL: provider.baseUrl || '',
          provider: provider.id,
          providerType: provider.providerType,
          n: batch.n,
          duration: batch.duration ? Number(batch.duration) : undefined,
          resolution: batch.resolution,
          seed: batch.seed,
          providerOptions: batch.params?.providerOptions
        })

        if (result.videos) {
          processVideos(batch.id, result.videos)
        }
      }
    } catch (error: any) {
      console.error('视频生成失败:', { error })
      imgStore.updateBatch(batch.id, { status: 'failed', error: error.message })
    } finally {
      activeProcessingIds.delete(batch.id)
    }
  }

  const createImageBatch = (options: GenerateImageOptions): ImageBatch => {
    const batchId = Date.now()
    const n = options.n || 1
    const currentPlaceholders = Array(n)
      .fill(null)
      .map((_, i) => ({
        loading: true,
        id: batchId + i
      }))

    return {
      id: batchId,
      prompt: options.prompt,
      size: options.size,
      n: n,
      model: options.model,
      modelName: settingsStore.getModelById(options.providerId, options.model).model?.name,
      images: currentPlaceholders,
      providerId: options.providerId,
      status: 'pending',
      seed: options.seed,
      params: {
        providerOptions: options.providerOptions
      },
      referenceImages: options.referenceImages ? [...options.referenceImages] : undefined,
      mediaType: 'image'
    }
  }

  const createVideoBatch = (options: GenerateVideoOptions): ImageBatch => {
    const batchId = Date.now()
    const n = options.n || 1
    const currentPlaceholders = Array(n)
      .fill(null)
      .map((_, i) => ({
        loading: true,
        id: batchId + i
      }))

    return {
      id: batchId,
      prompt: options.prompt,
      n: n,
      model: options.model,
      modelName: settingsStore.getModelById(options.providerId, options.model).model?.name,
      images: currentPlaceholders,
      providerId: options.providerId,
      status: 'pending',
      seed: options.seed,
      params: {
        providerOptions: options.providerOptions
      },
      mediaType: 'video',
      duration: options.duration ? Number(options.duration) : undefined,
      resolution: options.resolution as `${number}x${number}`,
      referenceImages: options.referenceImages ? [...options.referenceImages] : undefined
    }
  }

  return {
    generatedBatches,
    startGeneration,
    resumeGeneration,
    startVideoGeneration,
    createImageBatch,
    createVideoBatch,
    activeProcessingIds
  }
}
