import { Command } from 'commander';
import chalk from 'chalk';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

/**
 * 开发命令
 */
export const devCommand = new Command('dev')
  .description('进入插件开发模式，监听文件变化并自动重新构建')
  .action(async () => {
    const cwd = process.cwd();
    const packageJsonPath = path.join(cwd, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
      console.error(chalk.red('未找到 package.json 文件，请在插件项目根目录下运行此命令'));
      process.exit(1);
    }

    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const devScript = pkg.scripts?.['build:watch'] || pkg.scripts?.dev;

    if (!devScript) {
      console.warn(chalk.yellow('未在 package.json 中找到 "build:watch" 或 "dev" 脚本'));
      console.log(chalk.blue('建议添加 "build:watch": "vite build --watch" 到你的 package.json'));
    }

    console.log(chalk.cyan('🚀 开启插件开发模式...'));
    console.log(chalk.gray(`当前目录: ${cwd}`));
    console.log('');
    console.log(chalk.bold('请在 Agent-Qi 客户端中：'));
    console.log(`1. 进入 ${chalk.green('设置 -> 插件管理')}`);
    console.log(`2. 点击 ${chalk.green('开发模式')} 按钮`);
    console.log(`3. 选择当前目录: ${chalk.yellow(cwd)}`);
    console.log('');
    console.log(chalk.gray('正在启动构建监听...'));

    if (devScript) {
      const child = exec(pkg.scripts?.['build:watch'] ? 'npm run build:watch' : 'npm run dev');
      
      child.stdout?.on('data', (data) => {
        process.stdout.write(data);
      });

      child.stderr?.on('data', (data) => {
        process.stderr.write(data);
      });

      child.on('close', (code) => {
        if (code !== 0) {
          console.error(chalk.red(`构建进程异常退出，退出码: ${code}`));
        }
      });
    } else {
      console.log(chalk.yellow('由于缺少构建监听脚本，请手动确保 dist/index.js 保持更新。'));
    }
  });
