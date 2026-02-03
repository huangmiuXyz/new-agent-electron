import { ClientConfig, Tools } from './ai';
import { DownloadProgress } from './components';

export interface ElectronAPI {
  // aiServices
  list_tools: (config: ClientConfig, cache?: boolean) => Promise<Tools>;
  
  // process
  process: {
    platform: string;
    env: Record<string, string | undefined>;
    execPath: string;
  };

  // pty
  pty: {
    spawn: (options: {
      id: string;
      cols?: number;
      rows?: number;
      cwd?: string;
      startupLocation?: string;
      customLocationPath?: string;
    }) => Promise<any>;
    write: (id: string, data: string) => Promise<any>;
    resize: (id: string, cols: number, rows: number) => Promise<any>;
    kill: (id: string) => Promise<any>;
    onData: (id: string, callback: (data: string) => void) => () => void;
    onExit: (id: string, callback: (info: { exitCode: number; signal?: number }) => void) => () => void;
  };

  // dialog
  showOpenDialog: (options: any) => Promise<any>;

  // app
  app: any;
  openDevTools: () => void;
  isPackaged: boolean;
  getPath: (name: any) => string;
  getAppPath: () => string;
  getPluginsPath: () => string;

  // libs
  shell: any;
  fs: typeof import('fs');
  path: typeof import('path');
  mime: any;
  url: any;

  // sqlite
  sqlite: {
    isSupported: () => Promise<boolean>;
    upsertChunks: (chunks: any[]) => Promise<any>;
    updateChunks: (chunks: any[]) => Promise<any>;
    deleteChunksByDoc: (docId: string) => Promise<any>;
    deleteChunksByKb: (kbId: string) => Promise<any>;
    search: (options: any) => Promise<any>;
    getAllChunks: () => Promise<any>;
  };

  // child_process
  exec: typeof import('child_process').exec;
  spawn: typeof import('child_process').spawn;
  fork: typeof import('child_process').fork;

  // os
  os: typeof import('os');

  // watch
  watch: (path: string, callback: (event: string, filename: string) => void) => () => void;

  // windows
  createTempChat: (data: any) => Promise<any>;
  getTempChatData: (windowId: string) => Promise<any>;

  // updater
  updater: {
    getVersion: () => Promise<string>;
    checkForUpdates: () => Promise<any>;
    downloadUpdate: () => Promise<any>;
    quitAndInstall: () => Promise<void>;
    onStatus: (callback: (status: any) => void) => () => void;
  };

  // net
  net: {
    fetch: (url: string, options?: any) => Promise<any>;
    download: (options: { url: string; destPath: string; id?: string; offset?: number }) => Promise<any>;
    onDownloadProgress: (id: string, callback: (progress: DownloadProgress) => void) => () => void;
    cancelDownload: (id: string) => Promise<void>;
  };
}
