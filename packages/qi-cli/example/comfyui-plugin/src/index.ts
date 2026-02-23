import type { Plugin, PluginContext } from './types';
import { createComfyUI } from './comfy/comfy-provider';
import {
  DEFAULT_BASE_URL,
  DEFAULT_MODEL_ID,
  PLUGIN_NAME,
  PROVIDER_ID
} from './constants';

const plugin: Plugin = {
  name: PLUGIN_NAME,
  version: '1.0.0',
  description: 'ComfyUI image generation provider plugin',
  author: 'Agent-Qi',

  install: async (context: PluginContext) => {
    const { registerRegistry, registerProvider } = context;

    registerRegistry(PROVIDER_ID, (options: any) => {
      // Image call parameters are provided via providerOptions.comfyui and validated by imageCallOptionsSchema.
      return createComfyUI({
        ...options,
        apiKey: options?.apiKey,
        baseURL: options?.baseURL || DEFAULT_BASE_URL
      });
    });

    registerProvider(PROVIDER_ID, {
      name: 'ComfyUI',
      providerType: PROVIDER_ID,
      models: [
        {
          id: DEFAULT_MODEL_ID,
          name: 'ComfyUI Workflow',
          category: 'image',
          active: true
        }
      ]
    });
  },

  uninstall: (context: PluginContext) => {
    context.unregisterProvider(PROVIDER_ID);
    context.unregisterRegistry?.(PROVIDER_ID);
  }
};

export default plugin;
