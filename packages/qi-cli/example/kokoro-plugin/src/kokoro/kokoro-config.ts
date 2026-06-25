export type KokoroSpeechCallOptions = {
  speed?: number;
};

export type KokoroConfig = {
  provider: string;
  invokeIPC: (channel: string, ...args: any[]) => Promise<any>;
};
