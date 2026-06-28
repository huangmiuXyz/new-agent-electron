import type { MainPlugin, MainPluginContext } from '@agent-qi/types';
import { fork } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';

interface MainRouterOptions {
  send: (msg: any) => void;
  broadcast: (channel: string, data: any) => void;
  logger?: { error: (...args: any[]) => void };
}

export function createMainRouter(opts: MainRouterOptions) {
  const { send, broadcast, logger } = opts;
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
    if (msg.ok) {
      let result = msg.result;
      if (Array.isArray(result) && result.length > 0 && typeof result[0] === 'number') {
        result = new Uint8Array(result);
      }
      p.resolve(result);
    } else {
      p.reject(new Error(msg.error));
    }
  };

  const sendWithPending = (type: string, params: any): Promise<any> => {
    const id = String(++reqId);
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      send({ id, type, ...params });
    });
  };

  function rejectAll(error: Error) {
    for (const [id, { reject }] of pending) {
      reject(error);
      pending.delete(id);
    }
    if (streamingReject) {
      streamingReject(error);
      streamingResolve = null;
      streamingReject = null;
    }
  }

  return {
    handleWorkerMessage,
    rejectAll,

    handleTTS(params: { text: string; voice: string; speed?: number }) {
      return sendWithPending('tts', params);
    },

    handleVoices() {
      return sendWithPending('voices', {});
    },

    handleReconfigure(config: { modelId?: string; dtype?: string; device?: string }) {
      send({ type: 'reconfigure', ...config });
    },

    handleStreamStart(params: { voice: string; speed?: number }) {
      const streamingId = String(++reqId);
      return new Promise<string>((resolve, reject) => {
        streamingResolve = resolve;
        streamingReject = reject;
        send({
          type: 'stream-start',
          streamingId,
          voice: params.voice,
          speed: params.speed ?? 1.0,
        });
      });
    },

    handleStreamText(params: { text: string }) {
      send({ type: 'stream-text', text: params.text });
    },

    handleStreamFinish() {
      return new Promise<void>((resolve, reject) => {
        streamingResolve = resolve;
        streamingReject = reject;
        send({ type: 'stream-finish' });
      });
    },
  };
}

let cp: ReturnType<typeof fork> | null = null;
let router: ReturnType<typeof createMainRouter> | null = null;

function startWorker(context: MainPluginContext, workerPath: string, currentModelId: string, currentDtype: string, currentDevice: string): Promise<void> {
  return new Promise((resolve, reject) => {
    cp = fork(workerPath, [], { stdio: 'pipe' });

    cp.stdout?.on('data', (data) => {
      context.logger.info('[kokoro-worker] ' + data.toString().trim());
    });
    cp.stderr?.on('data', (data) => {
      context.logger.error('[kokoro-worker] ' + data.toString().trim());
    });

    const initTimeout = setTimeout(() => {
      reject(new Error('Model loading timeout (120s)'));
    }, 120_000);

    cp.on('message', function onInit(msg: any) {
      if (msg.type === 'ready') {
        clearTimeout(initTimeout);
        resolve();
      } else if (msg.type === 'error') {
        clearTimeout(initTimeout);
        reject(new Error(msg.error));
      }
    });

    cp.on('exit', (code) => {
      clearTimeout(initTimeout);
      reject(new Error(`Worker exited prematurely with code ${code}`));
    });

    cp.send({
      type: 'init',
      modelId: currentModelId,
      dtype: currentDtype,
      device: currentDevice,
    });
  });
}

function setupRouter(context: MainPluginContext, currentModelId: string, currentDtype: string, currentDevice: string) {
  router = createMainRouter({
    send: (msg) => cp!.send(msg),
    broadcast: (channel, data) => context.ipc.broadcast(channel, data),
    logger: context.logger,
  });

  cp!.on('message', router.handleWorkerMessage);

  cp!.on('exit', (code) => {
    if (code !== 0) {
      context.logger.error(`Worker crashed (code: ${code}), restarting...`);
      router?.rejectAll(new Error('Worker process crashed'));
      router = null;
      cp = null;
      spawnWorker(context, workerPath);
    }
  });
}

let workerPath: string;
function spawnWorker(context: MainPluginContext, wp?: string) {
  if (wp) workerPath = wp;
  if (!workerPath) return;
  startWorker(context, workerPath, currentModelId, currentDtype, currentDevice)
    .then(() => setupRouter(context, currentModelId, currentDtype, currentDevice))
    .catch((err) => context.logger.error('Failed to spawn worker:', err));
}

let currentModelId = 'onnx-community/Kokoro-82M-v1.1-zh-ONNX';
let currentDtype = 'q8';
let currentDevice = 'cpu';

const plugin: MainPlugin = {
  name: 'kokoro-plugin',
  async install(context: MainPluginContext) {
    let wp = join(__dirname, 'tts-worker.cjs');
    if (!existsSync(wp)) {
      wp = join(__dirname, '..', 'dist', 'tts-worker.cjs');
    }
    if (!existsSync(wp)) {
      context.logger.error('TTS worker not found at: ' + wp);
      return;
    }
    workerPath = wp;

    await startWorker(context, workerPath, currentModelId, currentDtype, currentDevice);
    setupRouter(context, currentModelId, currentDtype, currentDevice);

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
      return router!.handleTTS(params);
    });

    context.ipc.removeHandler('voices')
    context.ipc.handle('voices', () => {
      return router!.handleVoices();
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
      cp!.send({ type: 'reconfigure', modelId: currentModelId, dtype: currentDtype, device: currentDevice });
    });

    context.ipc.removeHandler('tts-stream-start')
    context.ipc.handle('tts-stream-start', async (_event, params: {
      voice: string;
      speed?: number;
    }) => {
      return router!.handleStreamStart(params);
    });

    context.ipc.removeHandler('tts-stream-text')
    context.ipc.handle('tts-stream-text', async (_event, params: { text: string }) => {
      router!.handleStreamText(params);
    });

    context.ipc.removeHandler('tts-stream-finish')
    context.ipc.handle('tts-stream-finish', async () => {
      return router!.handleStreamFinish();
    });

    context.onUnload(() => { if (cp) cp.kill(); });
  },
};

export default plugin;
