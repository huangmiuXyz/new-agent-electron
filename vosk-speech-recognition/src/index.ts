import { Plugin } from './types';

const plugin: Plugin = {
  name: 'vosk-speech-recognition',
  version: '1.0.0',
  description: 'Vosk 语音识别插件',

  async install(context) {
    // 注册语音识别钩子
    context.registerHook('speech.recognize', async (audio: Blob) => {
      console.log('Vosk 正在处理语音音频...', {
        size: audio.size,
        type: audio.type
      });

      return `[Vosk] 识别结果: 这是一段模拟文本 (音频大小: ${(audio.size / 1024).toFixed(2)} KB)`;
    });
  },

  async uninstall(context) {
    console.log('Vosk Speech Recognition 插件已卸载');
  }
};

export default plugin;
