#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { buildCommand } from './commands/build.js';
import { devCommand } from './commands/dev.js';

const program = new Command();

program
  .name('qi')
  .description('Qi CLI for creating, developing, and packaging Agent-Qi plugins')
  .version('1.0.0');

const codeCommand = new Command('code').description('Plugin development commands');

codeCommand.addCommand(initCommand);
codeCommand.addCommand(buildCommand);
codeCommand.addCommand(devCommand);

program.addCommand(codeCommand);

program.parse();
