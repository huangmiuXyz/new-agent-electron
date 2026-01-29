import { Plugin, PluginContext } from './types';
import { createKokoro, DEFAULT_VOICES } from './kokoro/kokoro-provider';

const PLUGIN_NAME = 'kokoro-plugin';
const STORAGE_KEY = 'kokoro-config';
const PROVIDER_ID = 'kokoro';

/**
 * Kokoro TTS Plugin
 * 
 * 集成 Kokoro 开源 TTS 模型，支持本地语音合成。
 * 支持在调用 doGenerate 时自动启动后端服务。
 */
const plugin: Plugin = {
  name: PLUGIN_NAME,
  version: '1.0.0',
  description: 'Kokoro Local TTS Plugin with Auto-start',
  author: 'Agent-Qi',

  install: async (context: PluginContext) => {
    const { localforage, useForm, registerRegistry, registerProvider } = context;

    let currentConfig: any = (await localforage.getItem(STORAGE_KEY)) || {};

    const [ConfigForm] = useForm({
      fields: [
        {
          name: 'baseURL',
          label: '服务地址',
          type: 'text',
          placeholder: 'http://localhost:18889',
          hint: 'Kokoro TTS 后端服务地址'
        },
        {
          name: 'autoStartServer',
          label: '自动启动后端服务',
          type: 'boolean',
          hint: '在调用 TTS 时自动启动 Python 后端服务'
        },
        {
          name: 'serverPort',
          label: '服务端口号',
          type: 'number',
          placeholder: '18889',
          hint: '本地服务监听端口'
        }
      ],
      initialData: {
        baseURL: currentConfig.baseURL || 'http://localhost:18889',
        autoStartServer: currentConfig.autoStartServer ?? true,
        serverPort: currentConfig.serverPort || 18889
      },
      onChange: async (_field: string, _value: any, data: any) => {
        currentConfig = JSON.parse(JSON.stringify(data));
        await localforage.setItem(STORAGE_KEY, currentConfig);
      }
    });

    registerRegistry(PROVIDER_ID, (options: any) => {
      const autoStartEnabled = currentConfig?.autoStartServer ?? true;
      const serverPort = currentConfig?.serverPort ?? 18889;
      const baseURL = options?.baseURL || currentConfig?.baseURL || 'http://localhost:18889';

      const autoStart = autoStartEnabled && context.api && context.api.spawn ? {
        enabled: true,
        port: serverPort,
        basePath: context.basePath,
        spawn: context.api.spawn.bind(context.api),
        platform: context.api.os?.platform(),
        pathJoin: context.api.path?.join.bind(context.api.path),
        notification: context.notification
      } : undefined;

      return createKokoro({
        ...options,
        baseURL,
        autoStart
      });
    });

    registerProvider(PROVIDER_ID, {
      name: 'Kokoro TTS',
      form: ConfigForm,
      models: [
        {
          id: 'kokoro-v1.1-zh',
          name: 'Kokoro v1.1 中文',
          category: 'tts',
          active: true,
          voices: DEFAULT_VOICES.map(v => ({ id: v.id, name: v.name }))
        }
      ]
    });
  },

  uninstall: (context: PluginContext) => {
    context.unregisterProvider(PROVIDER_ID);
  }
};

export default plugin;
