import { z } from 'zod'
import ImagePage from '../../../pages/image/index.vue'
import { createRegistry } from '@renderer/services/chatService/registry'

export const getMediaBuiltinTools = (): Partial<Tools> => ({
  image_generator: {
    title: 'AI 绘画',
    description: '使用 AI 模型生成图片。可以指定提示词、尺寸、模型等参数。',
    inputSchema: z.object({
      prompt: z.string().describe('生成图片的提示词，建议使用详细的描述。')
    }),
    render: ImagePage,
    execute: async (args: any, options: any) => {
      const { prompt } = args
      const settingsStore = useSettingsStore()
      const imageForm = settingsStore.imageGenerationForm

      if (!imageForm) {
        throw new Error('未配置默认绘画模型，请先在绘画页面选择模型')
      }

      const targetModelId = imageForm.model?.modelId
      const targetProviderId = imageForm.model?.providerId
      const targetSize = imageForm.size || '1024x1024'
      const targetN = imageForm.n || 1
      const targetSeed = imageForm.seed || undefined

      if (!targetModelId || !targetProviderId) {
        throw new Error('未配置默认绘画模型，请先在绘画页面选择模型')
      }

      const provider = settingsStore.getProviderById(targetProviderId)
      if (!provider) {
        throw new Error('未找到所选模型的提供商')
      }

      const metadata = {
        chatId: options.chatId,
        providerId: targetProviderId,
        config: {
          model: targetModelId,
          size: targetSize,
          n: targetN,
          seed: targetSeed,
          providerOptions: imageForm.providerOptions
        }
      }

      try {
        const registry = createRegistry({
          apiKey: provider.apiKey || '',
          baseURL: provider.baseUrl,
          name: provider.name
        })
        const providerInstance = registry.getProvider(provider.providerType)

        if (providerInstance && 'generateImageAsyncTask' in providerInstance) {
          const { task_id } = await providerInstance.generateImageAsyncTask({
            model: (providerInstance as any).imageModel(targetModelId),
            prompt,
            size: targetSize as `${number}x${number}`,
            n: targetN,
            providerOptions: {
              [provider.providerType]: imageForm.providerOptions?.[provider.providerType]
            }
          })

          return {
            metadata: { ...metadata, task_ids: [task_id], images: [] }
          }
        }
        const result = await chatService().generateImage(prompt, {
          model: targetModelId,
          apiKey: provider.apiKey || '',
          baseURL: provider.baseUrl || '',
          provider: provider.id,
          providerType: provider.providerType,
          size: targetSize as `${number}x${number}`,
          n: targetN,
          seed: targetSeed,
          providerOptions: imageForm.providerOptions
        })

        return {
          toolResult: {
            content: [
              { type: 'text', text: '图片生成成功' }
            ]
          },
          metadata: {
            ...metadata,
            images: result.images
              .map((img: any) => {
                if (typeof img === 'string') return img
                if (img.base64)
                  return img.base64.startsWith('data:')
                    ? img.base64
                    : `data:image/png;base64,${img.base64}`
                return img.url || ''
              }) || []
          }
        }
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
          metadata: metadata
        }
      }
    }
  },
  video_generator: {
    title: 'AI 视频',
    description: '使用 AI 模型生成视频。可以指定提示词、时长、分辨率、模型等参数。',
    inputSchema: z.object({
      prompt: z.string().describe('生成视频的提示词，建议使用详细的描述。')
    }),
    render: ImagePage,
    execute: async (args: any, options: any) => {
      const { prompt } = args
      const settingsStore = useSettingsStore()
      const videoForm = settingsStore.videoGenerationForm

      if (!videoForm) {
        throw new Error('未配置默认视频模型，请先在绘画页面切换到视频模式并选择模型')
      }

      const targetModelId = videoForm.model?.modelId
      const targetProviderId = videoForm.model?.providerId
      const targetN = videoForm.n || 1
      const targetSeed = videoForm.seed || undefined
      const targetDuration = (videoForm as any).duration || undefined
      const targetResolution = (videoForm as any).resolution || undefined

      if (!targetModelId || !targetProviderId) {
        throw new Error('未配置默认视频模型，请先在绘画页面切换到视频模式并选择模型')
      }

      const provider = settingsStore.getProviderById(targetProviderId)
      if (!provider) {
        throw new Error('未找到所选模型的提供商')
      }

      const metadata = {
        chatId: options.chatId,
        providerId: targetProviderId,
        config: {
          model: targetModelId,
          n: targetN,
          seed: targetSeed,
          duration: targetDuration,
          resolution: targetResolution,
          providerOptions: videoForm.providerOptions,
          mediaType: 'video'
        }
      }

      try {
        const registry = createRegistry({
          apiKey: provider.apiKey || '',
          baseURL: provider.baseUrl,
          name: provider.name
        })
        const providerInstance = registry.getProvider(provider.providerType)

        if (providerInstance?.generateVideoAsyncTask) {
          const { task_id } = await providerInstance.generateVideoAsyncTask({
            model: targetModelId,
            prompt,
            n: targetN,
            duration: targetDuration ? Number(targetDuration) : undefined,
            resolution: targetResolution,
            seed: targetSeed,
            providerOptions: {
              [provider.providerType]: videoForm.providerOptions?.[provider.providerType]
            }
          })

          return {
            metadata: { ...metadata, task_ids: [task_id], images: [] }
          }
        }

        const result = await chatService().generateVideo(prompt, {
          model: targetModelId,
          apiKey: provider.apiKey || '',
          baseURL: provider.baseUrl || '',
          provider: provider.id,
          providerType: provider.providerType,
          n: targetN,
          duration: targetDuration ? Number(targetDuration) : undefined,
          resolution: targetResolution,
          seed: targetSeed,
          providerOptions: videoForm.providerOptions
        })

        return {
          toolResult: {
            content: [
              { type: 'text', text: '视频生成成功' }
            ]
          },
          metadata: {
            ...metadata,
            images: result.videos
              .map((video: any) => {
                if (typeof video === 'string') return video
                if (video.base64)
                  return video.base64.startsWith('data:')
                    ? video.base64
                    : `data:video/mp4;base64,${video.base64}`
                return video.url || ''
              }) || []
          }
        }
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
          metadata: metadata
        }
      }
    }
  }
})
