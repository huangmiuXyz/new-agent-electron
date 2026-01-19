import { ImageModelV3, ImageModelV3CallOptions, SharedV3Warning } from '@ai-sdk/provider';
import { CivitaiSDKBridge } from '@/civitai/civitai-jsbridge';
import { parseProviderOptions } from '@ai-sdk/provider-utils';
import { z } from 'zod';

export interface CivitaiImageConfig {
  provider: string;
  bridge: CivitaiSDKBridge;
  fetch?: typeof fetch;
}

const civitaiImageCallOptionsSchema = z.object({
  negativePrompt: z.string().optional(),
  scheduler: z.enum([
    'EulerA', 'Euler', 'LMS', 'Heun', 'DPM2', 'DPM2A', 'DPM2SA', 'DPM2M',
    'DPMSDE', 'DPMFast', 'DPMAdaptive', 'LMSKarras', 'DPM2Karras', 'DPM2AKarras',
    'DPM2SAKarras', 'DPM2MKarras', 'DPMSDEKarras', 'DDIM', 'PLMS', 'UniPC',
    'Undefined', 'LCM', 'DDPM', 'DEIS'
  ]).optional(),
  steps: z.number().optional(),
  cfgScale: z.number().optional(),
  clipSkip: z.number().optional(),
  callbackUrl: z.string().url().optional(),
  batchSize: z.number().min(1).max(10).optional(),
  additionalNetworks: z.record(z.string(), z.any()).optional(),
  controlNets: z.array(z.any()).optional(),
});

export class CivitaiImageModel implements ImageModelV3 {
  readonly specificationVersion = 'v3';
  readonly maxImagesPerCall = 1;
  static imageCallOptionsSchema = civitaiImageCallOptionsSchema;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: string,
    private readonly config: CivitaiImageConfig,
  ) { }

  private async getArgs({
    prompt,
    n = 1,
    size,
    seed,
    providerOptions,
  }: ImageModelV3CallOptions) {
    const warnings: SharedV3Warning[] = [];
    const civitaiOptions = await parseProviderOptions({
      provider: 'civitai',
      providerOptions,
      schema: civitaiImageCallOptionsSchema,
    });

    let width = 512;
    let height = 512;
    if (size) {
      const [w, h] = size.split('x').map(Number);
      if (w && h) {
        width = w;
        height = h;
      }
    }

    const requestBody = {
      model: this.modelId,
      params: {
        prompt,
        negativePrompt: civitaiOptions?.negativePrompt ?? '',
        scheduler: civitaiOptions?.scheduler ?? 'EulerA',
        steps: civitaiOptions?.steps ?? 20,
        cfgScale: civitaiOptions?.cfgScale ?? 7,
        clipSkip: civitaiOptions?.clipSkip ?? 2,
        width,
        height,
        seed,
      },
      callbackUrl: civitaiOptions?.callbackUrl,
      batchSize: civitaiOptions?.batchSize ?? n,
      additionalNetworks: civitaiOptions?.additionalNetworks,
      controlNets: civitaiOptions?.controlNets,
    };

    return {
      requestBody,
      warnings,
    };
  }

  async createTask(options: ImageModelV3CallOptions) {
    const { requestBody } = await this.getArgs(options);
    const response = await this.config.bridge.generateImage(requestBody);

    let jobId = response.jobId || response.token;

    if (!jobId && response.jobs && Array.isArray(response.jobs) && response.jobs.length > 0) {
      jobId = response.jobs[0].jobId;
    }

    if (!jobId) {
      throw new Error(`Failed to start Civitai job: ${JSON.stringify(response)}`);
    }

    console.log(`Civitai job created successfully, using jobId: ${jobId}`);
    return { task_id: jobId };
  }

  async doGenerate(
    options: ImageModelV3CallOptions,
  ): Promise<Awaited<ReturnType<ImageModelV3['doGenerate']>> & { job_id?: string }> {
    const { task_id } = await this.createTask(options);

    // 轮询任务状态
    const result = await this.waitForTask(task_id, options.abortSignal);

    return {
      ...result,
      job_id: task_id,
    };
  }

  async waitForTask(
    jobId: string,
    abortSignal?: AbortSignal,
  ): Promise<Awaited<ReturnType<ImageModelV3['doGenerate']>>> {
    const maxAttempts = 60;
    let attempts = 0;

    while (attempts < maxAttempts) {
      if (abortSignal?.aborted) {
        throw new Error('Image generation aborted');
      }

      const jobStatus = await this.config.bridge.getJobStatus(jobId);

      // 根据 Civitai SDK 的实际响应格式进行处理
      // 必定没有顶层 status，通过 jobs 数组判断完成状态
      const hasJobs = jobStatus.jobs && Array.isArray(jobStatus.jobs) && jobStatus.jobs.length > 0;
      
      // 检查是否所有 job 都有可用的 blobUrl
      let imageUrl: string | undefined = undefined;
      
      if (hasJobs) {
        for (const job of jobStatus.jobs) {
          if (job.result && Array.isArray(job.result)) {
            const res = job.result.find((r: any) => r.blobUrl && r.available !== false);
            if (res) {
              imageUrl = res.blobUrl;
              break;
            }
          }
        }
      }

      if (imageUrl) {
        console.log('Found image URL:', imageUrl);
        // 下载图片并转为 base64
        const imgRes = await fetch(imageUrl);
          const buffer = await imgRes.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);

          return {
            images: [base64] as any,
            warnings: [],
            response: {
              timestamp: new Date(),
              modelId: this.modelId,
              headers: {},
            },
          };
        }

        // 如果代码运行到这里，说明任务还没真正完成（或者还没拿到 URL）
        // 检查是否有明确的失败标志
        const isFailed = jobStatus.status === 'failed' || jobStatus.status === 'FAILED' || (hasJobs && jobStatus.jobs.some((j: any) => j.status === 'failed' || j.status === 'FAILED'));
        if (isFailed) {
          throw new Error(`Civitai job failed: ${jobStatus.error || 'Unknown error'}`);
        }

        // 继续轮询
        attempts++;
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }

      throw new Error('Civitai job timed out');
    }
}
