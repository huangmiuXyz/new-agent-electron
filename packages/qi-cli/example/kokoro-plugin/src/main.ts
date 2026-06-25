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

    context.ipc.handle('tts', async (_event, params: { text: string; voice: string; speed?: number }) => {
      const id = String(++reqId);
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, type: 'tts', ...params });
      });
    });

    context.ipc.handle('voices', () => {
      const id = String(++reqId);
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, type: 'voices' });
      });
    });

    context.onUnload(() => { worker.terminate(); });
  },
};

export default plugin;
