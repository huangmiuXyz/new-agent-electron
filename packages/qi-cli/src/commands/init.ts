import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import path from 'path';
import {
  detectPackageManager,
  ensureDir,
  findTemplate,
  getInstallCommand,
  loadTemplates,
  replaceTemplate,
  resolveExampleDir,
  type TemplateInfo
} from '../utils.js';

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

    if (
      entry.name === 'node_modules' ||
      entry.name === 'dist' ||
      entry.name === '.turbo' ||
      entry.name === '.vite' ||
      entry.name === '.git' ||
      entry.name === '.DS_Store' ||
      entry.name.endsWith('.qi') ||
      entry.name === 'package-lock.json' ||
      entry.name === 'pnpm-lock.yaml' ||
      entry.name === 'yarn.lock' ||
      entry.name === 'bun.lock' ||
      entry.name === 'bun.lockb'
    ) {
      continue;
    }

    if (entry.isDirectory()) {
      await copyTemplateDir(srcPath, destPath, variables);
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    const isBinary = [
      '.png',
      '.jpg',
      '.jpeg',
      '.gif',
      '.webp',
      '.ico',
      '.pdf',
      '.zip',
      '.tar',
      '.gz',
      '.qi',
      '.svg'
    ].includes(ext);

    if (isBinary) {
      await fs.copyFile(srcPath, destPath);
      continue;
    }

    let content = await fs.readFile(srcPath, 'utf8');
    content = replaceTemplate(content, variables);

    if (entry.name === 'package.json') {
      try {
        const pkg = JSON.parse(content) as Record<string, unknown>;
        pkg.name = variables.pluginName;
        pkg.description = variables.description;
        pkg.author = variables.author;
        pkg.version = variables.version;
        content = JSON.stringify(pkg, null, 2);
      } catch {
        // keep original content when parsing fails
      }
    }

    if (entry.name === 'info.json') {
      try {
        const info = JSON.parse(content) as Record<string, unknown>;
        info.name = variables.displayName;
        info.description = variables.description;
        info.author = variables.author;
        info.version = variables.version;
        info.updatedAt = formatTimestamp(new Date());
        content = JSON.stringify(info, null, 2);
      } catch {
        // keep original content when parsing fails
      }
    }

    await fs.writeFile(destPath, content);
  }
}

async function writeGeneratedFile(projectDir: string, relativePath: string, content: string): Promise<void> {
  const filePath = path.join(projectDir, relativePath);
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content.endsWith('\n') ? content : `${content}\n`);
}

