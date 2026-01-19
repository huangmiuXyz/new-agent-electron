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

  const createImageModel = (modelId: string = 'civitai-image') =>
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

  provider.listModels = async (params: { query?: string; page?: number; limit?: number; nextUrl?: string } = {}) => {
    let urlString = params.nextUrl;

    if (!urlString) {
      const url = new URL('https://civitai.com/api/v1/models');
      url.searchParams.append('limit', String(params.limit || 20));

      if (params.query) {
        url.searchParams.append('query', params.query);
        // Civitai API: Cannot use page param with query search.
        // Must use cursor-based pagination for subsequent pages.
      } else if (params.page) {
        url.searchParams.append('page', String(params.page));
      }

      // 默认获取图像生成相关的模型
      url.searchParams.append('types', 'Checkpoint');
      urlString = url.toString();
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    try {
      const response = await fetch(urlString, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }

      const data = await response.json();
      const models: Model[] = [];

      for (const item of (data.items || [])) {
        if (item.modelVersions && item.modelVersions.length > 0) {
          // 使用第一个版本作为模型的 ID
          const latestVersion = item.modelVersions[0];
          models.push({
            id: String(latestVersion.id),
            name: `${item.name} - ${latestVersion.name}`,
            category: 'image',
            description: item.description || '',
            created: Math.floor(Date.now() / 1000),
            object: 'model',
            owned_by: item.creator?.username || 'civitai',
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
