import { Plugin, PluginContext } from './types'
import { createModelScope } from './modelscope/modelscope-provider'
import { PLUGIN_NAME } from './constants'
const plugin: Plugin = {
  name: PLUGIN_NAME,
  version: '1.0.0',
  description: 'ModelScope AIGC Image Generation Plugin',
  author: 'Zhuanz',

  install: async (context: PluginContext) => {
    context.registerRegistry('modelscope', (options: any) => {
      return createModelScope(options)
    })
  },

  uninstall: () => {}
}

export default plugin
