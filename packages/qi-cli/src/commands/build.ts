import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import path from 'path';
import JSZip from 'jszip';
import inquirer from 'inquirer';

/**
 * 构建命令
 */
export const buildCommand = new Command('build')
  .description('构建插件为 .qi 文件')
  .option('-o, --output <path>', '输出文件路径')
  .option('-v, --version <version>', '设置插件版本')
  .option('-w, --watch', '监听文件变化自动重新构建')
  .option('-y, --yes', '跳过所有交互确认')
  .action(async (options: any) => {
    let spinner = ora('正在初始化构建...').start();

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

      const currentVersion = info.version || '1.0.0';
      let targetVersion = options.version;

      // 交互式设计：如果未提供版本且非监听模式，且未开启 -y，则弹窗询问
      if (!targetVersion && !options.watch && !options.yes) {
        spinner.stop();
        console.log(chalk.bold(`\n📦 正在构建插件: ${chalk.cyan(info.name)}`));
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'version',
            message: `请输入构建版本号:`,
            default: currentVersion
          }
        ]);
        targetVersion = answers.version;
        spinner = ora('正在构建插件...').start();
      }

      // 处理版本号
      if (targetVersion) {
        info.version = targetVersion;
      }

      // 添加更新时间
      const now = new Date();
      info.updatedAt = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

      const updatedInfoContent = JSON.stringify(info, null, 2);
      await fs.writeFile(infoJsonPath, updatedInfoContent);

      const distDir = path.join(path.dirname(infoJsonPath), 'dist');
      try {
        await fs.access(distDir);
      } catch {
        spinner.fail(
          chalk.red('dist 目录不存在，请先运行 npm run build 编译插件')
        );
        process.exit(1);
      }

      // 创建 ZIP 文件
      const zip = new JSZip();

      // 添加 info.json
      zip.file('info.json', updatedInfoContent);

      // 递归添加 dist 目录下的所有文件
      await addDirectoryToZip(zip, distDir, '');

      // 处理 info.json 中定义的 extraAssets
      if (Array.isArray(info.extraAssets)) {
        for (const assetPath of info.extraAssets) {
          const fullPath = path.resolve(path.dirname(infoJsonPath), assetPath);
          try {
            const stats = await fs.stat(fullPath);
            if (stats.isFile()) {
              const content = await fs.readFile(fullPath);
              zip.file(assetPath, content);
            } else if (stats.isDirectory()) {
              await addDirectoryToZip(zip, fullPath, assetPath);
            }
          } catch (e) {
            console.warn(chalk.yellow(`警告: 无法读取资源 ${assetPath}，已跳过`));
          }
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
      console.log(`  ${chalk.cyan('文件大小:')} ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
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
 * 递归添加目录到 ZIP
 */
async function addDirectoryToZip(zip: JSZip, dirPath: string, rootInZip: string) {
  const files = await fs.readdir(dirPath);
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stats = await fs.stat(filePath);
    const zipPath = path.join(rootInZip, file);
    if (stats.isDirectory()) {
      await addDirectoryToZip(zip, filePath, zipPath);
    } else {
      const content = await fs.readFile(filePath);
      zip.file(zipPath, content);
    }
  }
}

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
