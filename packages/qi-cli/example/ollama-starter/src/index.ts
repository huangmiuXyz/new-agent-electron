import { Plugin } from './types';

const plugin: Plugin = {
  name: 'ollama-starter',
  version: '1.0.0',
  description: 'ollama-starter 插件',

  async install(context) {
    // 1. 注册表单字段，用于在 Ollama 提供商设置中显示“自动启动”开关
    context.registerHook('provider:form-fields', () => {
      return [
        {
          name: 'autoStartOllama',
          type: 'boolean',
          label: '自动启动'
        }
      ].map((e) => ({
        ...e,
        ifShow: (provider: any) => provider.providerType === 'ollama'
      }))
    });

    // 2. 注册 AI 使用前的钩子，实现自动启动逻辑
    context.registerHook('ai:before-use', async (params: any) => {
      const { providerType, baseURL } = params;

      // 仅处理 Ollama 提供商
      if (providerType !== 'ollama') return;

      // 获取设置存储，检查是否开启了自动启动
      const settingsStore = await context.getStore('settings');
      // 查找当前使用的 Ollama 提供商配置
      const provider = settingsStore.providers.find((p: any) =>
        p.providerType === 'ollama' && p.baseUrl === baseURL
      );

      if (provider && provider.autoStartOllama) {
        const isOllamaRunning = async () => {
          try {
            // 移除末尾斜杠以确保 URL 正确
            const baseUrlClean = (baseURL || '').replace(/\/$/, '');
            if (!baseUrlClean) return false;
            const res = await fetch(`${baseUrlClean}/models`);
            return res.ok;
          } catch (e) {
            return false;
          }
        };

        if (!(await isOllamaRunning())) {
          context.notification.info('正在尝试启动 Ollama...', 'Ollama 启动器');

          if (context.api && context.api.spawn && context.api.os) {
            const platform = context.api.os.platform();
            if (platform === 'darwin') {
              context.api.spawn('open', ['-a', 'Ollama'], {
                detached: true,
                stdio: 'ignore'
              });
            } else if (platform === 'win32') {
              context.api.spawn('cmd', ['/c', 'start', 'ollama', 'run'], {
                detached: true,
                stdio: 'ignore'
              });
            } else {
              context.api.spawn('ollama', ['serve'], {
                detached: true,
                stdio: 'ignore'
              });
            }

            // 等待 Ollama 启动，最多重试 10 次，每次 2 秒
            let retry = 0;
            let started = false;
            while (retry < 10) {
              await new Promise((resolve) => setTimeout(resolve, 2000));
              if (await isOllamaRunning()) {
                started = true;
                break;
              }
              retry++;
            }

            if (started) {
              context.notification.success('Ollama 已成功启动', 'Ollama 启动器');
            } else {
              context.notification.error('Ollama 启动超时，请手动检查', 'Ollama 启动器');
            }
          } else {
            context.notification.error('未找到启动 Ollama 的 API', 'Ollama 启动器');
          }
        }
      }
    });

    console.log('ollama-starter plugin installed successfully!');
  },

  async uninstall(context) {
    // 注销内置工具（可选，如果插件注册了内置工具）
    context.unregisterBuiltinTool('ollama-starter.example');

    console.log('ollama-starter plugin uninstalled!');
  }
};

export default plugin;
