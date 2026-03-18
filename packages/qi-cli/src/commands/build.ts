import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fsp from 'fs/promises';
import { FSWatcher, watch as watchFs } from 'fs';
import path from 'path';
import JSZip from 'jszip';
import inquirer from 'inquirer';

type PluginInfo = Record<string, unknown> & {
  name?: string;
  version?: string;
  updatedAt?: string;
  extraAssets?: string[];
};

type BuildContext = {
  infoJsonPath: string;
  projectRoot: string;
};

function formatTimestamp(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes()
  ).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

function toZipPath(...parts: string[]): string {
  return parts.join('/').replace(/\\/g, '/');
}

async function findInfoJson(startDir: string): Promise<string | null> {
  let currentDir = path.resolve(startDir);

  while (true) {
    const infoPath = path.join(currentDir, 'info.json');
    try {
      await fsp.access(infoPath);
      return infoPath;
    } catch {
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) return null;
      currentDir = parentDir;
    }
  }
}

async function addDirectoryToZip(zip: JSZip, dirPath: string, rootInZip: string) {
  const files = await fsp.readdir(dirPath, { withFileTypes: true });
  for (const file of files) {
    const filePath = path.join(dirPath, file.name);
    const zipPath = rootInZip ? toZipPath(rootInZip, file.name) : file.name;
    if (file.isDirectory()) {
      await addDirectoryToZip(zip, filePath, zipPath);
    } else {
      const content = await fsp.readFile(filePath);
      zip.file(zipPath, content);
    }
  }
}

async function readBuildContext(cwd: string): Promise<BuildContext> {
  const infoJsonPath = await findInfoJson(cwd);
  if (!infoJsonPath) {
    throw new Error('info.json not found. Run this command inside a plugin project.');
  }

  return {
    infoJsonPath,
    projectRoot: path.dirname(infoJsonPath)
  };
}

async function buildPlugin(
  context: BuildContext,
  options: {
    output?: string;
    version?: string;
    askVersion?: boolean;
  }
): Promise<{ outputPath: string; version: string }> {
  const infoContent = await fsp.readFile(context.infoJsonPath, 'utf8');
  const info = JSON.parse(infoContent) as PluginInfo;

  if (!info.name || typeof info.name !== 'string') {
    throw new Error('info.json must contain a valid "name" field.');
  }

  let targetVersion = options.version?.trim();
  if (!targetVersion && options.askVersion) {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'version',
        message: 'Build version:',
        default: info.version || '1.0.0'
      }
    ]);
    targetVersion = String(answers.version || '').trim();
  }

  if (targetVersion) info.version = targetVersion;
  info.updatedAt = formatTimestamp(new Date());

  const updatedInfoContent = JSON.stringify(info, null, 2);
  await fsp.writeFile(context.infoJsonPath, updatedInfoContent);

  const distDir = path.join(context.projectRoot, 'dist');
  try {
    const distStat = await fsp.stat(distDir);
    if (!distStat.isDirectory()) {
      throw new Error();
    }
  } catch {
    throw new Error('dist directory not found. Run your plugin build first.');
  }

  const zip = new JSZip();
  zip.file('info.json', updatedInfoContent);
  await addDirectoryToZip(zip, distDir, '');

  if (Array.isArray(info.extraAssets)) {
    for (const assetPath of info.extraAssets) {
      const fullPath = path.resolve(context.projectRoot, assetPath);
      try {
        const stats = await fsp.stat(fullPath);
        if (stats.isFile()) {
          const content = await fsp.readFile(fullPath);
          zip.file(toZipPath(assetPath), content);
        } else if (stats.isDirectory()) {
          await addDirectoryToZip(zip, fullPath, toZipPath(assetPath));
        }
      } catch {
        console.warn(chalk.yellow(`Warning: skipped missing extra asset ${assetPath}`));
      }
    }
  }

  const outputFileName = options.output || `${info.name}.qi`;
  const outputPath = path.resolve(context.projectRoot, outputFileName);
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  await fsp.writeFile(outputPath, buffer);

  return {
    outputPath,
    version: String(info.version || '1.0.0')
  };
}

