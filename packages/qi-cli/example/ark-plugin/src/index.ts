import type { Plugin, PluginContext } from '@agent-qi/types'
import { createArk } from './ark'
import { PLUGIN_NAME, PROVIDER_ID } from './constants'

const plugin: Plugin = {
  name: PLUGIN_NAME,
  version: '1.0.0',
  description: 'Volcengine Ark provider plugin',

  install: async (context: PluginContext) => {
    context.registerRegistry(PROVIDER_ID, (options: any) => createArk(options))
  },

  uninstall: async (context: PluginContext) => {
    context.unregisterRegistry(PROVIDER_ID)
  }
}

export default plugin
