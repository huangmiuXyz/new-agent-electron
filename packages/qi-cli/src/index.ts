#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { buildCommand } from './commands/build.js';
import { devCommand } from './commands/dev.js';

const program = new Command();

program
  .name('qi')
  .description('Qi CLI - 创建和打包 Qi 插件')
  .version('1.0.0');

const codeCommand = new Command('code')
  .description('插件开发相关命令');

codeCommand.addCommand(initCommand);
codeCommand.addCommand(buildCommand);
codeCommand.addCommand(devCommand);

program.addCommand(codeCommand);

program.parse();
