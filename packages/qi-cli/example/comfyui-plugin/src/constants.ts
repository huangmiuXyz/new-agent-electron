export const PLUGIN_NAME = 'comfyui-plugin';
export const PROVIDER_ID = 'comfyui';
export const STORAGE_KEY_CONFIG = 'comfyui-config';

export const DEFAULT_BASE_URL = 'http://127.0.0.1:8000';
export const DEFAULT_MODEL_ID = 'comfyui-workflow';

export const DEFAULT_POLL_INTERVAL_MS = 1500;
export const DEFAULT_TIMEOUT_SEC = 180;

export interface ComfyUIPluginConfig {
  apiKey?: string;
  baseURL: string;
  workflowJson: string;
  promptPath?: string;
  negativePromptPath?: string;
  seedPath?: string;
  widthPath?: string;
  heightPath?: string;
  batchSizePath?: string;
  pollIntervalMs: number;
  timeoutSec: number;
}

export const DEFAULT_CONFIG: ComfyUIPluginConfig = {
  apiKey: '',
  baseURL: DEFAULT_BASE_URL,
  workflowJson: '',
  promptPath: '',
  negativePromptPath: '',
  seedPath: '',
  widthPath: '',
  heightPath: '',
  batchSizePath: '',
  pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
  timeoutSec: DEFAULT_TIMEOUT_SEC
};
