import type { MainPlugin, MainPluginContext } from '@agent-qi/types';
import { Worker } from 'worker_threads';
import { join } from 'path';
import { existsSync } from 'fs';

interface MainRouterOptions {
  postMessage: (msg: any) => void;
  broadcast: (channel: string, data: any) => void;
  logger?: { error: (...args: any[]) => void };
}

export function createMainRouter(opts: MainRouterOptions) {
  const { postMessage, broadcast, logger } = opts;
  const pending = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void }>();
  let streamingResolve: ((v: any) => void) | null = null;
  let streamingReject: ((e: Error) => void) | null = null;
  let reqId = 0;

  const handleWorkerMessage = (msg: any) => {
    if (msg.type === 'stream-chunk') {
      broadcast('tts-stream-chunk', {
        streamingId: msg.streamingId,
        audio: Array.from(msg.audio),
      });
      return;
    }

    if (msg.type === 'stream-end') {
      broadcast('tts-stream-end', { streamingId: msg.streamingId });
      if (streamingResolve) {
        streamingResolve(undefined);
        streamingResolve = null;
        streamingReject = null;
      }
      return;
    }

    if (msg.type === 'stream-error') {
      broadcast('tts-stream-end', { streamingId: msg.streamingId, error: msg.error });
      if (streamingReject) {
        streamingReject(new Error(msg.error));
        streamingResolve = null;
        streamingReject = null;
      }
      return;
    }

    if (msg.type === 'stream-started') {
      if (streamingResolve) {
        streamingResolve(msg.streamingId);
        streamingResolve = null;
        streamingReject = null;
      }
      return;
    }

    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.ok) p.resolve(msg.result);
    else p.reject(new Error(msg.error));
  };

  const sendWithPending = (type: string, params: any): Promise<any> => {
    const id = String(++reqId);
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      postMessage({ id, type, ...params });
    });
  };

  return {
    handleWorkerMessage,

    handleTTS(params: { text: string; voice: string; speed?: number }) {
      return sendWithPending('tts', params);
    },

    handleVoices() {
      return sendWithPending('voices', {});
    },

    handleReconfigure(config: { modelId?: string; dtype?: string; device?: string }) {
      postMessage({ type: 'reconfigure', ...config });
    },

    handleStreamStart(params: { voice: string; speed?: number }) {
      const streamingId = String(++reqId);
      return new Promise<string>((resolve, reject) => {
        streamingResolve = resolve;
        streamingReject = reject;
        postMessage({
          type: 'stream-start',
          streamingId,
          voice: params.voice,
          speed: params.speed ?? 1.0,
        });
      });
    },

    handleStreamText(params: { text: string }) {
      postMessage({ type: 'stream-text', text: params.text });
    },

    handleStreamFinish() {
      return new Promise<void>((resolve, reject) => {
        streamingResolve = resolve;
        streamingReject = reject;
        postMessage({ type: 'stream-finish' });
      });
    },

    handleReconfigureWait(config: { modelId?: string; dtype?: string; device?: string }) {
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Model reload timeout (120s)')), 120_000);
        const handler = (msg: any) => {
          if (msg.type === 'ready') {
            clearTimeout(timeout);
            resolve();
          } else if (msg.type === 'error') {
            clearTimeout(timeout);
            reject(new Error(msg.error));
          }
        };
        postMessage({ type: 'reconfigure', ...config });
        return { handler, cleanup: () => clearTimeout(timeout) };
      });
    },
  };
}

const plugin: MainPlugin = {
  name: 'kokoro-plugin',
  async install(context: MainPluginContext) {
    let workerPath = join(__dirname, 'tts-worker.cjs');
    if (!existsSync(workerPath)) {
      workerPath = join(__dirname, '..', 'dist', 'tts-worker.cjs');
    }
    if (!existsSync(workerPath)) {
      context.logger.error('TTS worker not found at: ' + workerPath);
      return;
    }

    const worker = new Worker(workerPath);

    let currentModelId = 'onnx-community/Kokoro-82M-v1.1-zh-ONNX';
    let currentDtype = 'q8';
    let currentDevice = 'cpu';

    const initWorker = () => {
      worker.postMessage({
        type: 'init',
        modelId: currentModelId,
        dtype: currentDtype,
        device: currentDevice,
      });
    };

    initWorker();

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Model loading timeout (120s)')), 120_000);
      worker.on('message', function handler(msg: any) {
        if (msg.type === 'ready') {
          clearTimeout(timeout);
          worker.removeListener('message', handler);
          resolve();
        } else if (msg.type === 'error') {
          clearTimeout(timeout);
          worker.removeListener('message', handler);
          reject(new Error(msg.error));
        }
      });
      worker.on('error', (err) => { clearTimeout(timeout); reject(err); });
    });

    const router = createMainRouter({
      postMessage: (msg) => worker.postMessage(msg),
      broadcast: (channel, data) => context.ipc.broadcast(channel, data),
      logger: context.logger,
    });

    worker.on('message', router.handleWorkerMessage);

    worker.on('error', (err) => context.logger.error('Worker error:', err));

    context.ipc.removeHandler('tts')
    context.ipc.handle('tts', async (_event, params: {
      text: string;
      voice: string;
      speed?: number;
      modelId?: string;
      dtype?: string;
      device?: string;
    }) => {
      if (params.modelId && params.modelId !== currentModelId) {
        currentModelId = params.modelId;
      }
      if (params.dtype && params.dtype !== currentDtype) {
        currentDtype = params.dtype;
      }
      if (params.device && params.device !== currentDevice) {
        currentDevice = params.device;
      }
      return router.handleTTS(params);
    });

    context.ipc.removeHandler('voices')
    context.ipc.handle('voices', () => {
      return router.handleVoices();
    });

    context.ipc.removeHandler('reconfigure')
    context.ipc.handle('reconfigure', async (_event, config: {
      modelId?: string;
      dtype?: string;
      device?: string;
    }) => {
      if (config.modelId) currentModelId = config.modelId;
      if (config.dtype) currentDtype = config.dtype;
      if (config.device) currentDevice = config.device;
      await router.handleReconfigureWait({
        modelId: currentModelId,
        dtype: currentDtype,
        device: currentDevice,
      });
    });

    context.ipc.removeHandler('tts-stream-start')
    context.ipc.handle('tts-stream-start', async (_event, params: {
      voice: string;
      speed?: number;
    }) => {
      return router.handleStreamStart(params);
    });

    context.ipc.removeHandler('tts-stream-text')
    context.ipc.handle('tts-stream-text', async (_event, params: { text: string }) => {
      router.handleStreamText(params);
    });

    context.ipc.removeHandler('tts-stream-finish')
    context.ipc.handle('tts-stream-finish', async () => {
      return router.handleStreamFinish();
    });

    context.onUnload(() => { worker.terminate(); });
  },
};

export default plugin;
