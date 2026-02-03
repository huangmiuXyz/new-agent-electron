import { Plugin, PluginContext } from './types';
import { createMacOSProvider } from './macos-tts/macos-provider';

/**
 * MacOS Native TTS Provider Plugin
 */
const plugin: Plugin = {
  name: 'macos-tts-plugin',
  version: '1.0.0',
  description: 'MacOS 原生语音合成插件 (say)',
  author: 'Agent-Qi',

  install: async (context: PluginContext) => {
    const macosProvider = createMacOSProvider(context);

    // 注册到全局模型注册表
    context.registerRegistry('macos-tts', () => {
      return macosProvider;
    });

    // 动态获取音色列表并注册提供商
    const models = await macosProvider.listModels();

    context.registerProvider('macos-tts', {
      name: 'MacOS Native TTS',
      providerType: 'macos-tts',
      models: models
    });
  },

  uninstall: (context: PluginContext) => {
    // 卸载逻辑
    context.unregisterProvider('macos-tts');
  }
};

export default plugin;
