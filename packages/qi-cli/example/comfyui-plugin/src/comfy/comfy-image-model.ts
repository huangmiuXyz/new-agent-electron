import { ImageModelV3, ImageModelV3CallOptions, SharedV3Warning } from '@ai-sdk/provider';
import { FetchFunction, parseProviderOptions } from '@ai-sdk/provider-utils';
import {
  ComfyImageCallOptions,
  ComfyPollResult,
  ComfyPromptResponse,
  ComfyHistoryEntry,
  comfyImageCallOptionsSchema
} from './comfy-api-types';
import {
  collectImagesFromHistory,
  createClientId,
  ensureNoTrailingSlash,
  extractComfyError,
  fillMissingSeedValues,
  renderWorkflowJsonTemplate,
  safeJsonParseObject
} from './comfy-utils';
import { DEFAULT_POLL_INTERVAL_MS, DEFAULT_TIMEOUT_SEC } from '../constants';

interface ComfyImageModelConfig {
  provider: string;
  baseURL: string;
  apiKey?: string;
  workflowJson?: string;
  fetch?: FetchFunction;
}

interface PreparedTask {
  workflow: Record<string, any>;
}

export class ComfyUIImageModel implements ImageModelV3 {
  readonly specificationVersion = 'v3';
  readonly maxImagesPerCall = 8;
  public static readonly imageCallOptionsSchema = comfyImageCallOptionsSchema;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: string,
    private readonly config: ComfyImageModelConfig
  ) { }

  private async fetchFn(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const fetchImpl = this.config.fetch ?? globalThis.fetch;
    return fetchImpl.call(globalThis, input, init);
  }

  private get baseURL(): string {
    return ensureNoTrailingSlash(this.config.baseURL);
  }

  private async parseCallOptions(providerOptions?: Record<string, unknown>): Promise<ComfyImageCallOptions> {
    const parsed = await parseProviderOptions({
      provider: 'comfyui',
      providerOptions,
      schema: ComfyUIImageModel.imageCallOptionsSchema
    });
    return (parsed ?? {}) as ComfyImageCallOptions;
  }

  private extractPromptText(prompt: ImageModelV3CallOptions['prompt']): string {
    if (typeof prompt === 'string') {
      return prompt;
    }

    if (prompt && typeof prompt === 'object' && 'text' in prompt) {
      const text = (prompt as { text?: unknown }).text;
      if (typeof text === 'string') {
        return text;
      }
    }

    return '';
  }

  private resolveSeed(seed: ImageModelV3CallOptions['seed']): number {
    if (typeof seed === 'number' && Number.isFinite(seed)) {
      return Math.floor(seed);
    }
    return Math.floor(Math.random() * 2147483648);
  }

  private async prepareTask(options: ImageModelV3CallOptions): Promise<PreparedTask> {
    const comfyOptions = await this.parseCallOptions(options.providerOptions);

    const workflowJson = comfyOptions.workflowJson || this.config.workflowJson;
    if (!workflowJson?.trim()) {
      throw new Error(
        'ComfyUI workflow JSON is empty. Configure it in provider settings or providerOptions.comfyui.workflowJson.'
      );
    }

    const resolvedSeed = this.resolveSeed(options.seed);
    const renderedWorkflowJson = renderWorkflowJsonTemplate(workflowJson, {
      prompt: this.extractPromptText(options.prompt),
      seed: resolvedSeed
    });
    const workflow = safeJsonParseObject(renderedWorkflowJson, 'Workflow JSON');
    fillMissingSeedValues(workflow, resolvedSeed);

    return { workflow };
  }

  private async postPrompt(workflow: Record<string, any>): Promise<string> {
    const body: Record<string, any> = {
      prompt: workflow,
      client_id: createClientId()
    };

    if (this.config.apiKey?.trim()) {
      body.extra_data = {
        api_key_comfy_org: this.config.apiKey.trim()
      };
    }

    const response = await this.fetchFn(`${this.baseURL}/prompt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const rawText = await response.text();
    if (!response.ok) {
      throw new Error(`ComfyUI /prompt failed (${response.status}): ${rawText}`);
    }

    let payload: ComfyPromptResponse;
    try {
      payload = JSON.parse(rawText) as ComfyPromptResponse;
    } catch {
      throw new Error('ComfyUI /prompt returned non-JSON response.');
    }

    if (payload.error) {
      throw new Error(`ComfyUI /prompt error: ${payload.error}`);
    }

    if (payload.node_errors && Object.keys(payload.node_errors).length > 0) {
      throw new Error(`ComfyUI node errors: ${JSON.stringify(payload.node_errors)}`);
    }

    const promptId = payload.prompt_id !== undefined ? String(payload.prompt_id) : '';
    if (!promptId) {
      throw new Error('ComfyUI /prompt did not return prompt_id.');
    }

    return promptId;
  }

  async createTask(options: ImageModelV3CallOptions): Promise<{ task_id: string }> {
    const { workflow } = await this.prepareTask(options);
    const taskId = await this.postPrompt(workflow);
    return { task_id: taskId };
  }

  async pollTask(taskId: string): Promise<ComfyPollResult> {
    const response = await this.fetchFn(`${this.baseURL}/history/${encodeURIComponent(taskId)}`, {
      method: 'GET'
    });

    if (response.status === 404) {
      return { status: 'pending' };
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`ComfyUI /history failed (${response.status}): ${text}`);
    }

    const payload = (await response.json()) as Record<string, ComfyHistoryEntry>;
    const entry = payload?.[taskId];
    if (!entry) {
      return { status: 'pending' };
    }

    const images = collectImagesFromHistory(entry, this.baseURL);
    if (images.length > 0) {
      return { status: 'completed', images };
    }

    const error = extractComfyError(entry);
    if (error) {
      return { status: 'failed', error };
    }

    if (entry.status?.completed) {
      // Some workflows mark completed slightly earlier than /history output persistence.
      // Keep polling until timeout instead of failing immediately.
      return { status: 'pending' };
    }

    return { status: 'pending' };
  }

  private async waitForTask(
    taskId: string,
    options?: {
      pollIntervalMs?: number;
      timeoutMs?: number;
      abortSignal?: AbortSignal;
    }
  ): Promise<ComfyPollResult> {
    const pollIntervalMs = options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_SEC * 1000;
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      if (options?.abortSignal?.aborted) {
        throw new Error('ComfyUI task aborted.');
      }

      const status = await this.pollTask(taskId);
      if (status.status === 'completed') return status;
      if (status.status === 'failed') {
        throw new Error(status.error || 'ComfyUI task failed.');
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`ComfyUI task timed out after ${Math.floor(timeoutMs / 1000)} seconds.`);
  }

  async doGenerate(options: ImageModelV3CallOptions): Promise<Awaited<ReturnType<ImageModelV3['doGenerate']>>> {
    const warnings: SharedV3Warning[] = [];
    const pollIntervalMs = DEFAULT_POLL_INTERVAL_MS;
    const timeoutMs = DEFAULT_TIMEOUT_SEC * 1000;

    const { task_id } = await this.createTask(options);
    const result = await this.waitForTask(task_id, {
      pollIntervalMs,
      timeoutMs,
      abortSignal: options.abortSignal
    });

    return {
      images: result.images ?? [],
      warnings,
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: {}
      }
    };
  }
}
