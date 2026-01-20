import { ImageModelV3, ProviderV3 } from '@ai-sdk/provider';
import { CivitaiImageModel } from './civitai-image-model';
import { CivitaiSDKBridge } from './civitai-jsbridge';
import { Model } from '../types';

export interface CivitaiProvider extends ProviderV3 {
  (settings?: {}): {
    image: (modelId?: string) => CivitaiImageModel;
  };

  /**
   * Creates a model for image generation.
   */
  image(modelId?: string): ImageModelV3;
  imageModel(modelId?: string): ImageModelV3;
  imageCallOptionsSchema?: any;
  listModels?: (params?: { query?: string; page?: number; limit?: number; nextUrl?: string }) => Promise<{ items: Model[]; nextPage?: string }>;
  getModelVersion?: (versionId: string | number) => Promise<any>;
  generateImageAsyncTask: (params: any) => Promise<{ task_id: string }>;
  asyncResult: (params: { task_id: string }) => Promise<any>;
}

export interface CivitaiProviderSettings {
  apiKey?: string;
  pluginPath?: string;
  baseUrl?: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
}

/**
 * 创建 Civitai 提供商工厂
 */
export function createCivitai(
  options: CivitaiProviderSettings = {},
): CivitaiProvider {
  const apiKey = options.apiKey || (typeof process !== 'undefined' ? process.env.CIVITAI_API_KEY : '');

  const bridge = new CivitaiSDKBridge({
    apiKey: apiKey || '',
    pluginPath: options.pluginPath || '',
  });

  const createImageModel = (modelId: string = 'urn:air:sdxl:checkpoint:civitai:101055@128078') =>
    new CivitaiImageModel(modelId, {
      provider: 'civitai.image',
      bridge,
      fetch: options.fetch,
    });

  const provider = function () {
    return {
      image: createImageModel,
    };
  };

  provider.image = createImageModel;
  provider.imageModel = createImageModel;
  provider.imageCallOptionsSchema = CivitaiImageModel.imageCallOptionsSchema;

  provider.getModelVersion = async (versionId: string | number) => {
    return bridge.getModelVersion(versionId);
  };

  // 映射 Civitai 的 baseModel 到 AIR 前缀
  const baseModelMapping: Record<string, string> = {
    // SD 1.x
    'SD 1.5': 'sd1',
    'SD 1.4': 'sd1',
    'SD 1.5 LCM': 'sd1',
    'SD 1.5 Hyper': 'sd1',

    // SDXL
    'SDXL 1.0': 'sdxl',
    'SDXL Lightning': 'sdxl',
    'SDXL Turbo': 'sdxl',
    'SDXL Hyper': 'sdxl',
    'Stable Diffusion XL': 'sdxl',

    // SD 2.x
    'SD 2.0': 'sd2',
    'SD 2.1': 'sd2',

    // SD 3.x
    'SD 3': 'sd3',
    'SD 3.5': 'sd3',
    'SD 3.5 Medium': 'sd3',
    'SD 3.5 Large': 'sd3',
    'SD 3.5 Large Turbo': 'sd3',

    // Flux
    'Flux.1 S': 'flux1s',
    'Flux.1 Schnell': 'flux1s',
    'Flux.1 D': 'flux1d',
    'Flux.1 Dev': 'flux1d',

    // Other popular architectures
    'Pony': 'pony',
    'Pony Diffusion': 'pony',
    'Illustrious': 'illustrious',
    'NoobAI': 'noobai',
    'Aura Flow': 'auraflow',
    'PixArt-a': 'pixart',
    'PixArt-Sigma': 'pixart',
    'Hunyuan 1': 'hunyuan',
    'Kolors': 'kolors',
    'Playground V2': 'pg2',
  };

  provider.listModels = async (params: { query?: string; page?: number; limit?: number; nextUrl?: string } = {}) => {
    try {
      const data = await bridge.listModels(params);
      const models: Model[] = [];

      for (const item of (data.items || [])) {
        if (item.modelVersions && item.modelVersions.length > 0) {
          const latestVersion = item.modelVersions[0];

          // 构建 AIR 格式的 ID: urn:air:{baseModel}:{type}:civitai:{modelId}@{versionId}
          const baseModel = latestVersion.baseModel || 'SD 1.5';

          // 尝试从映射中获取，如果没有，则进行简单的字符串处理作为 fallback
          let baseModelAir = baseModelMapping[baseModel];
          if (!baseModelAir) {
            const lowerBase = baseModel.toLowerCase();
            if (lowerBase.includes('sdxl') || lowerBase.includes('stable diffusion xl')) baseModelAir = 'sdxl';
            else if (lowerBase.includes('sd 1.')) baseModelAir = 'sd1';
            else if (lowerBase.includes('sd 2.')) baseModelAir = 'sd2';
            else if (lowerBase.includes('sd 3.')) baseModelAir = 'sd3';
            else if (lowerBase.includes('flux')) {
              if (lowerBase.includes('schnell') || lowerBase.includes('.1 s')) baseModelAir = 'flux1s';
              else baseModelAir = 'flux1d';
            }
            else if (lowerBase.includes('pony')) baseModelAir = 'pony';
            else baseModelAir = 'sd1'; // 最后的保底
          }

          const typeAir = (item.type || 'Checkpoint').toLowerCase();
          // const airId = `urn:air:${baseModelAir}:${typeAir}:civitai:${item.id}@${latestVersion.id}`;

          models.push({
            id: String(item.id),
            versionId: latestVersion.id,
            name: `${item.name} - ${latestVersion.name}`,
            category: 'image',
            description: item.description || '',
            created: Math.floor(Date.now() / 1000),
            object: 'model',
            owned_by: item.creator?.username || 'civitai',
            // 额外信息用于 UI 显示
            images: latestVersion.images?.map((img: any) => img.url) || [],
            tags: item.tags || [],
            stats: item.stats || {},
            type: item.type,
            nsfw: item.nsfw
          });
        }
      }

      return {
        items: models,
        nextPage: data.metadata?.nextPage
      };
    } catch (error) {
      console.error('Civitai listModels error:', error);
      return { items: [] };
    }
  };

  provider.generateImageAsyncTask = async (params: any) => {
    const model = params.model as CivitaiImageModel;
    return model.createTask(params);
  };

  provider.asyncResult = async ({ task_id }: { task_id: string }) => {
    const model = createImageModel();
    const result = await model.waitForTask(task_id);
    return {
      images: (result.images as unknown as string[]).map((base64) => ({ base64 })),
      warnings: result.warnings,
    };
  };

  return provider as unknown as CivitaiProvider;
}
