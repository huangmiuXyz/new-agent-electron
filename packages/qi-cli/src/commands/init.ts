import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import path from 'path';

/**
 * 插件模板内容 (TypeScript)
 */
const PLUGIN_TEMPLATE = `import { Plugin } from './types';

const plugin: Plugin = {
  name: '{{pluginName}}',
  version: '{{version}}',
  description: '{{description}}',

  async install(context) {
    // 注册命令示例
    context.registerCommand('{{pluginName}}.hello', async () => {
      const message = 'Hello from {{pluginName}} plugin!';
      console.log(message);

      // 使用通知示例
      context.notification.success(message, '来自插件的消息');

      return message;
    });

    // 注册内置工具示例
    context.registerBuiltinTool('{{pluginName}}.example', {
      description: '示例工具',
      title: '示例工具',
      execute: async (args: any) => {
        const { message = '默认消息' } = args;

        return {
          toolResult: {
            content: [
              {
                type: 'text',
                text: \`处理成功: \${message}\`
              }
            ]
          }
        };
      }
    });

    // 注册钩子示例
    context.registerHook('before.chat', async (data: any) => {
      console.log('Before chat hook triggered');
      return data;
    });

    context.notification.info('{{pluginName}} 插件已成功安装！', '插件系统');
    console.log('{{pluginName}} plugin installed successfully!');
  },

  async uninstall(context) {
    // 注销内置工具（可选，如果插件注册了内置工具）
    context.unregisterBuiltinTool('{{pluginName}}.example');

    console.log('{{pluginName}} plugin uninstalled!');
  }
};

export default plugin;
`;

/**
 * 插件模板内容 (React TSX)
 */
const PLUGIN_REACT_TEMPLATE = `import { Plugin } from './types';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

/**
 * 渲染 React 组件为 HTML 字符串
 * 用于 context.notification.status 等接口
 */
const renderToHtml = (element: React.ReactElement): string => {
  const container = document.createElement('div');
  const root = createRoot(container);

  flushSync(() => {
    root.render(element);
  });

  const html = container.innerHTML;
  root.unmount();

  return html;
};

// 示例状态图标组件
const StatusIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
    <circle cx="12" cy="12" r="10" fill="#4caf50" />
  </svg>
);

const plugin: Plugin = {
  name: '{{pluginName}}',
  version: '{{version}}',
  description: '{{description}}',

  async install(context) {
    // 注册一个带图标的状态栏项
    context.notification.status('{{pluginName}}-status', '', {
      html: renderToHtml(<StatusIcon />),
      tooltip: '{{pluginName}} 插件已就绪'
    });

    // 注册命令示例
    context.registerCommand('{{pluginName}}.hello', async () => {
      const message = 'Hello from {{pluginName}} React plugin!';
      context.notification.success(message, '来自插件的消息');
      return message;
    });

    context.notification.info('{{pluginName}} React 插件已成功安装！', '插件系统');
  },

  async uninstall(context) {
    context.notification.removeStatus('{{pluginName}}-status');
    console.log('{{pluginName}} plugin uninstalled!');
  }
};

export default plugin;
`;

/**
 * 语音识别插件模板 (React TSX)
 */
