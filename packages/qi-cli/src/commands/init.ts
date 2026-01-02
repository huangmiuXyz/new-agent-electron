import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 插件模板信息
 */
interface TemplateInfo {
  name: string;
  value: string;
  description: string;
}

/**
 * 默认模板 (当无法从 example 目录读取时使用)
 */
const DEFAULT_TEMPLATES: TemplateInfo[] = [
  { name: '基础模板 (TypeScript)', value: 'ollama-starter', description: '简单的 TypeScript 插件模板，包含基础钩子示例' },
  { name: '工具模板 (智能密钥填充)', value: 'smart-api-key-filler', description: '包含自定义工具和设置存储交互的模板' },
  { name: 'React 模板 (语音识别)', value: 'vosk-speech-recognition', description: '支持 React UI 和复杂交互的模板' }
];

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
 * 递归复制目录并替换模板变量
 */
async function copyTemplateDir(
  src: string,
  dest: string,
  variables: Record<string, string>
): Promise<void> {
  await ensureDir(dest);
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    // 跳过不需要复制的文件和目录
    if (
      entry.name === 'node_modules' ||
      entry.name === 'dist' ||
      entry.name === '.git' ||
      entry.name.endsWith('.qi') ||
      entry.name === 'package-lock.json' ||
      entry.name === 'pnpm-lock.yaml'
    ) {
      continue;
    }

    if (entry.isDirectory()) {
      await copyTemplateDir(srcPath, destPath, variables);
    } else {
      // 检查是否为文本文件
      const ext = path.extname(entry.name).toLowerCase();
      const isBinary = [
        '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.tar', '.gz', '.qi'
      ].includes(ext);

      if (isBinary) {
        await fs.copyFile(srcPath, destPath);
      } else {
        let content = await fs.readFile(srcPath, 'utf8');

        // 替换模板变量
        content = replaceTemplate(content, variables);

        // 特殊处理 package.json
        if (entry.name === 'package.json') {
          try {
            const pkg = JSON.parse(content);
            pkg.name = variables.pluginName;
            pkg.description = variables.description;
            pkg.author = variables.author;
            pkg.version = variables.version;
            content = JSON.stringify(pkg, null, 2);
          } catch (e) {
            // 如果 JSON 解析失败，则保持原样
          }
        }

        // 特殊处理 info.json
        if (entry.name === 'info.json') {
          try {
            const info = JSON.parse(content);
            info.name = variables.pluginName;
            info.description = variables.description;
            info.author = variables.author;
            info.version = variables.version;
            content = JSON.stringify(info, null, 2);
          } catch (e) {
            // 如果 JSON 解析失败，则保持原样
          }
        }

        await fs.writeFile(destPath, content);
      }
    }
  }
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
    const spinner = ora('正在初始化...').start();

    try {
      // 确定模板目录路径
      // 在开发环境下，example 目录在 ../../example
      // 在编译后的环境下，也应该在相同相对位置
      let exampleDir = path.resolve(__dirname, '../../example');

      // 检查目录是否存在，如果不存在尝试其他可能路径
      try {
        await fs.access(exampleDir);
      } catch {
        // 兜底路径
        exampleDir = path.resolve(process.cwd(), 'packages/qi-cli/example');
      }

      let templates: TemplateInfo[] = [];
      try {
        const dirs = await fs.readdir(exampleDir, { withFileTypes: true });
        for (const dir of dirs) {
          if (dir.isDirectory()) {
            const infoPath = path.join(exampleDir, dir.name, 'info.json');
            try {
              const info = JSON.parse(await fs.readFile(infoPath, 'utf8'));
              templates.push({
                name: `${info.name} (${info.description || '无描述'})`,
                value: dir.name,
                description: info.description || ''
              });
            } catch {
              templates.push({
                name: dir.name,
                value: dir.name,
                description: ''
              });
            }
          }
        }
      } catch (err) {
        templates = DEFAULT_TEMPLATES;
      }

      spinner.stop();

      // 如果没有提供名称，通过交互式询问
      let pluginName = name;
      if (!pluginName) {
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
      }

      if (!pluginName) {
        console.error(chalk.red('插件名称不能为空'));
        process.exit(1);
      }

      // 询问其他信息
      const promptQuestions: any[] = [];
      if (!options.description) {
        promptQuestions.push({
          type: 'input',
          name: 'description',
          message: '请输入插件描述:',
          default: `${pluginName} 插件`
        });
      }
      if (!options.author) {
        promptQuestions.push({
          type: 'input',
          name: 'author',
          message: '请输入作者名称:',
          default: ''
        });
      }
      promptQuestions.push({
        type: 'list',
        name: 'templateName',
        message: '请选择插件模板:',
        choices: templates
      });

      const answers = await inquirer.prompt(promptQuestions);
      const description = options.description || answers.description;
      const author = options.author || answers.author;
      const templateName = answers.templateName;

      spinner.text = '正在从模板创建项目...';
      spinner.start();

      const variables: Record<string, string> = {
        pluginName: pluginName as string,
        version: String(options.version),
        description: description || '',
        author: author || ''
      };

      // 创建项目目录
      const projectDir = path.join(process.cwd(), pluginName as string);
      const templateSrcDir = path.join(exampleDir, templateName);

      // 检查模板目录是否存在
      try {
        await fs.access(templateSrcDir);
      } catch {
        spinner.fail(chalk.red(`找不到模板目录: ${templateSrcDir}`));
        process.exit(1);
      }

      // 复制模板并替换变量
      await copyTemplateDir(templateSrcDir, projectDir, variables);

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
