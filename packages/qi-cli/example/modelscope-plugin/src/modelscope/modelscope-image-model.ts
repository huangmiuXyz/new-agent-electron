import { ImageModelV3, ImageModelV3CallOptions, SharedV3Warning } from '@ai-sdk/provider';
import {
  combineHeaders,
  parseProviderOptions,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { ModelScopeConfig } from './modelscope-config';
import { modelScopeFailedResponseHandler } from './modelscope-error';
import {
  ModelScopeImageAPITypes,
  ModelScopeImageAPIResponse,
  modelScopeImageCallOptionsSchema,
} from './modelscope-api-types';

export class ModelScopeImageModel implements ImageModelV3 {
  readonly specificationVersion = 'v3';
  readonly maxImagesPerCall = 1;
  public static readonly imageCallOptionsSchema = modelScopeImageCallOptionsSchema;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: string,
    private readonly config: ModelScopeConfig,
  ) { }

  private async getArgs({
    prompt,
    size,
    seed,
    providerOptions,
  }: Parameters<ImageModelV3['doGenerate']>[0]) {
    const warnings: SharedV3Warning[] = [];

    const modelScopeOptions = await parseProviderOptions({
      provider: 'modelscope',
      providerOptions,
      schema: ModelScopeImageModel.imageCallOptionsSchema,
    });

    let loras: string | Record<string, number> | undefined = modelScopeOptions?.loras;
    if (loras && typeof loras === 'object') {
      const keys = Object.keys(loras);
      if (keys.length === 1) {
        loras = keys[0];
      }
    }

    const requestBody: ModelScopeImageAPITypes = {
      model: this.modelId,
      prompt: prompt ?? '',
      size,
      seed,
      ...modelScopeOptions,
      loras,
    };

    return {
      requestBody,
      warnings,
    };
  }

  async doGenerate(
    options: ImageModelV3CallOptions,
    hooks?: { onStart?: (taskId: string) => void },
  ): Promise<Awaited<ReturnType<ImageModelV3['doGenerate']>>> {
    const { requestBody } = await this.getArgs(options);

    const { value: responseValue } = await postJsonToApi<ModelScopeImageAPIResponse>({
      url: this.config.url({
        modelId: this.modelId,
        path: '/images/generations',
      }),
      headers: combineHeaders(this.config.headers(), options.headers, {
        'X-ModelScope-Async-Mode': 'true',
      }),
      body: requestBody,
      failedResponseHandler: modelScopeFailedResponseHandler,
      successfulResponseHandler: async ({ response }) => {
        const json = (await response.json()) as ModelScopeImageAPIResponse;
        return {
          value: json,
          responseHeaders: Object.fromEntries(response.headers.entries()),
        };
      },
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const taskId = responseValue.task_id;

    if (hooks?.onStart) {
      hooks.onStart(taskId);
    }

    return this.waitForTask(taskId, options.abortSignal);
  }

  public async waitForTask(
    taskId: string,
    abortSignal?: AbortSignal,
  ): Promise<Awaited<ReturnType<ImageModelV3['doGenerate']>>> {
    let attempts = 0;
    const maxAttempts = 60;

    while (attempts < maxAttempts) {
      if (abortSignal?.aborted) {
        throw new Error('Task aborted');
      }

      const url = this.config.url({
        modelId: this.modelId,
        path: `/tasks/${taskId}`,
      });

      const response = await (this.config.fetch || fetch)(url, {
        headers: combineHeaders(this.config.headers(), {
          'X-ModelScope-Task-Type': 'image_generation',
        }) as Record<string, string>,
        method: 'GET',
        signal: abortSignal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ModelScope task status check failed: ${response.status} ${errorText}`);
      }

      const taskData = (await response.json()) as ModelScopeImageAPIResponse;

      if (taskData.task_status === 'SUCCEED') {
        if (!taskData.output_images || taskData.output_images.length === 0) {
          throw new Error('ModelScope task succeeded but no images were returned');
        }

        const images = await Promise.all(
          taskData.output_images.map(async (url) => {
            const imgRes = await fetch(url);
            const buffer = await imgRes.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            return btoa(binary);
          }),
        );

        return {
          images,
          warnings: [],
          response: {
            timestamp: new Date(),
            modelId: this.modelId,
            headers: {},
          },
        };
      }

      if (taskData.task_status === 'FAILED') {
        throw new Error(
          `ModelScope task failed: ${taskData.errors?.message || 'Unknown error'}`,
        );
      }

      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    throw new Error('ModelScope task timed out');
  }
}
