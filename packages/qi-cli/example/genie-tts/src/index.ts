import { Plugin } from './types';
import { createGenie } from './genie-provider';

/**
 * Genie TTS Plugin
 * 参考 minimax-plugin 的实现方式，并使用 registerProvider 的 form 参数
 */
const plugin: Plugin = {
  name: 'genie-tts',
  version: '1.0.0',
  description: 'Genie TTS 语音合成插件',

  async install(context) {
    context.registerRegistry('genie', (options: any) => {
      return createGenie(options);
    });

    const [Form] = context.useForm({
      fields: [
        {
          name: 'autoStartGenie',
          type: 'boolean',
          label: '自动启动服务',
          defaultValue: true
        },
        {
          name: 'baseUrl',
          type: 'string',
          label: '服务地址',
          placeholder: 'http://127.0.0.1:8000',
          defaultValue: 'http://127.0.0.1:8000'
        }
      ],
    });

    context.registerProvider('genie', {
      name: 'Genie TTS',
      form: Form,
      models: [
        {
          id: 'mika',
          category: 'tts',
          name: 'Mika (聖園ミカ)',
        },
        {
          id: '37',
          category: 'tts',
          name: 'ThirtySeven (37)',
        },
        {
          id: 'feibi',
          category: 'tts',
          name: 'Feibi (菲比)',
        }
      ]
    });

    context.registerHook('ai:before-use', async (params: any) => {
      const { providerType, baseURL } = params;
      if (providerType !== 'genie') return;

      const settingsStore = await context.getStore('settings');
      const provider = settingsStore.providers.find((p: any) =>
        p.providerType === 'genie' && p.baseUrl === baseURL
      );

      if (provider && provider.autoStartGenie) {
        const isGenieRunning = async () => {
          try {
            const baseUrlClean = (baseURL || '').replace(/\/$/, '');
            if (!baseUrlClean) return false;
            const res = await fetch(`${baseUrlClean}/load_character`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ character_name: 'test', check_only: true })
            });
            return res.status !== 404 || res.ok;
          } catch (e) {
            return false;
          }
        };

        if (!(await isGenieRunning())) {
          context.notification.info('正在尝试启动 Genie TTS 服务...', 'Genie TTS');

          if (context.api && context.api.spawn) {
            context.api.spawn('python', ['-c', 'import genie_tts; genie_tts.start_server(host="127.0.0.1", port=8000)'], {
              detached: true,
              stdio: 'ignore'
            });

            let retry = 0;
            let started = false;
            while (retry < 5) {
              await new Promise((resolve) => setTimeout(resolve, 3000));
              if (await isGenieRunning()) {
                started = true;
                break;
              }
              retry++;
            }

            if (started) {
              context.notification.success('Genie TTS 服务已成功启动', 'Genie TTS');
            } else {
              context.notification.error('Genie TTS 启动超时，请确保已安装 genie-tts 并在终端手动运行', 'Genie TTS');
            }
          }
        }
      }
    });
  },

  async uninstall(context) {
    context.unregisterProvider('genie');
  }
};

export default plugin;
