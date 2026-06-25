import { Plugin, PluginContext } from '@agent-qi/types';
import { createKokoro, DEFAULT_VOICES } from './kokoro/kokoro-provider';

const PLUGIN_NAME = 'kokoro-plugin';
const PROVIDER_ID = 'kokoro';

const plugin: Plugin = {
  name: PLUGIN_NAME,
  version: '2.0.0',
  description: 'Kokoro Local TTS Plugin (kokoro-js)',

  install: async (context: PluginContext) => {
    const { registerRegistry, registerProvider } = context;

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
  },

  uninstall: (context: PluginContext) => {
    context.api.pluginMain.unload(PLUGIN_NAME);
  },
};

export default plugin;
