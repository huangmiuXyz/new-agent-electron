import { SpeechModelV3, SharedV3Warning } from '@ai-sdk/provider';
import { KokoroConfig, AutoStartConfig } from './kokoro-config';
import { KokoroSpeechRequest, KokoroSpeechResponse } from './kokoro-api-types';

export interface KokoroSpeechCallOptions {
  speed?: number;
  language?: 'zh' | 'en' | 'auto';
}

// 模块级共享状态 - 比静态变量更可靠，即使类被重新实例化也能保持
let globalServerStarted = false;
let globalServerStarting = false;
let globalServerStatusPromise: Promise<boolean> | null = null;

// 并发控制
interface PendingTask {
  resolve: (value: void) => void;
  reject: (reason: unknown) => void;
}
let activeCount = 0;
const pendingQueue: PendingTask[] = [];

export class KokoroSpeechModel implements SpeechModelV3 {
  readonly specificationVersion = 'v3';

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: string,
    private readonly config: KokoroConfig,
  ) { }

  private async getArgs({
    text,
    voice = 'zf_001',
    speed,
    providerOptions,
  }: Parameters<SpeechModelV3['doGenerate']>[0]) {
    const warnings: SharedV3Warning[] = [];

    const kokoroOptions = providerOptions?.kokoro as KokoroSpeechCallOptions | undefined;

    const requestBody: KokoroSpeechRequest = {
      text,
      voice: voice || 'zf_001',
      speed: speed ?? kokoroOptions?.speed ?? 1.0,
      format: 'wav',
      lang: kokoroOptions?.language || 'auto',
    };

    return {
      requestBody,
      warnings,
    };
  }

  /**
   * 检查服务是否运行（带缓存和并发控制）
   * 所有并发调用会共享同一个检查结果
   */
  private async isServerRunning(): Promise<boolean> {
    // 如果已知服务已启动，直接返回
    if (globalServerStarted) {
      return true;
    }

    // 等待正在进行的启动完成
    if (globalServerStarting) {
      let waitCount = 0;
      while (globalServerStarting && waitCount < 30) {
        await new Promise(r => setTimeout(r, 1000));
        waitCount++;
      }
      return globalServerStarted;
    }

    // 如果有正在进行的检查，复用它
    if (globalServerStatusPromise) {
      return globalServerStatusPromise;
    }

    // 创建新的检查 Promise，所有并发调用都会等待这个 Promise
    globalServerStatusPromise = this.checkServerHealth().then(result => {
      if (result) {
        globalServerStarted = true;
      }
      return result;
    });

    try {
      return await globalServerStatusPromise;
    } finally {
      // 清理 Promise，供后续调用重新检查（如果失败的话）
      globalServerStatusPromise = null;
    }
  }

  private async checkServerHealth(timeout = 5000): Promise<boolean> {
    try {
      const healthUrl = this.config.url({ modelId: this.modelId, path: '/health' });
      const res = await fetch(healthUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(timeout)
      });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  /**
   * 启动后端服务
   */
  private async startServer(autoStart?: AutoStartConfig): Promise<boolean> {
    if (!autoStart) {
      return false;
    }

    if (globalServerStarting) {
      // 等待其他调用完成启动
      let waitCount = 0;
      while (globalServerStarting && waitCount < 30) {
        await new Promise(r => setTimeout(r, 1000));
        waitCount++;
      }
      return globalServerStarted;
    }

    globalServerStarting = true;

    try {
      const { createTab, platform, pathJoin, basePath, notification } = autoStart;

      notification.info('正在启动 Kokoro TTS 服务...', 'Kokoro TTS');

      const serverPath = pathJoin(basePath, 'server');
      const command = platform === 'win32'
        ? `cd "${serverPath}" && start.bat`
        : `cd "${serverPath}" && bash start.sh`;

      // 不 await，让命令在后台运行
      createTab({
        command,
        timeout: 120000, // 2分钟超时
        showTerminal: true // 显示终端面板
      }).catch(err => {
        console.error('[Kokoro] createTab error:', err);
      });

      // 等待服务启动（首次启动需创建虚拟环境和安装依赖，耗时较长）
      let retry = 0;
      let started = false;
      const maxRetries = 30; // 最多等待 60 秒
      const retryInterval = 2000; // 每 2 秒检查一次

      while (retry < maxRetries) {
        await new Promise(r => setTimeout(r, retryInterval));
        if (await this.checkServerHealth(10000)) { // 健康检查超时 10 秒
          started = true;
          break;
        }
        retry++;
        console.log(`[Kokoro] 等待服务启动... (${retry}/${maxRetries})`);
      }

      if (started) {
        globalServerStarted = true;
        notification.success('Kokoro TTS 服务已启动', 'Kokoro TTS');
      } else {
        notification.error('Kokoro TTS 服务启动超时', 'Kokoro TTS');
      }

      return started;
    } catch (error) {
      console.error('[Kokoro] Failed to start server:', error);
      return false;
    } finally {
      globalServerStarting = false;
    }
  }

  /**
   * 获取执行许可，如果超过并发限制则排队等待
   */
  private async acquireConcurrency(): Promise<void> {
    const maxConcurrency = this.config.concurrency?.maxConcurrency;
    if (!maxConcurrency || maxConcurrency <= 0) {
      return;
    }

    if (activeCount < maxConcurrency) {
      activeCount++;
      return;
    }

    // 超过并发限制，加入等待队列
    return new Promise<void>((resolve, reject) => {
      pendingQueue.push({ resolve, reject });
    });
  }

  /**
   * 释放执行许可，让等待队列中的下一个任务执行
   */
  private releaseConcurrency(): void {
    const maxConcurrency = this.config.concurrency?.maxConcurrency;
    if (!maxConcurrency || maxConcurrency <= 0) {
      return;
    }

    const nextTask = pendingQueue.shift();
    if (nextTask) {
      nextTask.resolve();
    } else {
      activeCount--;
    }
  }

  async doGenerate(
    options: Parameters<SpeechModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<SpeechModelV3['doGenerate']>>> {
    // 等待获取并发许可
    await this.acquireConcurrency();

    try {
      const { requestBody, warnings } = await this.getArgs(options);

      const autoStart = this.config.autoStart;
      if (autoStart?.enabled) {
        const isRunning = await this.isServerRunning();
        if (!isRunning) {
          const started = await this.startServer(autoStart);
          if (!started) {
            throw new Error('Kokoro TTS 服务启动失败，请检查 Python 环境');
          }
        }
      }

      const url = this.config.url({
        modelId: this.modelId,
        path: '/tts',
      });

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers(),
        },
        body: JSON.stringify(requestBody),
        signal: options.abortSignal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(
          `Kokoro TTS Error: ${errorData.error || response.statusText} (${response.status})`,
        );
      }

      const result = (await response.json()) as KokoroSpeechResponse;

      // Decode base64 audio to Uint8Array
      const audioBase64 = result.audio;
      const audioUint8Array = new Uint8Array(
        atob(audioBase64)
          .split('')
          .map((char) => char.charCodeAt(0)),
      );

      return {
        audio: audioUint8Array,
        warnings,
        response: {
          timestamp: new Date(),
          modelId: this.modelId,
          headers: Object.fromEntries(response.headers.entries()),
          body: result,
        },
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Kokoro TTS request failed: ${String(error)}`);
    } finally {
      // 释放并发许可
      this.releaseConcurrency();
    }
  }
}