async function createHelloWorldTemplate(
  projectDir: string,
  variables: Record<string, string>
): Promise<void> {
  await writeGeneratedFile(projectDir, '.gitignore', 'dist\nnode_modules\n');

  await writeGeneratedFile(projectDir, 'README.md', `# ${variables.pluginName}

Minimal Agent-Qi hello world plugin with dual-entry (renderer + main process).

## Scripts

\`\`\`bash
pnpm install
pnpm build          # build renderer (dist/index.js) + main (dist/main.js)
pnpm dev            # watch both entries
qi code build       # package into .qi
\`\`\`
`);

  await writeGeneratedFile(projectDir, 'info.json', JSON.stringify({
    name: variables.displayName,
    description: variables.description,
    version: variables.version,
    author: variables.author,
    updatedAt: formatTimestamp(new Date()),
    mainEntry: 'main.js',
    platforms: ['desktop'],
    mobileUnsupportedReason: 'Requires main-process Electron APIs.'
  }, null, 2));

  await writeGeneratedFile(projectDir, 'package.json', JSON.stringify({
    name: variables.pluginName,
    version: variables.version,
    description: variables.description,
    author: variables.author,
    main: 'dist/index.js',
    scripts: {
      build: 'vite build && vite build --config vite.main.config.ts',
      'build:main': 'vite build --config vite.main.config.ts',
      dev: 'node dev.mjs',
      'dev:renderer': 'vite build --watch',
      'dev:main': 'vite build --watch --config vite.main.config.ts'
    },
    dependencies: {
      '@agent-qi/types': 'workspace:*'
    },
    devDependencies: {
      typescript: '^5.9.2',
      vite: '^5.0.0'
    }
  }, null, 2));

  await writeGeneratedFile(projectDir, 'tsconfig.json', JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ES2022',
      lib: ['ES2022', 'DOM'],
      moduleResolution: 'bundler',
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
  }, null, 2));

  await writeGeneratedFile(projectDir, 'vite.config.ts', `import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'plugin',
      fileName: 'index',
      formats: ['iife']
    },
    rollupOptions: {
      output: {
        dir: 'dist',
        entryFileNames: 'index.js',
        chunkFileNames: '[name].js',
        inlineDynamicImports: true
      }
    },
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
    target: 'esnext'
  }
})
`);

  await writeGeneratedFile(projectDir, 'vite.main.config.ts', `import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/main.ts'),
      name: 'mainPlugin',
      fileName: 'main',
      formats: ['cjs']
    },
    rollupOptions: {
      output: {
        dir: 'dist',
        entryFileNames: 'main.js',
        inlineDynamicImports: true
      },
      external: ['electron']
    },
    outDir: 'dist',
    emptyOutDir: false,
    minify: false,
    target: 'esnext'
  }
})
`);

  await writeGeneratedFile(projectDir, 'src/index.ts', `import type { Plugin } from '@agent-qi/types'

const plugin: Plugin = {
  name: '${variables.pluginName}',
  version: '${variables.version}',
  description: '${variables.description}',
  install: async (context) => {
    if (context.api?.pluginMain?.ipc) {
      try {
        const reply = await context.api.pluginMain.ipc.invoke('${variables.pluginName}', 'ping')
        context.notification.success('Main process says: ' + String(reply), '${variables.displayName}')
      } catch (error) {
        context.notification.error('Main process ping failed: ' + String(error), '${variables.displayName}')
      }
    } else {
      context.notification.success('Hello world plugin loaded (no main process).', '${variables.displayName}')
    }
  }
}

export default plugin
`);

  await writeGeneratedFile(projectDir, 'src/main.ts', `import type { MainPlugin } from '@agent-qi/types'

const mainPlugin: MainPlugin = {
  name: '${variables.pluginName}',
  version: '${variables.version}',
  description: '${variables.description}',
  install: (ctx) => {
    ctx.ipc.handle('ping', () => 'pong from main process')
    ctx.logger.info('main-process hello-world plugin loaded')
  },
  uninstall: (ctx) => {
    ctx.logger.info('main-process hello-world plugin unloaded')
  }
}

export default mainPlugin
`);

  // dev.mjs: parallel watch both entries without extra deps.
  // Built as plain array-joined string to avoid template-literal interpolation conflicts.
  const devMjsLines = [
    "import { spawn } from 'node:child_process'",
    "import { createRequire } from 'node:module'",
    "import { dirname, join } from 'node:path'",
    "import { fileURLToPath } from 'node:url'",
    "",
    "const __dirname = dirname(fileURLToPath(import.meta.url))",
    "const require = createRequire(join(__dirname, 'package.json'))",
    "",
    "const viteBin = (() => {",
    "  try {",
    "    const pkgPath = require.resolve('vite/package.json')",
    "    const pkg = require('vite/package.json')",
    "    const binField = pkg.bin",
    "    const binName = typeof binField === 'string' ? binField : binField?.vite",
    "    if (!binName) throw new Error('vite bin not found')",
    "    return join(dirname(pkgPath), binName)",
    "  } catch (error) {",
    "    console.error('Failed to resolve vite bin:', error)",
    "    process.exit(1)",
    "  }",
    "})()",
    "",
    "const procs = []",
    "",
    "const start = (label, args) => {",
    "  const child = spawn(process.execPath, [viteBin, ...args], {",
    "    stdio: ['ignore', 'inherit', 'inherit'],",
    "    env: { ...process.env, FORCE_COLOR: '1' }",
    "  })",
    "  child.on('error', (err) => {",
    "    console.error('[' + label + '] failed:', err)",
    "    shutdown(1)",
    "  })",
    "  child.on('close', (code) => {",
    "    if (code !== 0 && code !== null) shutdown(code || 1)",
    "  })",
    "  procs.push(child)",
    "  console.log('[' + label + '] started: vite ' + args.join(' '))",
    "}",
    "",
    "const shutdown = (code = 0) => {",
    "  for (const child of procs) {",
    "    try { child.kill('SIGTERM') } catch {}",
    "  }",
    "  process.exit(code)",
    "}",
    "",
    "process.on('SIGINT', () => shutdown(0))",
    "process.on('SIGTERM', () => shutdown(0))",
    "",
    "start('renderer', ['build', '--watch'])",
    "start('main', ['build', '--watch', '--config', 'vite.main.config.ts'])",
    "",
    "console.log('\\nWatching renderer (dist/index.js) and main (dist/main.js)...\\n')"
  ];
  await writeGeneratedFile(projectDir, 'dev.mjs', devMjsLines.join('\n') + '\n');
}

