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
    let checkLock: Promise<void> | null = null;

    context.registerRegistry('genie', (options: any) => {
      return createGenie(options);
    });

    // 2. 定义配置表单组件
    const ConfigForm = context.vue.markRaw(context.vue.defineComponent({
      setup() {
        const isRunning = context.vue.ref(false);
        const [Form, formActions] = context.useForm({
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
              defaultValue: 'http://127.0.0.1:8000',
              rest: () => context.vue.h('div', { style: "margin-left: 8px; display: flex; align-items: center;" }, [
                context.vue.h('span', {
                  style: {
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: isRunning.value ? '#52c41a' : '#ff4d4f',
                    marginRight: '4px'
                  }
                }),
                context.vue.h('span', {
                  style: "font-size: 12px; color: var(--text-secondary)"
                }, isRunning.value ? '服务在线' : '服务离线')
              ])
            }
          ],
          onChange: async (_field: string, _value: any, data: any) => {
            await context.localforage.setItem('genie_config', data);
            checkStatus(data.baseUrl);
          }
        });

        const checkStatus = async (url?: string) => {
          try {
            const baseUrlClean = (url || 'http://127.0.0.1:8000').replace(/\/$/, '');
            const res = await fetch(`${baseUrlClean}/load_character`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ character_name: 'test', check_only: true })
            });
            isRunning.value = res.status !== 404 || res.ok;
          } catch (e) {
            isRunning.value = false;
          }
        };

        // 初始化：从 localforage 加载已有配置
        context.vue.onMounted(async () => {
          const savedConfig = await context.localforage.getItem('genie_config');
          if (savedConfig) {
            formActions.setData(savedConfig);
            checkStatus((savedConfig as any).baseUrl);
          } else {
            // 如果没有保存过配置，直接检查 useForm 定义的默认地址
            checkStatus('http://127.0.0.1:8000');
          }
        });

        return () => context.vue.h(Form);
      }
    }));

    context.registerProvider('genie', {
      name: 'Genie TTS',
      providerType: 'genie',
      form: ConfigForm,
      models: [
        {
          id: 'genie-tts',
          category: 'tts',
          name: 'Genie TTS',
          active: true,
          voices: [
            { id: 'mika', name: 'Mika (聖園ミカ)' },
            { id: '37', name: 'ThirtySeven (37)' },
            { id: 'feibi', name: 'Feibi (菲比)' }
          ]
        }
      ]
    });

    // 初始化默认配置到 localforage（如果不存在）
    context.localforage.getItem('genie_config').then(async (config) => {
      if (!config) {
        await context.localforage.setItem('genie_config', {
          baseUrl: 'http://127.0.0.1:8000',
          autoStartGenie: true
        });
      }
    });

    context.registerHook('ai:before-tts-use', async (params: any) => {
      const { providerId } = params;
      if (providerId !== 'genie') return;

      const config = await context.localforage.getItem<any>('genie_config');
      const autoStartGenie = config?.autoStartGenie ?? true;
      const baseURL = config?.baseUrl || 'http://127.0.0.1:8000';

      if (autoStartGenie) {
        // 如果当前没有检查任务，则创建一个
        if (!checkLock) {
          checkLock = (async () => {
            const isGenieRunning = async () => {
              try {
                const baseUrlClean = baseURL.replace(/\/$/, '');
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
              if (context.useTerminal) {
                let geniePath = context.basePath.endsWith('src')
                  ? context.basePath.replace(/\/src$/, '/Genie-TTS')
                  : `${context.basePath}/Genie-TTS`;

                const cmd = `import sys, os; sys.path.append(os.path.join('${geniePath}', 'src')); import genie_tts; genie_tts.start_server()`;

                const terminal = context.useTerminal();

                // 异步执行启动命令
                terminal.createTab({
                  id: 'genie-tts-server',
                  command: `python3 -c "${cmd.replace(/"/g, '\\"')}"`,
                  showTerminal: true,
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
                  // 启动失败，清除 lock 允许下次尝试
                  checkLock = null;
                  throw new Error('Genie TTS startup failed');
                }
              }
            }
          })();
        }

        // 所有请求都会 await 这个同一个 Promise
        await checkLock;
      }
    });
  },

  async uninstall(context) {
    context.unregisterProvider('genie');
  }
};

export default plugin;
