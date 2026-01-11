import { Plugin, PluginContext } from './types'
import { createModelScope } from './modelscope-provider'
import { z } from 'zod'
import { ModelScopeImageModel } from './modelscope-image-model'

/**
 * ModelScope AI Provider Plugin
 */
const plugin: Plugin = {
  name: 'modelscope-plugin',
  version: '1.0.0',
  description: 'ModelScope AIGC Image Generation Plugin',
  author: 'Zhuanz',

  install: async (context: PluginContext) => {
    // 注册内置工具
    context.registerBuiltinTool('modelscope_image_generator', {
      description: '使用 ModelScope AIGC 模型生成图片。支持多种模型，可以指定提示词、图片尺寸等参数。',
      inputSchema: z.object({
        prompt: z.string().describe('生成图片的正向提示词，建议使用英文描述以获得更好效果。'),
        negative_prompt: z.string().optional().describe('负向提示词，用于排除不需要的元素。'),
        model: z.string().optional().default('Qwen/Qwen-Image').describe('要使用的模型 ID，默认为 Qwen/Qwen-Image。'),
        size: z.string().optional().default('1024x1024').describe('生成图片的尺寸，如 1024x1024, 720x1280 等。'),
        seed: z.number().optional().describe('随机种子，用于复现生成的图片。')
      }),
      title: 'ModelScope 绘图',
      execute: async (args: any) => {
        const { prompt, negative_prompt, model: modelId, size, seed } = args;
        debugger
        try {
          // 获取设置 store 以读取 API Key
          const settingsStore = await context.getStore('settings');
          const providers = settingsStore.getAllProviders;
          const provider = providers.find((p: any) => p.id === '魔搭' || p.providerType === 'modelscope');

          if (!provider || !provider.apiKey) {
            throw new Error('请先在“设置 -> 模型提供商”中配置 ModelScope 的 API Key (SDK Token)');
          }

          const apiKey = provider.apiKey;
          const baseURL = provider.baseURL || 'https://api-inference.modelscope.cn/';

          // 创建模型实例
          const model = new ModelScopeImageModel(modelId || 'Qwen/Qwen-Image', {
            apiKey,
            baseURL
          });

          // 显示生成状态
          context.notification.status('modelscope-gen', '正在通过 ModelScope 生成图片...', {
            icon: 'Loading',
            color: 'var(--color-primary)'
          });

          // 执行生成
          const result = await model.doGenerate({
            prompt,
            n: 1,
            size,
            seed,
            aspectRatio: undefined,
            providerOptions: {
              modelscope: {
                negative_prompt
              }
            }
          });

          context.notification.removeStatus('modelscope-gen');

          // 返回结果
          // 我们可以返回 markdown 格式的图片预览，也可以尝试直接返回图片对象
          const images = result.images;
          if (images && images.length > 0) {
            const report = images.map((base64, index) => {
              return `![Generated Image ${index + 1}](data:image/png;base64,${base64})`;
            }).join('\n\n');

            return {
              toolResult: {
                content: [
                  {
                    type: 'text',
                    text: `图片生成成功！\n\n${report}`
                  }
                ]
              }
            };
          } else {
            throw new Error('模型未返回任何图片数据');
          }
        } catch (error: any) {
          context.notification.removeStatus('modelscope-gen');
          context.notification.error(`图片生成失败: ${error.message}`);
          return {
            toolResult: {
              content: [
                {
                  type: 'text',
                  text: `图片生成失败: ${error.message}`
                }
              ]
            }
          };
        }
      }
    });

    // 注册到全局模型注册表
    context.registerRegistry('modelscope', (options: any) => {
      return createModelScope(options);
    });
  },

  uninstall: (context: PluginContext) => {
    // 卸载逻辑
    context.unregisterProvider('modelscope');
  }
}

export default plugin;
