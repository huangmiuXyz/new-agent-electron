import { Plugin, PluginContext } from './types'
import { createMiniMax } from './minimax/minimax-provider'

/**
 * MiniMax AI Provider Plugin
 */
const plugin: Plugin = {
  name: 'minimax-plugin',
  version: '1.0.0',
  description: 'MiniMax AI Provider Plugin',

  install: async (context: PluginContext) => {
    // 注册到全局模型注册表
    context.registerRegistry('minimax', (options: any) => {
      return createMiniMax(options);
    });
  },

  uninstall: (context: PluginContext) => {
    // 卸载逻辑
    context.unregisterProvider('minimax');
  }
}

export default plugin;
