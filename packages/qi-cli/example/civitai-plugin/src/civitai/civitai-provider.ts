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

  provider.listModels = async (params: { query?: string; page?: number; limit?: number; nextUrl?: string } = {}) => {
    try {
      const data = await bridge.listModels(params);
      const models: Model[] = [];

      for (const item of (data.items || [])) {
        if (item.modelVersions && item.modelVersions.length > 0) {
          const versions = item.modelVersions.map((v: any) => ({
            id: v.id,
            name: v.name,
            baseModel: v.baseModel,
            images: v.images || [],
            description: v.description
          }));

          const latestVersion = item.modelVersions[0];

          models.push({
            id: String(item.id),
            modelId: item.id,
            versionId: latestVersion.id,
            versions: versions,
            name: item.name,
            category: 'image',
            description: item.description || '',
            created: Math.floor(Date.now() / 1000),
            object: 'model',
            owned_by: item.creator?.username || 'civitai',
            // 默认显示最新版本的信息
            images: latestVersion.images || [],
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
