import { ImageModelV3, ProviderV3 } from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { ModelScopeImageModel } from './modelscope-image-model';
import { Model } from '../types';

const VERSION = '1.0.0';

export interface ModelScopeProvider extends Pick<ProviderV3, 'imageModel'> {
  (settings?: {}): {
    image: (modelId?: string) => ModelScopeImageModel;
  };

  /**
   * Creates a model for image generation.
   */
  image(modelId?: string): ImageModelV3;

  /**
   * List of available models.
   */
  listModels: () => Promise<Model[]>;
}

export interface ModelScopeProviderSettings {
  /**
   * API key for authenticating requests.
   */
  apiKey?: string;

  /**
   * Base URL for the ModelScope API requests.
   */
  baseURL?: string;

  /**
   * Custom headers to include in the requests.
   */
  headers?: Record<string, string>;

  /**
   * Custom fetch implementation.
   */
  fetch?: FetchFunction;
}

/**
 * Create a ModelScope provider instance.
 */
export function createModelScope(
  options: ModelScopeProviderSettings = {},
): ModelScopeProvider {
  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'MODELSCOPE_API_KEY',
          description: 'ModelScope',
        })}`,
        ...options.headers,
      },
      `ai-sdk/modelscope/${VERSION}`,
    );

  const baseURL = options.baseURL ?? 'https://api.modelscope.cn/api/v1';

  const createImageModel = (modelId: string = 'majicflus_v1') =>
    new ModelScopeImageModel(modelId, {
      provider: `modelscope.image`,
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = function () {
    return {
      image: createImageModel,
    };
  };

  provider.image = createImageModel;
  provider.imageModel = createImageModel;
  provider.imageCallOptionsSchema = ModelScopeImageModel.imageCallOptionsSchema;

  provider.listModels = async () => {
    return [
      {
        id: 'majicflus_v1',
        name: 'ModelScope majicflus_v1',
        category: 'image',
      },
      {
        id: 'MAILAND',
        name: 'ModelScope MAILAND',
        category: 'image',
      },
    ];
  };

  return provider as unknown as ModelScopeProvider;
}
