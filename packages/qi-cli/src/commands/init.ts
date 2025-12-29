import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 插件模板内容
 */
const PLUGIN_TEMPLATE = `import { Plugin } from './types';

const plugin: Plugin = {
  name: '{{pluginName}}',
  version: '{{version}}',
  description: '{{description}}',

  async install(context) {
    // 注册命令示例
    context.registerCommand('{{pluginName}}.hello', async () => {
      console.log('Hello from {{pluginName}} plugin!');
      return 'Hello from {{pluginName}} plugin!';
    });

    // 注册钩子示例
    context.registerHook('before.chat', async (data: any) => {
      console.log('Before chat hook triggered');
      return data;
    });

    console.log('{{pluginName}} plugin installed successfully!');
  },

  async uninstall(context) {
    console.log('{{pluginName}} plugin uninstalled!');
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
  /** Pinia 实例 */
  pinia: any;
  /** 注册命令 */
  registerCommand: (name: string, handler: Function) => void;
  /** 注册钩子 */
  registerHook: (name: string, handler: Function) => void;
  /** 获取 store */
  getStore: (storeName: string) => Promise<any>;
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
  "main": "index.js"
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

      if (!description || !author) {
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
        const answers = await inquirer.prompt(promptQuestions);
        description = description || answers.description;
        author = author || answers.author;
        spinner.start();
      }

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

      // 写入文件
      await fs.writeFile(
        path.join(srcDir, 'index.ts'),
        replaceTemplate(PLUGIN_TEMPLATE, variables)
      );

      await fs.writeFile(
        path.join(srcDir, 'types.ts'),
        TYPES_TEMPLATE
      );

      await fs.writeFile(
        path.join(projectDir, 'info.json'),
        JSON.stringify(
          {
            name: variables.pluginName,
            version: variables.version,
            description: variables.description,
            author: variables.author,
            main: 'index.js'
          },
          null,
          2
        )
      );

      await fs.writeFile(
        path.join(projectDir, 'README.md'),
        replaceTemplate(README_TEMPLATE, variables)
      );

      await fs.writeFile(
        path.join(projectDir, 'tsconfig.json'),
        JSON.stringify(
          {
            compilerOptions: {
              target: 'ES2022',
              module: 'ES2022',
              lib: ['ES2022'],
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
          },
          null,
          2
        )
      );

      await fs.writeFile(
        path.join(projectDir, 'package.json'),
        JSON.stringify(
          {
            name: variables.pluginName,
            version: variables.version,
            description: variables.description,
            author: variables.author,
            main: 'dist/index.js',
            scripts: {
              build: 'tsc',
              'build:watch': 'tsc --watch'
            },
            devDependencies: {
              typescript: '^5.9.2'
            }
          },
          null,
          2
        )
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
