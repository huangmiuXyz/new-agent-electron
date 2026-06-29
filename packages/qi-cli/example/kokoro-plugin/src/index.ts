import { Plugin, PluginContext } from '@agent-qi/types';
import { createKokoro, DEFAULT_VOICES } from './kokoro/kokoro-provider';
import { DEFAULT_SETTINGS, STORAGE_KEY, type KokoroPluginSettings } from './kokoro/kokoro-speech-model';
import { createStreamListener } from './stream-listener';

const PLUGIN_NAME = 'kokoro-plugin';
const PROVIDER_ID = 'kokoro';

let unsubStream: (() => void) | null = null;
let streamListener: ReturnType<typeof createStreamListener> | null = null;

const plugin: Plugin = {
  name: PLUGIN_NAME,
  version: '2.0.0',
  description: 'Kokoro Local TTS Plugin (kokoro-js)',

  install: async (context: PluginContext) => {
    const { registerRegistry, registerProvider, registerHook } = context;

    registerRegistry(PROVIDER_ID, (options: any) => {
      return createKokoro({
        ...options,
        invokeIPC: async (channel: string, ...args: any[]) => {
          return context.api.pluginMain.ipc.invoke(PLUGIN_NAME, channel, ...args);
        },
      });
    });

    registerProvider(PROVIDER_ID, {
      name: 'Kokoro TTS',
      models: [
        {
          id: 'onnx-community/Kokoro-82M-v1.1-zh-ONNX',
          name: 'Kokoro v1.1',
          category: 'tts',
          active: true,
          voices: DEFAULT_VOICES.map(v => ({ id: v.id, name: v.name })),
        },
      ],
    });

    registerHook('ai:tts-stream-start', async (payload: any) => {
      const { voice, speed, controller } = payload;

      controller.start({ audioMediaType: 'audio/wav' });

      streamListener = createStreamListener();
      streamListener.setController(controller);

      if (!unsubStream) {
        unsubStream = setupStreamListener(context, streamListener);
      }

      await context.api.pluginMain.ipc.invoke(
        PLUGIN_NAME, 'tts-stream-start', { voice, speed },
      );

      return { handled: true };
    });

    registerHook('ai:tts-stream-text', async (payload: any) => {
      const { delta } = payload;
      if (!delta) return;
      await context.api.pluginMain.ipc.invoke(
        PLUGIN_NAME, 'tts-stream-text', { text: delta },
      );
    });

    registerHook('ai:tts-stream-finish', async (_payload: any) => {
      await context.api.pluginMain.ipc.invoke(PLUGIN_NAME, 'tts-stream-finish');
    });

    registerHook('ai:tts-stream-error', async (_payload: any) => {
      cleanupStream();
    });

    const loadSettings = (): KokoroPluginSettings => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : DEFAULT_SETTINGS;
      } catch {
        return DEFAULT_SETTINGS;
      }
    };

    const saveSettings = (settings: KokoroPluginSettings) => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    };

    let currentSettings = loadSettings();

    const [ConfigForm, formActions] = context.useForm<KokoroPluginSettings>({
      title: 'Kokoro TTS 设置',
      fields: [
        {
          name: 'timeoutMs',
          label: 'IPC 超时 (毫秒)',
          type: 'number',
          placeholder: '60000',
        },
        {
          name: 'modelId',
          label: '模型 ID',
          type: 'text',
          placeholder: 'onnx-community/Kokoro-82M-v1.1-zh-ONNX',
        },
        {
          name: 'dtype',
          label: '量化类型',
          type: 'select',
          options: [
            { label: 'q8 (8-bit 量化)', value: 'q8' },
            { label: 'fp32 (单精度浮点)', value: 'fp32' },
            { label: 'fp16 (半精度浮点)', value: 'fp16' },
            { label: 'q4 (4-bit 量化)', value: 'q4' },
            { label: 'q4f16 (4-bit 混合)', value: 'q4f16' },
          ],
        },
        {
          name: 'device',
          label: '推理设备',
          type: 'select',
          options: [
            { label: 'CPU', value: 'cpu' },
            { label: 'WebGPU', value: 'webgpu' },
            { label: 'WASM', value: 'wasm' },
          ],
        },
      ],
      initialData: currentSettings,
      onChange: (_field, _value, data) => {
        const prev = currentSettings;
        currentSettings = data;
        saveSettings(data);
        if (data.modelId !== prev.modelId || data.dtype !== prev.dtype || data.device !== prev.device) {
          context.api.pluginMain.ipc.invoke(PLUGIN_NAME, 'reconfigure', {
            modelId: data.modelId,
            dtype: data.dtype,
            device: data.device,
          }).catch((err) => {
            console.error('Failed to reconfigure Kokoro worker:', err);
          });
        }
      },
    });

    context.registerSettings(ConfigForm);
  },

  uninstall: (context: PluginContext) => {
    cleanupStream();
    context.api.pluginMain.unload(PLUGIN_NAME);
    context.unregisterSettings();
  },
};

function setupStreamListener(context: PluginContext, listener: ReturnType<typeof createStreamListener>): () => void {
  const unsubChunk = context.api.pluginMain.ipc.on(
    PLUGIN_NAME, 'tts-stream-chunk',
    async ({ audio: audioArr }: any) => {
      listener.handleChunk(audioArr);
    },
  );

  const unsubEnd = context.api.pluginMain.ipc.on(
    PLUGIN_NAME, 'tts-stream-end',
    async ({ error }: any) => {
      listener.handleEnd(error);
      cleanupStream();
    },
  );

  return () => { unsubChunk(); unsubEnd(); };
}

function cleanupStream() {
  streamListener?.reset();
  streamListener = null;
  if (unsubStream) {
    unsubStream();
    unsubStream = null;
  }
}

export default plugin;