async function listWatchDirectories(projectRoot: string, info: PluginInfo): Promise<string[]> {
  const dirs = new Set<string>([projectRoot, path.join(projectRoot, 'dist')]);

  const collectDirs = async (targetPath: string): Promise<void> => {
    try {
      const stat = await fsp.stat(targetPath);
      if (stat.isDirectory()) {
        dirs.add(targetPath);
        const entries = await fsp.readdir(targetPath, { withFileTypes: true });
        await Promise.all(
          entries
            .filter((entry) => entry.isDirectory())
            .map((entry) => collectDirs(path.join(targetPath, entry.name)))
        );
      } else {
        dirs.add(path.dirname(targetPath));
      }
    } catch {
      dirs.add(path.dirname(targetPath));
    }
  };

  for (const assetPath of info.extraAssets || []) {
    await collectDirs(path.resolve(projectRoot, assetPath));
  }

  return [...dirs];
}

async function watchBuild(
  context: BuildContext,
  options: { output?: string; version?: string }
): Promise<void> {
  const spinner = ora('Building plugin...').start();
  let watchers: FSWatcher[] = [];
  let rebuildTimer: NodeJS.Timeout | null = null;
  let isBuilding = false;

  const closeWatchers = () => {
    for (const watcher of watchers) watcher.close();
    watchers = [];
  };

  const runBuild = async (reason?: string) => {
    if (isBuilding) return;
    isBuilding = true;
    spinner.start(reason ? `Rebuilding plugin (${reason})...` : 'Building plugin...');

    try {
      const result = await buildPlugin(context, {
        output: options.output,
        version: options.version,
        askVersion: false
      });

      spinner.succeed(chalk.green(`Built ${path.basename(result.outputPath)} (v${result.version})`));

      const info = JSON.parse(await fsp.readFile(context.infoJsonPath, 'utf8')) as PluginInfo;
      const directories = await listWatchDirectories(context.projectRoot, info);
      closeWatchers();
      watchers = directories.map((directory) =>
        watchFs(directory, () => {
          if (rebuildTimer) clearTimeout(rebuildTimer);
          rebuildTimer = setTimeout(() => {
            void runBuild(path.relative(context.projectRoot, directory) || '.');
          }, 150);
        })
      );
    } catch (error) {
      spinner.fail(chalk.red('Plugin build failed'));
      if (error instanceof Error) console.error(chalk.red(error.message));
    } finally {
      isBuilding = false;
    }
  };

  const shutdown = () => {
    closeWatchers();
    if (rebuildTimer) clearTimeout(rebuildTimer);
    process.exit(0);
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  await runBuild();
  console.log(chalk.gray('Watching info.json, dist, and extra assets for changes...'));

  await new Promise(() => {
    // keep process alive while watching
  });
}

export const buildCommand = new Command('build')
  .description('Package the current plugin into a .qi file')
  .option('-o, --output <path>', 'Output file path')
  .option('-v, --version <version>', 'Override plugin version before packaging')
  .option('-w, --watch', 'Rebuild automatically when dist/info.json/assets change')
  .option('-y, --yes', 'Skip interactive prompts')
  .action(async (options: Record<string, unknown>) => {
    try {
      const context = await readBuildContext(process.cwd());

      if (options.watch) {
        await watchBuild(context, {
          output: typeof options.output === 'string' ? options.output : undefined,
          version: typeof options.version === 'string' ? options.version : undefined
        });
        return;
      }

      const spinner = ora('Building plugin...').start();
      const result = await buildPlugin(context, {
        output: typeof options.output === 'string' ? options.output : undefined,
        version: typeof options.version === 'string' ? options.version : undefined,
        askVersion: !options.yes && !options.version
      });
      spinner.succeed(chalk.green(`Plugin built successfully: ${result.outputPath}`));
    } catch (error) {
      console.error(chalk.red('Failed to build plugin'));
      if (error instanceof Error) console.error(chalk.red(error.message));
      process.exit(1);
    }
  });