function formatTimestamp(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes()
  ).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

function toDisplayName(pluginName: string): string {
  return pluginName
    .split('-')
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(' ');
}

function validatePluginName(input: string): true | string {
  if (!input.trim()) return 'Plugin name is required.';
  if (!/^[a-z0-9-]+$/.test(input)) {
    return 'Plugin name can only contain lowercase letters, numbers, and hyphens.';
  }
  return true;
}

async function ensureProjectDirAvailable(projectDir: string): Promise<void> {
  try {
    const stat = await fs.stat(projectDir);
    if (!stat.isDirectory()) {
      throw new Error(`Target path already exists and is not a directory: ${projectDir}`);
    }

    const entries = await fs.readdir(projectDir);
    if (entries.length > 0) {
      throw new Error(`Target directory is not empty: ${projectDir}`);
    }
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') return;
    throw error;
  }
}

function toTemplateChoices(templates: TemplateInfo[]) {
  return templates.map((template) => ({
    name: template.recommended
      ? `${template.name} (Recommended)${template.description ? ` - ${template.description}` : ''}`
      : `${template.name}${template.description ? ` - ${template.description}` : ''}`,
    value: template.value
  }));
}

export const initCommand = new Command('init')
  .description('Create a new Qi plugin project from an example template')
  .option('-d, --description <description>', 'Plugin description')
  .option('-a, --author <author>', 'Plugin author')
  .option('-v, --version <version>', 'Plugin version', '1.0.0')
  .option('-t, --template <template>', 'Template name to use, for example "llama-cpp-plugin"')
  .option('-y, --yes', 'Skip interactive prompts and use defaults')
  .option('--list-templates', 'List available templates and exit')
  .argument('[name]', 'Plugin package name')
  .action(async (name: string | undefined, options: Record<string, unknown>) => {
    const spinner = process.stdout.isTTY ? ora('Loading templates...').start() : null;

    try {
      const exampleDir = await resolveExampleDir();
      const templates = await loadTemplates(exampleDir);

      if (options.listTemplates) {
        spinner?.stop();
        console.log(chalk.bold('Available templates:'));
        for (const template of templates) {
          const suffix = template.recommended ? chalk.green(' (recommended)') : '';
          console.log(`- ${chalk.cyan(template.value)}: ${template.name}${suffix}`);
          if (template.description) console.log(`  ${template.description}`);
        }
        return;
      }

      spinner?.stop();

      const skipPrompts = Boolean(options.yes);
      let pluginName = name;
      if (!pluginName) {
        if (skipPrompts) {
          console.error(chalk.red('Plugin package name is required when using --yes.'));
          process.exit(1);
        }
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'pluginName',
            message: 'Plugin package name:',
            validate: validatePluginName
          }
        ]);
        pluginName = answers.pluginName as string;
      }

      const nameValidationResult = validatePluginName(pluginName || '');
      if (nameValidationResult !== true) {
        console.error(chalk.red(nameValidationResult));
        process.exit(1);
      }

      const requestedTemplate = typeof options.template === 'string' ? options.template : undefined;
      let selectedTemplate = findTemplate(templates, requestedTemplate);

      if (requestedTemplate && !selectedTemplate) {
        console.error(chalk.red(`Unknown template: ${requestedTemplate}`));
        console.log(chalk.gray('Run `qi code init --list-templates` to see valid template names.'));
        process.exit(1);
      }

      const promptQuestions: any[] = [];

      if (!options.description && !skipPrompts) {
        promptQuestions.push({
          type: 'input',
          name: 'description',
          message: 'Plugin description:',
          default: `${toDisplayName(pluginName!)} plugin`
        });
      }

      if (!options.author && !skipPrompts) {
        promptQuestions.push({
          type: 'input',
          name: 'author',
          message: 'Author:',
          default: ''
        });
      }

      if (!selectedTemplate) {
        promptQuestions.push({
          type: 'list',
          name: 'templateName',
          message: 'Choose a template:',
          choices: toTemplateChoices(templates),
          default: templates.find((template) => template.recommended)?.value
        });
      }

      const answers = promptQuestions.length > 0 ? await inquirer.prompt(promptQuestions) : {};

      selectedTemplate =
        selectedTemplate || findTemplate(templates, String(answers.templateName || ''));

      if (!selectedTemplate) {
        console.error(chalk.red('No template selected.'));
        process.exit(1);
      }

      const defaultDescription = skipPrompts ? `${toDisplayName(pluginName!)} plugin` : '';
      const description = String(options.description || answers.description || defaultDescription).trim();
      const author = String(options.author || answers.author || '').trim();
      const version = String(options.version || '1.0.0').trim();

      const variables: Record<string, string> = {
        pluginName: pluginName!,
        displayName: toDisplayName(pluginName!),
        version,
        description,
        author
      };

      const projectDir = path.join(process.cwd(), pluginName!);
      await ensureProjectDirAvailable(projectDir);

      spinner?.start(`Creating plugin from template "${selectedTemplate.value}"...`);

      if (selectedTemplate.value === 'hello-world') {
        await createHelloWorldTemplate(projectDir, variables);
      } else {
        const templateSrcDir = path.join(exampleDir, selectedTemplate.value);
        await fs.access(templateSrcDir);
        await copyTemplateDir(templateSrcDir, projectDir, variables);
      }

      if (spinner) {
        spinner.succeed(chalk.green(`Created plugin project "${pluginName}" successfully.`));
      } else {
        console.log(chalk.green(`Created plugin project "${pluginName}" successfully.`));
      }

      const packageManager = await detectPackageManager(process.cwd());
      const installCommand = getInstallCommand(packageManager).join(' ');

      console.log('');
      console.log(chalk.bold('Next steps:'));
      console.log(`  ${chalk.cyan('cd')} ${pluginName}`);
      console.log(`  ${chalk.cyan(installCommand)}`);
      console.log(`  ${chalk.cyan(`${packageManager === 'npm' ? 'npm run build' : `${packageManager} build`}`)}`);
      console.log(`  ${chalk.cyan('qi code build')}  # Build the distributable .qi file`);
      console.log('');
    } catch (error) {
      if (spinner) spinner.fail(chalk.red('Failed to create plugin project'));
      else console.error(chalk.red('Failed to create plugin project'));
      if (error instanceof Error) {
        console.error(chalk.red(error.message));
      }
      process.exit(1);
    }
  });
