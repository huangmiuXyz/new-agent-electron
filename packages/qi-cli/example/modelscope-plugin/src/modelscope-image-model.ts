import { ImageModelV2, ImageModelV2CallOptions } from '@ai-sdk/provider';
import { ModelScopeImageGenerationRequest, ModelScopeImageGenerationResponse, ModelScopeTaskResponse } from './modelscope-api-types';

export class ModelScopeImageModel implements ImageModelV2 {
  readonly specificationVersion = 'v2';
  readonly maxImagesPerCall = 1;

  constructor(
    readonly modelId: string,
    private readonly settings: { apiKey: string; baseURL: string }
  ) {}

  get provider(): string {
    return 'modelscope';
  }

  async doGenerate(options: ImageModelV2CallOptions): Promise<Awaited<ReturnType<ImageModelV2['doGenerate']>>> {
    const { prompt, n = 1, size, seed, providerOptions } = options;

    const baseURL = this.settings.baseURL.endsWith('/') ? this.settings.baseURL : `${this.settings.baseURL}/`;

    // 1. Submit task
    const requestBody: ModelScopeImageGenerationRequest = {
      model: this.modelId,
      prompt,
      size,
      seed,
      ...((providerOptions?.modelscope as any) || {}),
    };

    const response = await fetch(`${baseURL}v1/images/generations`, {
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

    // 2. Poll for results
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes with 5s interval

    while (attempts < maxAttempts) {
      if (options.abortSignal?.aborted) {
        throw new Error('Task aborted');
      }

      const statusResponse = await fetch(`${baseURL}v1/tasks/${taskId}`, {
        headers: {
          'Authorization': `Bearer ${this.settings.apiKey}`,
          'X-ModelScope-Task-Type': 'image_generation',
        },
        signal: options.abortSignal,
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
        throw new Error(`ModelScope task failed: ${taskData.message || 'Unknown error'}`);
      }

      // Wait 5 seconds before next poll
      await new Promise((resolve) => setTimeout(resolve, 5000));
      attempts++;
    }

    throw new Error('ModelScope task timed out');
  }
}
