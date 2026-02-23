import type { ComfyHistoryEntry, ComfyHistoryImageOutput } from './comfy-api-types';

type AnyObject = Record<string, any>;

export interface WorkflowPathMappings {
  promptPath?: string;
  negativePromptPath?: string;
  seedPath?: string;
  widthPath?: string;
  heightPath?: string;
  batchSizePath?: string;
}

export const ensureNoTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

export const parseSize = (size?: string): { width: number; height: number } | null => {
  if (!size) return null;
  const match = size.match(/^(\d+)x(\d+)$/i);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return { width, height };
};

export const isPlainObject = (value: unknown): value is AnyObject => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

export const safeJsonParseObject = (input: string, errorPrefix: string): AnyObject => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (error) {
    throw new Error(`${errorPrefix}: invalid JSON.`);
  }
  if (!isPlainObject(parsed)) {
    throw new Error(`${errorPrefix}: JSON root must be an object.`);
  }
  return parsed;
};

export const setValueByPath = (target: AnyObject, path: string, value: unknown): void => {
  const segments = path.split('.').map((p) => p.trim()).filter(Boolean);
  if (segments.length < 2) {
    throw new Error(`Invalid path "${path}". Expected format like "6.inputs.text".`);
  }

  let cursor: AnyObject = target;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const key = segments[i];
    const next = cursor[key];
    if (!isPlainObject(next)) {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }

  cursor[segments[segments.length - 1]] = value;
};

export const detectWorkflowPaths = (workflow: AnyObject): WorkflowPathMappings => {
  const mappings: WorkflowPathMappings = {};
  const textPaths: string[] = [];

  for (const [nodeId, nodeValue] of Object.entries(workflow)) {
    if (!isPlainObject(nodeValue)) continue;
    const inputs = isPlainObject(nodeValue.inputs) ? nodeValue.inputs : null;
    if (!inputs) continue;

    if (typeof inputs.text === 'string') {
      textPaths.push(`${nodeId}.inputs.text`);
    }

    if (!mappings.seedPath) {
      const seedKey = ['seed', 'noise_seed', 'random_seed', 'seed_num'].find((k) => k in inputs);
      if (seedKey) mappings.seedPath = `${nodeId}.inputs.${seedKey}`;
    }

    if (!mappings.widthPath && 'width' in inputs) {
      mappings.widthPath = `${nodeId}.inputs.width`;
    }

    if (!mappings.heightPath && 'height' in inputs) {
      mappings.heightPath = `${nodeId}.inputs.height`;
    }

    if (!mappings.batchSizePath) {
      const batchKey = ['batch_size', 'batch', 'samples', 'num_images'].find((k) => k in inputs);
      if (batchKey) mappings.batchSizePath = `${nodeId}.inputs.${batchKey}`;
    }
  }

  if (textPaths[0] && !mappings.promptPath) mappings.promptPath = textPaths[0];
  if (textPaths[1] && !mappings.negativePromptPath) mappings.negativePromptPath = textPaths[1];

  return mappings;
};

export const applyOverrideMap = (
  workflow: AnyObject,
  overridesJson?: string
): void => {
  if (!overridesJson?.trim()) return;
  const overrides = safeJsonParseObject(overridesJson, 'Overrides JSON');
  for (const [path, value] of Object.entries(overrides)) {
    setValueByPath(workflow, path, value);
  }
};

export const buildViewUrl = (baseURL: string, image: ComfyHistoryImageOutput): string => {
  const query = new URLSearchParams({
    filename: image.filename,
    subfolder: image.subfolder ?? '',
    type: image.type ?? 'output'
  });
  return `${baseURL}/view?${query.toString()}`;
};

export const collectImagesFromHistory = (entry: ComfyHistoryEntry, baseURL: string): string[] => {
  const urls: string[] = [];
  const outputs = entry.outputs ?? {};
  for (const nodeOutput of Object.values(outputs)) {
    for (const image of nodeOutput.images ?? []) {
      urls.push(buildViewUrl(baseURL, image));
    }
  }
  return urls;
};

export const extractComfyError = (entry: ComfyHistoryEntry): string | undefined => {
  const messages = entry.status?.messages ?? [];
  for (const msg of messages) {
    const type = String(msg.type ?? '').toLowerCase();
    if (type.includes('error')) {
      return String(msg.message ?? 'ComfyUI execution error');
    }
  }

  const status = String(entry.status?.status_str ?? '').toLowerCase();
  if (status === 'error' || status === 'failed') {
    return 'ComfyUI workflow execution failed.';
  }

  return undefined;
};

export const createClientId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};
