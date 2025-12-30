import { Plugin } from './types';

const plugin: Plugin = {
  name: 'smart-api-key-filler',
  version: '1.0.0',
  description: '批量填充提供商API密钥，支持一次性填充多个提供商的密钥',

  async install(context) {
    // 注册内置工具
    context.registerBuiltinTool('smartApiKeyFiller', {
      description: '批量填充提供商API密钥，支持一次性填充多个提供商的密钥',
      inputSchema: {
        type: 'object',
        properties: {
          providers: {
            type: 'array',
            description: '提供商密钥数组，用于批量填充',
            items: {
              type: 'object',
              properties: {
                providerId: {
                  type: 'string',
                  description: '提供商ID，只能从预定义的提供商列表中选择'
                },
                apiKey: {
                  type: 'string',
                  description: 'API密钥'
                }
              },
              required: ['providerId', 'apiKey']
            }
          },
          updateSettings: {
            type: 'boolean',
            description: '是否更新到设置中，默认为true'
          }
        },
        required: ['providers']
      },
      title: '智能密钥填充器',
      execute: async (args: unknown) => {
        const params = args as Record<string, any>;
        const { providers, updateSettings = true } = params;

        if (!providers || !Array.isArray(providers) || providers.length === 0) {
          throw new Error('必须提供提供商密钥数组');
        }

        try {
          const settingsStore = await context.getStore('settings');
          const results: any[] = [];

          for (const providerInfo of providers) {
            const { providerId, apiKey } = providerInfo;

            if (!providerId) {
              results.push({
                providerId: '未知',
                success: false,
                message: '提供商ID不能为空'
              });
              continue;
            }

            if (!apiKey) {
              results.push({
                providerId,
                success: false,
                message: 'API密钥不能为空'
              });
              continue;
            }

            const provider = settingsStore.providers.find((p: any) => p.id === providerId);

            if (!provider) {
              results.push({
                providerId,
                success: false,
                message: `未找到ID为"${providerId}"的提供商`
              });
              continue;
            }

            let updateResult = '';
            if (updateSettings) {
              const updatedProvider = {
                ...provider,
                apiKey: apiKey
              };
              settingsStore.updateProvider(providerId, updatedProvider);
              updateResult = '已成功更新提供商设置';
            }

            results.push({
              providerId,
              providerName: provider.name,
              success: true,
              settingsUpdated: updateSettings ? '已更新' : '未更新',
              updateResult
            });
          }

          // 生成结果报告
          const successCount = results.filter((r) => r.success).length;
          const totalCount = results.length;

          let report = `密钥填充处理完成：\n`;
          report += `- 总处理数: ${totalCount}\n`;
          report += `- 成功数: ${successCount}\n`;
          report += `- 失败数: ${totalCount - successCount}\n\n`;

          report += `详细结果：\n`;
          results.forEach((result, index) => {
            report += `${index + 1}. 提供商: ${result.providerName} (${result.providerId})\n`;
            report += `   处理状态: ${result.success ? '成功' : '失败'}\n`;
            report += `   设置更新: ${result.settingsUpdated}\n`;
            if (result.updateResult) {
              report += `   更新结果: ${result.updateResult}\n`;
            }
            if (!result.success) {
              report += `   错误信息: ${result.message}\n`;
            }
            report += `\n`;
          });

          return {
            toolResult: {
              content: [
                {
                  type: 'text',
                  text: report
                }
              ]
            }
          };
        } catch (error) {
          return {
            toolResult: {
              content: [
                {
                  type: 'text',
                  text: `密钥填充失败: ${(error as Error).message}`
                }
              ]
            }
          };
        }
      }
    });

    console.log('smart-api-key-filler plugin installed successfully!');
  },

  async uninstall(context) {
    console.log('smart-api-key-filler plugin uninstalled!');
  }
};

export default plugin;
