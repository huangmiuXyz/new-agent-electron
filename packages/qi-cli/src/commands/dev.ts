import { Command } from 'commander';
import chalk from 'chalk';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { detectPackageManager, getRunCommand } from '../utils.js';

export const devCommand = new Command('dev')
  .description('Start plugin development mode and watch plugin builds')
  .action(async () => {
    const cwd = process.cwd();
    const packageJsonPath = path.join(cwd, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
      console.error(chalk.red('package.json not found. Run this command inside a plugin project.'));
      process.exit(1);
    }

    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const hasBuildWatch = Boolean(pkg.scripts?.['build:watch']);
    const hasDevScript = Boolean(pkg.scripts?.dev);
    const scriptName = hasBuildWatch ? 'build:watch' : hasDevScript ? 'dev' : null;

    if (!scriptName) {
      console.warn(chalk.yellow('No "build:watch" or "dev" script found in package.json.'));
      console.log(
        chalk.blue('Recommended script: "build:watch": "vite build --watch"')
      );
      process.exit(1);
    }

    const packageManager = await detectPackageManager(cwd);
    const [command, ...args] = getRunCommand(packageManager, scriptName);

    console.log(chalk.cyan('Starting plugin development mode...'));
    console.log(chalk.gray(`Working directory: ${cwd}`));
    console.log(chalk.gray(`Using package manager: ${packageManager}`));
    console.log('');
    console.log(chalk.bold('In Agent-Qi:'));
    console.log(`1. Open ${chalk.green('Settings -> Plugins')}`);
    console.log(`2. Click ${chalk.green('Development Mode')}`);
    console.log(`3. Choose this directory: ${chalk.yellow(cwd)}`);
    console.log('');
    console.log(chalk.gray(`Running: ${[command, ...args].join(' ')}`));

    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32'
    });

    const shutdown = () => {
      child.kill('SIGINT');
    };

    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);

    child.on('close', (code) => {
      if (code !== 0) {
        console.error(chalk.red(`Build watcher exited with code ${code}`));
        process.exit(code || 1);
      }
    });
  });
