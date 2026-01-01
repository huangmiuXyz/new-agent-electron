import { Plugin } from './types';
import * as Vosk from 'vosk-browser';

let model: Vosk.Model | null = null;
let recognizer: Vosk.KaldiRecognizer | null = null;
let modelLoadingPromise: Promise<Vosk.Model> | null = null;

const plugin: Plugin = {
  name: 'vosk-speech-recognition',
  version: '1.0.0',
  description: 'Vosk 实时语音识别插件',

  async install(context) {
    console.log('Vosk Speech Recognition 插件正在执行 install...');
    const initModel = async (silent = false) => {
      if (model) return model;
      if (modelLoadingPromise) return modelLoadingPromise;

      modelLoadingPromise = (async () => {
        let closeLoading: (() => void) | null = null;
        try {
          if (!context.api) {
            throw new Error('应用 API 未就绪');
          }

          if (!silent) {
            context.notification.status('vosk-status', '', {
              html: `
                <style>
                  @keyframes plugin-spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                  }
                </style>
                <svg style="animation: plugin-spin 1s linear infinite;" viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                  <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                </svg>
              `,
              color: '#fff',
              tooltip: '正在加载 Vosk 模型...'
            });
            closeLoading = context.notification.loading('正在初始化语音识别引擎并加载 Vosk 模型 (vosk-model-small-cn-0.22.zip)...', '语音识别');
          }

          const fullPath = context.api.path.join(context.basePath || '', 'vosk-model-small-cn-0.22.zip');
          console.log('Vosk fullPath:', fullPath);

          const normalizedPath = fullPath.replace(/\\/g, '/');
          const modelUrl = `plugin-resource://${normalizedPath}`;

          console.log('正在加载 Vosk 模型 (固定地址):', modelUrl);

          model = await Vosk.createModel(modelUrl);
          console.log('Vosk 模型加载成功 (通过自定义协议)');

          if (!silent) {
            context.notification.status('vosk-status', '', {
              html: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>`,
              color: '#fff',
              tooltip: 'Vosk 语音识别已就绪'
            });
          }

          if (closeLoading) {
            closeLoading();
            context.notification.success('语音识别模型 (Vosk) 加载成功，已就绪', '语音识别');
          }

          return model;
        } catch (err) {
          console.error('Vosk 模型加载失败:', err);
          if (closeLoading) {
            closeLoading();
            context.notification.error(`模型加载失败: ${err instanceof Error ? err.message : String(err)}`, '语音识别');
          }
          modelLoadingPromise = null;
          throw err;
        }
      })();

      return modelLoadingPromise;
    };

    initModel(false).catch(err => {
      console.error('后台预加载 Vosk 模型失败:', err);
    });

    context.registerHook('speech.stream.start', async (options: { sampleRate: number, onResult?: (text: string) => void, onPartial?: (text: string) => void }) => {
      try {
        const { sampleRate, onResult, onPartial } = options;
        const m = await initModel(false); // 钩子调用时如果还没加载完，显示加载提示
        if (recognizer) {
          recognizer.remove();
        }
        recognizer = new m.KaldiRecognizer(sampleRate);

        recognizer.on('result', (message: any) => {
          const result = message.result?.text || message.text;
          if (result && onResult) {
            onResult(result);
          }
        });

        recognizer.on('partialresult', (message: any) => {
          const partial = message.result?.partial || message.partial;
          if (partial && onPartial) {
            onPartial(partial);
          }
        });

        return { success: true };
      } catch (err) {
        console.error('Vosk 启动失败:', err);
        return { success: false, error: String(err) };
      }
    });

    context.registerHook('speech.stream.data', async (options: { data: Float32Array, sampleRate: number }) => {
      if (recognizer) {
        recognizer.acceptWaveformFloat(options.data, options.sampleRate);
      }
    });

    // 注册停止识别钩子
    context.registerHook('speech.stream.stop', async () => {
      if (recognizer) {
        recognizer.remove();
        recognizer = null;
        return { success: true };
      }
      return null;
    });

    context.registerHook('speech.recognize', async () => {
      try {
        await initModel();
        return { text: '识别结果' };
      } catch (err) {
        console.error('Vosk 识别失败:', err);
        return { error: String(err) };
      }
    });
  },

  async uninstall() {
    if (recognizer) {
      recognizer.remove();
      recognizer = null;
    }
    if (model) {
      model.terminate();
      model = null;
    }
    console.log('Vosk Speech Recognition 插件已卸载');
  }
};

export default plugin;
