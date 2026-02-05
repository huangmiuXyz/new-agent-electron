import type { Plugin, PluginContext } from '@agent-qi/types'
import { createMoonshot } from './moonshot/moonshot-provider'

const plugin: Plugin = {
    name: 'moonshot-plugin',
    version: '1.0.0',
    description: 'Moonshot AI (Kimi) Provider Plugin',
    install: async (context: PluginContext) => {
        context.registerRegistry('moonshotai', (options: any) => {
            return createMoonshot(options);
        });
    },
    uninstall: (context: PluginContext) => {
        context.unregisterProvider('moonshotai');
    }
}

export default plugin;
