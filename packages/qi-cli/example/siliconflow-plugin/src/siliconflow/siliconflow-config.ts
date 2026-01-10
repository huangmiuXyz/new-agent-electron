import { FetchFunction } from '@ai-sdk/provider-utils';

export type SiliconFlowConfig = {
  provider: string;
  url: (options: { modelId: string; path: string }) => string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
};
