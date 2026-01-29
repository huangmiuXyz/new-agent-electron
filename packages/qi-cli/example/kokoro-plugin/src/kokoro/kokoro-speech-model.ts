import { SpeechModelV3, SharedV3Warning } from '@ai-sdk/provider';
import { KokoroConfig, AutoStartConfig } from './kokoro-config';
import { KokoroSpeechRequest, KokoroSpeechResponse } from './kokoro-api-types';

export interface KokoroSpeechCallOptions {
  speed?: number;
  language?: 'zh' | 'en' | 'auto';
}

export class KokoroSpeechModel implements SpeechModelV3 {
  readonly specificationVersion = 'v3';
  private static serverStarting: boolean = false;
  private static serverStarted: boolean = false;

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
   * 检查服务是否运行
   */
  private async isServerRunning(): Promise<boolean> {
    try {
      const healthUrl = this.config.url({ modelId: this.modelId, path: '/health' });
      const res = await fetch(healthUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
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

    if (KokoroSpeechModel.serverStarting) {
      // 等待其他调用完成启动
      let waitCount = 0;
      while (KokoroSpeechModel.serverStarting && waitCount < 30) {
        await new Promise(r => setTimeout(r, 1000));
        waitCount++;
      }
      return KokoroSpeechModel.serverStarted;
    }

    KokoroSpeechModel.serverStarting = true;

    try {
      const { spawn, platform, pathJoin, basePath, port, notification } = autoStart;

      notification.info('正在启动 Kokoro TTS 服务...', 'Kokoro TTS');

      const serverPath = pathJoin(basePath, 'server');

      // 设置环境变量
      const env = {
        KOKORO_PORT: String(port),
        KOKORO_HOST: '127.0.0.1'
      };

      if (platform === 'darwin' || platform === 'linux') {
        const startScript = pathJoin(serverPath, 'start.sh');
        spawn('bash', [startScript], {
          detached: true,
          stdio: 'ignore',
          cwd: serverPath,
          env
        });
      } else if (platform === 'win32') {
        const startScript = pathJoin(serverPath, 'start.bat');
        spawn('cmd', ['/c', startScript], {
          detached: true,
          stdio: 'ignore',
          cwd: serverPath,
          env
        });
      } else {
        const mainScript = pathJoin(serverPath, 'main.py');
        spawn('python3', [mainScript], {
          detached: true,
          stdio: 'ignore',
          cwd: serverPath,
          env
        });
      }

      // 等待服务启动
      let retry = 0;
      let started = false;

      while (retry < 15) {
        await new Promise(r => setTimeout(r, 2000));
        if (await this.isServerRunning()) {
          started = true;
          break;
        }
        retry++;
      }

      if (started) {
        KokoroSpeechModel.serverStarted = true;
        notification.success('Kokoro TTS 服务已启动', 'Kokoro TTS');
      } else {
        notification.error('Kokoro TTS 服务启动超时', 'Kokoro TTS');
      }

      return started;
    } catch (error) {
      console.error('[Kokoro] Failed to start server:', error);
      return false;
    } finally {
      KokoroSpeechModel.serverStarting = false;
    }
  }

  async doGenerate(
    options: Parameters<SpeechModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<SpeechModelV3['doGenerate']>>> {
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

    try {
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
    }
  }
}