const PLUGIN_SPEECH_TEMPLATE = `import { Plugin } from './types';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

const renderToHtml = (element: React.ReactElement): string => {
  const container = document.createElement('div');
  const root = createRoot(container);
  flushSync(() => { root.render(element); });
  const html = container.innerHTML;
  root.unmount();
  return html;
};

const MicIcon: React.FC<{ active: boolean }> = ({ active }) => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill={active ? "#f44336" : "currentColor"}>
    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
  </svg>
);

const plugin: Plugin = {
  name: '{{pluginName}}',
  version: '{{version}}',
  description: '{{description}}',

  async install(context) {
    // 初始化状态
    context.notification.status('{{pluginName}}-status', '', {
      html: renderToHtml(<MicIcon active={false} />),
      tooltip: '语音识别就绪'
    });

    // 注册语音识别开始钩子
    context.registerHook('speech.stream.start', async (options: { sampleRate: number, onResult?: (text: string) => void, onPartial?: (text: string) => void }) => {
      console.log('Speech recognition starting...', options);

      context.notification.status('{{pluginName}}-status', '', {
        html: renderToHtml(<MicIcon active={true} />),
        tooltip: '正在录音...'
      });

      return { success: true };
    });

    // 注册音频数据处理钩子
    context.registerHook('speech.stream.data', async (options: { data: Float32Array, sampleRate: number }) => {
      // 在这里处理音频数据 (options.data)
      // 例如发送给语音识别引擎
    });

    // 注册语音识别停止钩子
    context.registerHook('speech.stream.stop', async () => {
      console.log('Speech recognition stopped');

      context.notification.status('{{pluginName}}-status', '', {
        html: renderToHtml(<MicIcon active={false} />),
        tooltip: '语音识别就绪'
      });

      return { success: true };
    });

    context.notification.info('语音识别插件 {{pluginName}} 已就绪', '插件系统');
  },

  async uninstall(context) {
    context.notification.removeStatus('{{pluginName}}-status');
  }
};

export default plugin;
`;

/**
 * 类型定义文件内容
 */
const TYPES_TEMPLATE = `/**
 * 插件接口定义
 * 所有插件必须实现此接口
 */
export interface Plugin {
  /** 插件名称，必须唯一 */
  name: string;
  /** 插件版本 */
  version?: string;
  /** 插件描述 */
  description?: string;
  /** 插件安装函数，在插件加载时调用 */
  install: (context: PluginContext) => void | Promise<void>;
  /** 插件卸载函数，在插件卸载时调用 */
  uninstall?: (context: PluginContext) => void | Promise<void>;
}

/**
 * 插件上下文
 * 提供给插件的应用上下文和 API
 */
export interface PluginContext {
  /** 应用实例 */
  app: any;
  /** Electron API */
  api: any;
  /** Pinia 实例 */
  pinia: any;
  /** 插件根路径 */
  basePath: string;
  /** 注册命令 */
  registerCommand: (name: string, handler: Function) => void;
  /** 注册钩子 */
  registerHook: (name: string, handler: Function) => void;
  /** 获取 store */
  getStore: (storeName: string) => Promise<any>;
  /** 通知接口 */
  notification: {
    info: (content: string, title?: string, duration?: number) => () => void;
    success: (content: string, title?: string, duration?: number) => () => void;
    error: (content: string, title?: string, duration?: number) => () => void;
    warning: (content: string, title?: string, duration?: number) => () => void;
    loading: (content: string, title?: string, duration?: number) => () => void;
    status: (id: string, text: string, options?: {
      icon?: string;
      html?: string;
      color?: string;
      tooltip?: string;
      pluginName?: string;
    }) => void;
    removeStatus: (id: string) => void;
  };
  /** 注册内置工具 */
  registerBuiltinTool: (name: string, tool: any) => void;
  /** 注销内置工具 */
  unregisterBuiltinTool: (name: string) => boolean;
}
`;

/**
 * info.json 模板
 */
const INFO_JSON_TEMPLATE = `{
  "name": "{{pluginName}}",
  "version": "{{version}}",
  "description": "{{description}}",
  "author": "{{author}}",
  "main": "index.js",
  "extraAssets": []
}
`;

/**
 * README 模板
 */
