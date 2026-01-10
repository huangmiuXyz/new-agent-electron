import { Plugin, PluginContext } from './types'
import { createSiliconFlow } from './siliconflow/siliconflow-provider'

/**
 * SiliconFlow AI Provider Plugin
 */
const plugin: Plugin = {
  name: 'siliconflow-plugin',
  version: '1.0.0',
  description: 'SiliconFlow AI Provider Plugin',
  author: 'Agent-Qi',

  install: async (context: PluginContext) => {
    // 注册到全局模型注册表
    context.registerRegistry('siliconflow', (options: any) => {
      return createSiliconFlow(options);
    });
  },

  uninstall: (context: PluginContext) => {
    // 卸载逻辑
    context.unregisterProvider('siliconflow');
  }
}

export default plugin;
