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
            closeLoading = context.notification.loading('正在加载语音识别模型...', '语音识别');
          }

          const pluginsPath = context.api.getPluginsPath();
          const fullPath = context.api.path.join(pluginsPath, plugin.name, 'vosk-model-small-cn-0.22.zip');

          console.log('正在通过 fs 读取 Vosk 模型:', fullPath);
          const buffer = context.api.fs.readFileSync(fullPath);
          const blob = new Blob([buffer], { type: 'application/zip' });
          const modelUrl = URL.createObjectURL(blob);

          console.log('正在加载 Vosk 模型 (ObjectURL):', modelUrl);
          model = await Vosk.createModel(modelUrl);
          console.log('Vosk 模型加载成功');

          // 加载完成后释放 ObjectURL
          URL.revokeObjectURL(modelUrl);

          if (closeLoading) {
            closeLoading();
            context.notification.success('语音识别模型加载成功', '语音识别');
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

    initModel(true).catch(err => {
      console.error('静默加载 Vosk 模型失败:', err);
    });

    context.registerHook('speech.stream.start', async (options: { sampleRate: number, onResult?: (text: string) => void, onPartial?: (text: string) => void }) => {
      try {
        const { sampleRate, onResult, onPartial } = options;
        const m = await initModel(true); // 钩子调用时如果还没加载完，则静默等待或显示
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
