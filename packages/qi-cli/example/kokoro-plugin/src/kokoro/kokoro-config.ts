import { FetchFunction } from '@ai-sdk/provider-utils';

export interface AutoStartConfig {
  enabled: boolean;
  port: number;
  basePath: string;
  spawn: (command: string, args: string[], options: any) => any;
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

export type KokoroConfig = {
  provider: string;
  url: (options: { modelId: string; path: string }) => string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
  autoStart?: AutoStartConfig;
};
