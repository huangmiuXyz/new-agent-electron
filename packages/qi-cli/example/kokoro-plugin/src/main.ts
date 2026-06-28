import type { MainPlugin, MainPluginContext } from '@agent-qi/types';
import { Worker } from 'worker_threads';
import { join } from 'path';
import { existsSync } from 'fs';

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

    const pending = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void }>();

    worker.on('message', (msg: { id: string; ok: boolean; result?: any; error?: string }) => {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.result);
      else p.reject(new Error(msg.error));
    });

    worker.on('error', (err) => context.logger.error('Worker error:', err));

    let reqId = 0;

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
      const id = String(++reqId);
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, type: 'tts', ...params });
      });
    });

    context.ipc.removeHandler('voices')
    context.ipc.handle('voices', () => {
      const id = String(++reqId);
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, type: 'voices' });
      });
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
      worker.postMessage({ type: 'reconfigure', modelId: currentModelId, dtype: currentDtype, device: currentDevice });
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Model reload timeout (120s)')), 120_000);
        const handler = (msg: any) => {
          if (msg.type === 'ready') {
            clearTimeout(timeout);
            worker.removeListener('message', handler);
            resolve();
          } else if (msg.type === 'error') {
            clearTimeout(timeout);
            worker.removeListener('message', handler);
            reject(new Error(msg.error));
          }
        };
        worker.on('message', handler);
      });
    });

    context.onUnload(() => { worker.terminate(); });
  },
};

export default plugin;