const README_TEMPLATE = `# {{pluginName}}

{{description}}

## 安装

将 .qi 文件拖拽到 Qi 应用的插件管理界面进行安装。

## 开发

\`\`\`bash
# 构建
qi code build

# 测试
# 将构建后的 .qi 文件安装到 Qi 应用进行测试
\`\`\`

## 插件 API

### PluginContext

插件通过 \`install\` 函数接收 \`PluginContext\` 对象，包含以下属性：

- \`app\`: 应用实例
- \`pinia\`: Pinia 实例
- \`registerCommand(name, handler)\`: 注册命令
- \`registerHook(name, handler)\`: 注册钩子
- \`getStore(storeName)\`: 获取 store
- \`registerBuiltinTool(name, tool)\`: 注册内置工具
- \`unregisterBuiltinTool(name)\`: 注销内置工具（返回是否成功）

### 可用的 Store

- \`notes\`: 笔记 store
- \`chats\`: 聊天 store
- \`settings\`: 设置 store
- \`knowledge\`: 知识库 store
- \`agent\`: Agent store

### 可用的钩子

- \`before.chat\`: 聊天前触发
- \`after.chat\`: 聊天后触发
- \`before.message\`: 消息前触发
- \`after.message\`: 消息后触发

### 语音识别钩子 (可选)

如果你的插件实现了语音识别功能，可以使用以下钩子：

- \`speech.stream.start\`: 语音识别开始
- \`speech.stream.data\`: 音频数据流 (Float32Array)
- \`speech.stream.stop\`: 语音识别停止
- \`speech.recognize\`: 单次语音识别
`;

/**
 * 递归创建目录
 */
async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

/**
 * 替换模板变量
 */
function replaceTemplate(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }
  return result;
}

/**
 * 初始化命令
 */
