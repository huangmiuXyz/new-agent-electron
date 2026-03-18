import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

export interface TemplateInfo {
  name: string;
  value: string;
  description: string;
  recommended?: boolean;
}

export const BUILTIN_TEMPLATES: TemplateInfo[] = [
  {
    name: 'Hello World',
    value: 'hello-world',
    description: 'Recommended. The smallest possible Qi plugin starter.',
    recommended: true
  }
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_TEMPLATE = 'hello-world';

export const DEFAULT_TEMPLATES: TemplateInfo[] = [
  {
    name: 'Hello World',
    value: 'hello-world',
    description: 'Recommended. The smallest possible Qi plugin starter.',
    recommended: true
  },
  {
    name: 'llama.cpp Local Provider',
    value: 'llama-cpp-plugin',
    description: 'Local llama.cpp provider with model scan, loading, and service controls.'
  },
  {
    name: 'Ollama Starter',
    value: 'ollama-starter',
    description: 'Basic TypeScript plugin starter with provider integration.'
  },
  {
    name: 'Smart API Key Filler',
    value: 'smart-api-key-filler',
    description: 'Utility plugin example with custom tools and local settings.'
  },
  {
    name: 'Vosk Speech Recognition',
    value: 'vosk-speech-recognition',
    description: 'React-based plugin example with richer UI interactions.'
  },
  {
    name: 'MiniMax Provider',
    value: 'minimax-plugin',
    description: 'Provider-compatible template for custom model vendors.'
  }
];

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export function replaceTemplate(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }
  return result;
}

export async function resolveExampleDir(cwd = process.cwd()): Promise<string> {
  const candidates = [
    path.resolve(__dirname, '../example'),
    path.resolve(__dirname, '../../example'),
    path.resolve(cwd, 'packages/qi-cli/example')
  ];

  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) return candidate;
    } catch {
      // try next path
    }
  }

  throw new Error('Unable to find the example template directory.');
}

function normalizeTemplateName(value: string): string {
  return value.trim().toLowerCase();
}

function sortTemplates(templates: TemplateInfo[]): TemplateInfo[] {
  return [...templates].sort((a, b) => {
    if (Boolean(a.recommended) !== Boolean(b.recommended)) {
      return a.recommended ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

export async function loadTemplates(exampleDir: string): Promise<TemplateInfo[]> {
  try {
    const dirs = await fs.readdir(exampleDir, { withFileTypes: true });
    const discoveredTemplates = await Promise.all(
      dirs
        .filter((dir) => dir.isDirectory())
        .map(async (dir) => {
          const value = dir.name;
          const infoPath = path.join(exampleDir, value, 'info.json');
          const recommended = value === DEFAULT_TEMPLATE;

          try {
            const info = JSON.parse(await fs.readFile(infoPath, 'utf8')) as {
              name?: string;
              description?: string;
            };

            return {
              name: info.name?.trim() || value,
              value,
              description: info.description?.trim() || '',
              recommended
            } satisfies TemplateInfo;
          } catch {
            return {
              name: value,
              value,
              description: '',
              recommended
            } satisfies TemplateInfo;
          }
        })
    );

    if (discoveredTemplates.length > 0) {
      const templateMap = new Map<string, TemplateInfo>();
      for (const template of BUILTIN_TEMPLATES) {
        templateMap.set(template.value, template);
      }
      for (const template of discoveredTemplates) {
        templateMap.set(template.value, template);
      }
      return sortTemplates([...templateMap.values()]);
    }
  } catch {
    // fallback below
  }

  return sortTemplates(DEFAULT_TEMPLATES);
}

export function findTemplate(
  templates: TemplateInfo[],
  templateName?: string
): TemplateInfo | undefined {
  if (!templateName) {
    return templates.find((template) => template.recommended) || templates[0];
  }

  const normalized = normalizeTemplateName(templateName);
  return templates.find((template) => normalizeTemplateName(template.value) === normalized);
}

export type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun';

export async function detectPackageManager(dir = process.cwd()): Promise<PackageManager> {
  const lockFiles: Array<[string, PackageManager]> = [
    ['pnpm-lock.yaml', 'pnpm'],
    ['package-lock.json', 'npm'],
    ['yarn.lock', 'yarn'],
    ['bun.lockb', 'bun'],
    ['bun.lock', 'bun']
  ];

  for (const [fileName, manager] of lockFiles) {
    try {
      await fs.access(path.join(dir, fileName));
      return manager;
    } catch {
      // keep looking
    }
  }

  return 'pnpm';
}

export function getRunCommand(packageManager: PackageManager, scriptName: string): string[] {
  switch (packageManager) {
    case 'npm':
      return ['npm', 'run', scriptName];
    case 'yarn':
      return ['yarn', scriptName];
    case 'bun':
      return ['bun', 'run', scriptName];
    case 'pnpm':
    default:
      return ['pnpm', scriptName];
  }
}

export function getInstallCommand(packageManager: PackageManager): string[] {
  switch (packageManager) {
    case 'npm':
      return ['npm', 'install'];
    case 'yarn':
      return ['yarn', 'install'];
    case 'bun':
      return ['bun', 'install'];
    case 'pnpm':
    default:
      return ['pnpm', 'install'];
  }
}
