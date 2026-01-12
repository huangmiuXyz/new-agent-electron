import { ImageModelV3, ImageModelV3CallOptions } from '@ai-sdk/provider';
import { ModelScopeImageGenerationRequest, ModelScopeImageGenerationResponse, ModelScopeTaskResponse } from './modelscope-api-types';
import { DEFAULT_BASE_URL } from './constants';

export class ModelScopeImageModel implements ImageModelV3 {
  readonly specificationVersion = 'v3';
  readonly maxImagesPerCall = 1;

  constructor(
    readonly modelId: string,
    private readonly settings: { apiKey: string; baseURL: string }
  ) { }

  get provider(): string {
    return 'modelscope';
  }

  async doGenerate(options: ImageModelV3CallOptions): Promise<Awaited<ReturnType<ImageModelV3['doGenerate']>>> {
    const { prompt, n = 1, size, seed, providerOptions } = options;

    const baseURL = (this.settings.baseURL || DEFAULT_BASE_URL).endsWith('/') ? this.settings.baseURL : `${this.settings.baseURL}/`;

    // 1. Submit task
    const requestBody: ModelScopeImageGenerationRequest = {
      model: this.modelId,
      prompt,
      size,
      seed,
      ...((providerOptions?.modelscope as any) || {}),
    };

    const response = await fetch(`${baseURL}images/generations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.settings.apiKey}`,
        'Content-Type': 'application/json',
        'X-ModelScope-Async-Mode': 'true',
      },
      body: JSON.stringify(requestBody),
      signal: options.abortSignal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ModelScope task submission failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as ModelScopeImageGenerationResponse;
    const taskId = data.task_id;
    const onStart = providerOptions?.modelscope?.onStart as ((task_id: string) => void) | undefined;
    onStart?.(taskId);
    return this.waitForTask(taskId, options.abortSignal);
  }

  async waitForTask(taskId: string, abortSignal?: AbortSignal): Promise<Awaited<ReturnType<ImageModelV3['doGenerate']>>> {
    const baseURL = this.settings.baseURL.endsWith('/') ? this.settings.baseURL : `${this.settings.baseURL}/`;
    // 2. Poll for results
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes with 5s interval

    while (attempts < maxAttempts) {
      if (abortSignal?.aborted) {
        throw new Error('Task aborted');
      }

      const statusResponse = await fetch(`${baseURL}tasks/${taskId}`, {
        headers: {
          'Authorization': `Bearer ${this.settings.apiKey}`,
          'X-ModelScope-Task-Type': 'image_generation',
        },
        signal: abortSignal,
      });

      if (!statusResponse.ok) {
        const errorText = await statusResponse.text();
        throw new Error(`ModelScope task status check failed: ${statusResponse.status} ${errorText}`);
      }

      const taskData = (await statusResponse.json()) as ModelScopeTaskResponse;

      if (taskData.task_status === 'SUCCEED') {
        if (!taskData.output_images || taskData.output_images.length === 0) {
          throw new Error('ModelScope task succeeded but no images were returned');
        }

        // Fetch images and convert to base64
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
          })
        );

        return {
          images,
          warnings: [],
          response: {
            timestamp: new Date(),
            modelId: this.modelId,
            headers: Object.fromEntries(statusResponse.headers.entries()),
          },
        };
      } else if (taskData.task_status === 'FAILED') {
        throw new Error(`ModelScope task failed: ${taskData.errors?.message || 'Unknown error'}`);
      }

      // Wait 5 seconds before next poll
      await new Promise((resolve) => setTimeout(resolve, 5000));
      attempts++;
    }

    throw new Error('ModelScope task timed out');
  }
}
