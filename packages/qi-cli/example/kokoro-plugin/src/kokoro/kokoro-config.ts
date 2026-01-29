import { FetchFunction } from '@ai-sdk/provider-utils';

export interface AutoStartConfig {
  enabled: boolean;
  port: number;
  basePath: string;
  /** 使用终端创建 tab 来执行命令 */
  createTab: (options: { command: string; timeout?: number; showTerminal?: boolean }) => Promise<{ id: string; result?: { success: boolean; output: string } }>;
  platform: string;
  pathJoin: (...paths: string[]) => string;
  notification: {
    info: (content: string, title?: string) => void;
    success: (content: string, title?: string) => void;
    error: (content: string, title?: string) => void;
    loading: (content: string, title?: string, duration?: number) => void;
    removeStatus: (id: string) => void;
  };
}

export interface KokoroConcurrencyConfig {
  maxConcurrency?: number;
}

export type KokoroConfig = {
  provider: string;
  url: (options: { modelId: string; path: string }) => string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
  autoStart?: AutoStartConfig;
  concurrency?: KokoroConcurrencyConfig;
};
