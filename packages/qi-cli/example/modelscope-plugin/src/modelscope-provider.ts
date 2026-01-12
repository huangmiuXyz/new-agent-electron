import { ModelScopeImageModel } from './modelscope-image-model';
import { DEFAULT_BASE_URL } from './constants';

export function createModelScope(options: { apiKey: string; baseURL?: string }) {
  const baseURL = options.baseURL ?? DEFAULT_BASE_URL;

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