export const initCommand = new Command('init')
  .description('创建一个新的插件项目')
  .option('-d, --description <description>', '插件描述')
  .option('-a, --author <author>', '插件作者')
  .option('-v, --version <version>', '插件版本', '1.0.0')
  .argument('[name]', '插件名称')
  .action(async (name: string | undefined, options: any) => {
    const spinner = ora('正在创建插件项目...').start();

    try {
      // 如果没有提供名称，通过交互式询问
      let pluginName = name;
      if (!pluginName) {
        spinner.stop();
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'pluginName',
            message: '请输入插件名称:',
            validate: (input: string) => {
              if (!input.trim()) {
                return '插件名称不能为空';
              }
              if (!/^[a-z0-9-]+$/.test(input)) {
                return '插件名称只能包含小写字母、数字和连字符';
              }
              return true;
            }
          }
        ]);
        pluginName = answers.pluginName;
        spinner.start();
      }

      if (!pluginName) {
        spinner.fail(chalk.red('插件名称不能为空'));
        process.exit(1);
      }

      // 询问其他信息（如果没有通过选项提供）
      let description = options.description;
      let author = options.author;
      let pluginType = 'basic';
      let isReact = false;

      spinner.stop();
      const promptQuestions: any[] = [];
      if (!description) {
        promptQuestions.push({
          type: 'input',
          name: 'description',
          message: '请输入插件描述:',
          default: `${pluginName} 插件`
        });
      }
      if (!author) {
        promptQuestions.push({
          type: 'input',
          name: 'author',
          message: '请输入作者名称:',
          default: ''
        });
      }
      promptQuestions.push({
        type: 'list',
        name: 'pluginType',
        message: '请选择插件模板类型:',
        choices: [
          { name: '基础模板 (TypeScript)', value: 'basic' },
          { name: 'React 模板 (支持自定义 UI 状态)', value: 'react' },
          { name: '语音识别模板 (参考 Vosk 插件实现)', value: 'speech' }
        ]
      });

      const answers = await inquirer.prompt(promptQuestions);
      description = description || answers.description;
      author = author || answers.author;
      pluginType = answers.pluginType;
      isReact = pluginType === 'react' || pluginType === 'speech';
      spinner.start();

      const variables: Record<string, string> = {
        pluginName,
        version: String(options.version),
        description: description || '',
        author: author || ''
      };

      // 创建项目目录
      const projectDir = path.join(process.cwd(), pluginName);
      await ensureDir(projectDir);

      // 创建 src 目录
      const srcDir = path.join(projectDir, 'src');
      await ensureDir(srcDir);

      // 确定主入口文件名和模板
      const extension = isReact ? 'tsx' : 'ts';
      const mainFile = `index.${extension}`;
      let selectedTemplate = PLUGIN_TEMPLATE;
      if (pluginType === 'react') {
        selectedTemplate = PLUGIN_REACT_TEMPLATE;
      } else if (pluginType === 'speech') {
        selectedTemplate = PLUGIN_SPEECH_TEMPLATE;
      }

      // 写入文件
      await fs.writeFile(
        path.join(srcDir, mainFile),
        replaceTemplate(selectedTemplate, variables)
      );

      await fs.writeFile(
        path.join(srcDir, 'types.ts'),
        TYPES_TEMPLATE
      );

      await fs.writeFile(
        path.join(projectDir, 'info.json'),
        replaceTemplate(INFO_JSON_TEMPLATE, variables)
      );

      await fs.writeFile(
        path.join(projectDir, 'README.md'),
        replaceTemplate(README_TEMPLATE, variables)
      );

      // 生成 vite.config.ts
      const viteConfig = `import { defineConfig } from 'vite';
import { resolve } from 'path';
${isReact ? "import react from '@vitejs/plugin-react';" : ""}

export default defineConfig({
  ${isReact ? "plugins: [react()]," : ""}
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'process.env': JSON.stringify({ NODE_ENV: 'production' }),
    'process.emit': 'undefined'
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/${mainFile}'),
      name: 'plugin',
      fileName: 'index',
      formats: ['iife']
    },
    rollupOptions: {
      output: {
        dir: 'dist',
        entryFileNames: 'index.js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]',
        inlineDynamicImports: true
      }
    },
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
    target: 'esnext'
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
});
`;
      await fs.writeFile(path.join(projectDir, 'vite.config.ts'), viteConfig);

      // 生成 tsconfig.json
      const tsconfig: any = {
        compilerOptions: {
          target: 'ES2022',
          module: 'ES2022',
          lib: ['ES2022', 'DOM', 'DOM.Iterable'],
          moduleResolution: 'node',
          outDir: './dist',
          rootDir: './src',
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
          declaration: false,
          sourceMap: false
        },
        include: ['src/**/*'],
        exclude: ['node_modules', 'dist']
      };

      if (isReact) {
        tsconfig.compilerOptions.jsx = 'react-jsx';
      }

      await fs.writeFile(
        path.join(projectDir, 'tsconfig.json'),
        JSON.stringify(tsconfig, null, 2)
      );

      // 生成 package.json
      const pkg: any = {
        name: variables.pluginName,
        version: variables.version,
        description: variables.description,
        author: variables.author,
        main: 'dist/index.js',
        scripts: {
          build: 'vite build',
          'build:watch': 'vite build --watch'
        },
        dependencies: {},
        devDependencies: {
          typescript: '^5.9.2',
          vite: '^5.0.0'
        }
      };

      if (isReact) {
        pkg.dependencies.react = '^19.2.3';
        pkg.dependencies['react-dom'] = '^19.2.3';
        pkg.devDependencies['@types/react'] = '^19.2.7';
        pkg.devDependencies['@types/react-dom'] = '^19.2.3';
        pkg.devDependencies['@vitejs/plugin-react'] = '^5.1.2';
      }

      await fs.writeFile(
        path.join(projectDir, 'package.json'),
        JSON.stringify(pkg, null, 2)
      );

      // 创建 .gitignore
      await fs.writeFile(
        path.join(projectDir, '.gitignore'),
        `node_modules
dist
*.log
.DS_Store
`
      );

      spinner.succeed(chalk.green(`插件项目 "${pluginName}" 创建成功！`));

      console.log('');
      console.log(chalk.bold('下一步：'));
      console.log(`  ${chalk.cyan('cd')} ${pluginName}`);
      console.log(`  ${chalk.cyan('npm install')}`);
      console.log(`  ${chalk.cyan('npm run build')}`);
      console.log(`  ${chalk.cyan('qi code build')}  # 构建 .qi 插件文件`);
      console.log('');
    } catch (error) {
      spinner.fail(chalk.red('创建插件项目失败'));
      if (error instanceof Error) {
        console.error(chalk.red(error.message));
      }
      process.exit(1);
    }
  });
