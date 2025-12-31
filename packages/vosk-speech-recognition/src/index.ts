import { Plugin } from './types';
import * as Vosk from 'vosk-browser';

let model: Vosk.Model | null = null;
let recognizer: Vosk.KaldiRecognizer | null = null;

const plugin: Plugin = {
  name: 'vosk-speech-recognition',
  version: '1.0.0',
  description: 'Vosk 实时语音识别插件',

  async install(context) {
    console.log('Vosk Speech Recognition 插件已安装');

    // 初始化模型
    const initModel = async () => {
      try {
        if (model) return model;

        if (!context.api) {
          throw new Error('应用 API 未就绪');
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
        // 注意：Vosk.createModel 是异步的，加载完后模型数据已经进入 WASM 内存或 IndexedDB
        URL.revokeObjectURL(modelUrl);

        return model;
      } catch (err) {
        console.error('Vosk 模型加载失败:', err);
        throw err;
      }
    };

    // 注册开始识别钩子
    context.registerHook('speech.stream.start', async (options: { sampleRate: number, onResult?: (text: string) => void, onPartial?: (text: string) => void }) => {
      try {
        const { sampleRate, onResult, onPartial } = options;
        const m = await initModel();
        if (recognizer) {
          recognizer.remove();
        }
        recognizer = new m.KaldiRecognizer(sampleRate);

        // 设置识别结果回调
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

    // 注册流式数据钩子
    context.registerHook('speech.stream.data', async (options: { data: Float32Array, sampleRate: number }) => {
      if (recognizer) {
        // 在 vosk-browser 0.0.8 中，Float32Array 应该使用 acceptWaveformFloat
        recognizer.acceptWaveformFloat(options.data, options.sampleRate);
      }
    });

    // 注册停止识别钩子
    context.registerHook('speech.stream.stop', async () => {
      if (recognizer) {
        // 在 vosk-browser 中，停止时通常直接 remove 即可
        // 如果有最终结果，会在 remove 之前通过事件发出
        recognizer.remove();
        recognizer = null;
        return { success: true };
      }
      return null;
    });

    context.registerHook('speech.recognize', async () => {
      try {
        await initModel();
        // ... 原本的逻辑 ...
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
