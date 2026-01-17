import { Plugin } from './types';
import { createGenie } from './genie-provider';

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
            await fetch(`${baseUrlClean}/`);
            isRunning.value = true;
          } catch (e) {
            isRunning.value = false;
          }
        };

        context.vue.onMounted(async () => {
          const savedConfig = await context.localforage.getItem('genie_config');
          if (savedConfig) {
            formActions.setData(savedConfig);
            checkStatus((savedConfig as any).baseUrl);
          } else {
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
                await fetch(`${baseUrlClean}/`);
                return true;
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
                const installCmd = `python3 -m pip install -r requirements.txt --quiet`;
                const pythonCode = `
import sys, os, base64
sys.path.append(os.path.join('${geniePath}', 'src'))
from genie_tts import Server, Internal
from pydantic import BaseModel
from fastapi.routing import APIRoute

# Remove old route
for r in Server.app.routes[:]:
    if isinstance(r, APIRoute) and r.path == '/load_character':
        Server.app.routes.remove(r)

class LoadPredefinedPayload(BaseModel):
    character_name: str

def load_predefined_endpoint(payload: LoadPredefinedPayload):
    try:
        name = payload.character_name.lower().strip()
        save_path = Internal.download_chara(name)
        real_name = Internal.CHARA_ALIAS_MAP.get(name, name)

        model_dir = os.path.join(save_path, 'tts_models')
        if not os.path.exists(os.path.join(model_dir, 'vits_fp32.bin')):
            if os.path.exists(os.path.join(save_path, 'vits_fp32.bin')):
                model_dir = save_path

        Internal.model_manager.load_character(
            character_name=payload.character_name,
            model_dir=model_dir,
            language=Internal.CHARA_LANG[real_name],
        )

        import json
        with open(os.path.join(save_path, "prompt_wav.json"), "r", encoding="utf-8") as f:
            prompt_wav_dict = json.load(f)

        audio_text = prompt_wav_dict["Normal"]["text"]
        audio_path = os.path.join(save_path, "prompt_wav", prompt_wav_dict["Normal"]["wav"])

        ref_data = {
            'audio_path': audio_path,
            'audio_text': audio_text,
            'language': Internal.CHARA_LANG[real_name],
        }
        Server._reference_audios[payload.character_name] = ref_data

        from genie_tts.Audio.ReferenceAudio import ReferenceAudio
        Internal.context.current_prompt_audio = ReferenceAudio(
            prompt_wav=audio_path,
            prompt_text=audio_text,
            language=Internal.CHARA_LANG[real_name],
        )

        return {'status': 'success', 'message': f'Character {payload.character_name} loaded.'}
    except Exception as e:
        import traceback
        return {'status': 'error', 'message': f"{str(e)}\\n{traceback.format_exc()}"}

Server.app.add_api_route('/load_character', load_predefined_endpoint, methods=['POST'])
Server.start_server()
`;
                const encodedCode = btoa(unescape(encodeURIComponent(pythonCode)));
                const startCmd = `export GENIE_DATA_DIR="${geniePath}/GenieData" && python3 -c "import base64; exec(base64.b64decode('${encodedCode}').decode('utf-8'))"`;

                const terminal = context.useTerminal();

                terminal.createTab({
                  id: 'genie-tts-server',
                  command: `cd "${geniePath}" && ${installCmd} && ${startCmd}`,
                  showTerminal: true,
                });

                let retry = 0;
                let started = false;
                while (retry < 9999) {
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
