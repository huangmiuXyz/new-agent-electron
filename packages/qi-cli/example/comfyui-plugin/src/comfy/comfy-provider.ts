import { ImageModelV3, ProviderV3 } from '@ai-sdk/provider';
import { FetchFunction } from '@ai-sdk/provider-utils';
import { ComfyUIImageModel } from './comfy-image-model';
import { comfyImageCallOptionsSchema } from './comfy-api-types';
import {
  DEFAULT_BASE_URL,
  DEFAULT_MODEL_ID
} from '../constants';
import { ensureNoTrailingSlash } from './comfy-utils';

export interface ComfyUIProvider extends ProviderV3 {
  image(modelId?: string): ComfyUIImageModel;
  imageModel(modelId?: string): ComfyUIImageModel;
  imageCallOptionsSchema: typeof comfyImageCallOptionsSchema;
  generateImageAsyncTask: (params: any) => Promise<{ task_id: string }>;
  asyncResult: (params: { task_id: string }) => Promise<{
    status?: 'pending' | 'completed' | 'failed';
    error?: string;
    images?: Array<string | { url: string }>;
  }>;
  listModels?: () => Promise<any[]>;
}

export interface ComfyUIProviderSettings {
  apiKey?: string;
  baseURL?: string;
  workflowJson?: string;
  fetch?: FetchFunction;
}

const asModelInstance = (model: unknown): ComfyUIImageModel | null => {
  return model instanceof ComfyUIImageModel ? model : null;
};

export function createComfyUI(options: ComfyUIProviderSettings = {}): ComfyUIProvider {
  const baseURL = ensureNoTrailingSlash(options.baseURL || DEFAULT_BASE_URL);

  const createImageModel = (modelId: string = DEFAULT_MODEL_ID) =>
    new ComfyUIImageModel(modelId, {
      provider: 'comfyui.image',
      baseURL,
      apiKey: options.apiKey,
      workflowJson: options.workflowJson,
      fetch: options.fetch
    });

  const provider = function () {
    return {
      image: createImageModel
    };
  };

  provider.image = createImageModel;
  provider.imageModel = createImageModel;
  provider.imageCallOptionsSchema = comfyImageCallOptionsSchema;

  provider.generateImageAsyncTask = async (params: any) => {
    const model =
      asModelInstance(params.model) ||
      createImageModel(typeof params.model === 'string' ? params.model : DEFAULT_MODEL_ID);

    return await model.createTask(params);
  };

  provider.asyncResult = async ({ task_id }: { task_id: string }) => {
    const model = createImageModel();
    const result = await model.pollTask(task_id);

    if (result.status === 'completed') {
      return {
        status: 'completed',
        images: (result.images || []).map((url) => ({ url }))
      };
    }

    if (result.status === 'failed') {
      return {
        status: 'failed',
        error: result.error || 'ComfyUI task failed.'
      };
    }

    return { status: 'pending' };
  };

  provider.listModels = async () => {
    return [
      {
        id: DEFAULT_MODEL_ID,
        name: 'ComfyUI Workflow',
        category: 'image',
        object: 'model',
        created: Date.now(),
        owned_by: 'comfyui'
      }
    ];
  };

  return provider as unknown as ComfyUIProvider;
}
