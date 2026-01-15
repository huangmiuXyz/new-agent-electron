import { ImageModelV3, ProviderV3 } from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { ModelScopeImageModel } from './modelscope-image-model';
import { Model } from '../types';
import { DEFAULT_BASE_URL, DEFAULT_MODEL_ID } from '../constants';

const VERSION = '1.0.0';

export interface ModelScopeProvider extends Pick<ProviderV3, 'imageModel'> {
  (settings?: {}): {
    image: (modelId?: string) => ModelScopeImageModel;
  };

  /**
   * Creates a model for image generation.
   */
  image(modelId?: string): ImageModelV3;
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

  const baseURL = options.baseURL ?? DEFAULT_BASE_URL;

  const createImageModel = (modelId: string = DEFAULT_MODEL_ID) =>
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

  return provider as unknown as ModelScopeProvider;
}
