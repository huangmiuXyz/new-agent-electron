import { ModelScopeImageModel } from './modelscope-image-model';

export function createModelScope(options: { apiKey: string; baseURL?: string }) {
  const baseURL = options.baseURL ?? 'https://api-inference.modelscope.cn/';

  const createImageModel = (modelId: string) => {
    return new ModelScopeImageModel(modelId, {
      apiKey: options.apiKey,
      baseURL,
    });
  };

  return {
    imageModel: createImageModel
  };
}
