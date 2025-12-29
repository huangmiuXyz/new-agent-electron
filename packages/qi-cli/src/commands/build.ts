import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import path from 'path';
import JSZip from 'jszip';

/**
 * 构建命令
 */
export const buildCommand = new Command('build')
  .description('构建插件为 .qi 文件')
  .option('-o, --output <path>', '输出文件路径')
  .option('-w, --watch', '监听文件变化自动重新构建')
  .action(async (options: any) => {
    const spinner = ora('正在构建插件...').start();

    try {
      // 查找 info.json
      const infoJsonPath = await findInfoJson(process.cwd());
      if (!infoJsonPath) {
        spinner.fail(chalk.red('未找到 info.json 文件，请在插件项目根目录下运行此命令'));
        process.exit(1);
      }

      // 读取插件信息
      const infoContent = await fs.readFile(infoJsonPath, 'utf-8');
      const info = JSON.parse(infoContent);

      if (!info.name) {
        spinner.fail(chalk.red('info.json 中缺少 name 字段'));
        process.exit(1);
      }

      // 检查 dist 目录是否存在
      const distDir = path.join(path.dirname(infoJsonPath), 'dist');
      try {
        await fs.access(distDir);
      } catch {
        spinner.fail(
          chalk.red('dist 目录不存在，请先运行 npm run build 编译插件')
        );
        process.exit(1);
      }

      // 检查 index.js 是否存在
      const mainFile = info.main || 'index.js';
      const mainFilePath = path.join(distDir, mainFile);
      try {
        await fs.access(mainFilePath);
      } catch {
        spinner.fail(
          chalk.red(`未找到 ${mainFile}，请确保已编译插件`)
        );
        process.exit(1);
      }

      // 创建 ZIP 文件
      const zip = new JSZip();

      // 添加 info.json
      zip.file('info.json', infoContent);

      // 添加主文件
      const mainFileContent = await fs.readFile(mainFilePath);
      zip.file('index.js', mainFileContent);

      // 添加其他 .js 文件（如果存在）
      const distFiles = await fs.readdir(distDir);
      for (const file of distFiles) {
        if (file.endsWith('.js') && file !== mainFile) {
          const filePath = path.join(distDir, file);
          const content = await fs.readFile(filePath);
          zip.file(file, content);
        }
      }

      // 生成输出文件名
      const outputFileName = options.output || `${info.name}.qi`;
      const outputPath = path.resolve(process.cwd(), outputFileName);

      // 生成 ZIP
      const buffer = await zip.generateAsync({ type: 'nodebuffer' });
      await fs.writeFile(outputPath, buffer);

      spinner.succeed(
        chalk.green(`插件构建成功！输出文件: ${outputPath}`)
      );

      // 显示文件信息
      const stats = await fs.stat(outputPath);
      console.log('');
      console.log(chalk.bold('插件信息:'));
      console.log(`  ${chalk.cyan('名称:')} ${info.name}`);
      console.log(`  ${chalk.cyan('版本:')} ${info.version || '1.0.0'}`);
      console.log(`  ${chalk.cyan('描述:')} ${info.description || ''}`);
      console.log(`  ${chalk.cyan('作者:')} ${info.author || ''}`);
      console.log(`  ${chalk.cyan('文件大小:')} ${(stats.size / 1024).toFixed(2)} KB`);
      console.log('');
    } catch (error) {
      spinner.fail(chalk.red('构建插件失败'));
      if (error instanceof Error) {
        console.error(chalk.red(error.message));
      }
      process.exit(1);
    }
  });

/**
 * 查找 info.json 文件
 */
async function findInfoJson(dir: string): Promise<string | null> {
  try {
    const infoPath = path.join(dir, 'info.json');
    await fs.access(infoPath);
    return infoPath;
  } catch {
    return null;
  }
}
