import { ClientConfig, Tools } from './ai';
import { DownloadProgress } from './components';

export interface SyncHostState {
  running: boolean;
  port: number;
  displayName: string;
  deviceId: string;
  urls: string[];
  connectedClients: number;
  snapshotUpdatedAt?: number;
  error?: string;
}

export interface SyncSnapshot {
  chats: Chat[];
  activeChatId: string | null;
  updatedAt: number;
  source: string;
}

export interface SyncEndpoint {
  deviceId: string;
  displayName: string;
  source: string;
  lastSeenAt: number;
  snapshotUpdatedAt?: number;
  messageCount: number;
  chatCount: number;
}

export type SyncEvent =
  | { type: 'state'; state: SyncHostState }
  | { type: 'directory'; endpoints: SyncEndpoint[] };

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
  getBundledRipgrepPath: () => string | null;
  execFileCommand: (
    file: string,
    args?: string[],
    options?: { cwd?: string; maxBuffer?: number }
  ) => Promise<{ code: number | null; stdout: string; stderr: string }>;

  // libs
  shell: any;
  clipboard: {
    writeText: (text: string) => void;
    readText: () => string;
  };
  fs: typeof import('fs');
  path: typeof import('path');
  mime: any;
  url: any;

  // sqlite
  sqlite: {
    isSupported: () => Promise<boolean>;
    upsertChunks: (chunks: { id: string; doc_id: string; kb_id: string; model_id: string; content_hash: string; content: string; embedding: number[] }[]) => Promise<boolean>;
    updateChunks: (chunks: any[]) => Promise<any>;
    deleteChunksByDoc: (docId: string) => Promise<boolean>;
    deleteChunksByKb: (kbId: string) => Promise<boolean>;
    getChunkCountsByDoc: (params: { doc_ids: string[] }) => Promise<{ doc_id: string; count: number }[]>;
    search: (options: { kb_id: string; model_id?: string; queryEmbedding: number[]; topK: number; similarityThreshold?: number }) => Promise<any>;
    getAllChunks: () => Promise<any>;
    getChunksByHash: (params: { content_hashes: string[]; model_id: string }) => Promise<{ content_hash: string; embedding: number[] }[]>;
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
  setTitleBarTheme: (isDarkMode: boolean) => Promise<boolean>;
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
    download: (options: { url: string; destPath: string; id?: string; offset?: number }) => Promise<{
      ok: boolean;
      error?: string;
      aborted?: boolean;
      alreadyComplete?: boolean;
    }>;
    onDownloadProgress: (id: string, callback: (progress: DownloadProgress) => void) => () => void;
    cancelDownload: (id: string) => Promise<boolean>;
  };

  searchReplace: {
    execute: (payload: {
      baseDir: string;
      type?: 'modify' | 'add' | 'delete' | 'move' | 'update' | 'create' | 'remove' | 'rename';
      filePath: string;
      oldStr?: string;
      newStr?: string;
      targetPath?: string;
      overwrite?: boolean;
    }) => Promise<{
      ok: boolean;
      summary?: string;
      error?: string;
    }>;
  };

  sync: {
    startHost: (options?: { displayName?: string; port?: number }) => Promise<SyncHostState>;
    stopHost: () => Promise<SyncHostState>;
    getHostState: () => Promise<SyncHostState>;
    updateProfile: (options: { displayName?: string }) => Promise<SyncHostState>;
    publishSnapshot: (payload: { deviceId: string; displayName: string; snapshot: SyncSnapshot }) => Promise<{ ok: boolean }>;
    listEndpoints: () => Promise<SyncEndpoint[]>;
    getEndpointSnapshot: (deviceId: string) => Promise<SyncSnapshot | null>;
    onEvent: (callback: (event: SyncEvent) => void) => () => void;
  };

  computer: {
    isAvailable: () => Promise<{
      available: boolean;
      error?: string;
      screen?: { width: number; height: number };
      display?: {
        displayId: string;
        bounds: { x: number; y: number; width: number; height: number };
        scaleFactor: number;
        robotScreenSize: { width: number; height: number };
        captureSize: { width: number; height: number };
      };
    }>;
    getScreenSize: () => Promise<{ width: number; height: number }>;
    getMousePosition: () => Promise<{ x: number; y: number }>;
    moveMouse: (options: {
      x: number;
      y: number;
      coordinateSpace?: 'screen' | 'screenshot';
      originX?: number;
      originY?: number;
      smooth?: boolean;
      speed?: number;
      delayMs?: number;
    }) => Promise<{
      position: { x: number; y: number };
      screenPosition?: { x: number; y: number };
      screenshotPosition?: { x: number; y: number; originX: number; originY: number };
      coordinateSpace: 'screen' | 'screenshot';
    }>;
    mouseClick: (options?: {
      button?: 'left' | 'right' | 'middle';
      double?: boolean;
      x?: number;
      y?: number;
      coordinateSpace?: 'screen' | 'screenshot';
      originX?: number;
      originY?: number;
      smooth?: boolean;
      speed?: number;
      delayMs?: number;
    }) => Promise<{
      button: 'left' | 'right' | 'middle';
      double: boolean;
      position: { x: number; y: number };
      screenPosition?: { x: number; y: number };
      screenshotPosition?: { x: number; y: number; originX: number; originY: number };
      coordinateSpace: 'screen' | 'screenshot';
    }>;
    dragMouse: (options: {
      x: number;
      y: number;
      startX?: number;
      startY?: number;
      button?: 'left' | 'right' | 'middle';
      coordinateSpace?: 'screen' | 'screenshot';
      originX?: number;
      originY?: number;
      smooth?: boolean;
      speed?: number;
      delayMs?: number;
    }) => Promise<{
      button: 'left' | 'right' | 'middle';
      position: { x: number; y: number };
      coordinateSpace: 'screen' | 'screenshot';
    }>;
    scrollMouse: (options: { x: number; y: number; delayMs?: number }) => Promise<{
      x: number;
      y: number;
      position: { x: number; y: number };
    }>;
    typeText: (options: { text: string; cpm?: number; delayMs?: number }) => Promise<{ textLength: number }>;
    keyTap: (options: { key: string; modifiers?: string[]; delayMs?: number }) => Promise<{
      key: string;
      modifiers: string[];
    }>;
    getPixelColor: (options: {
      x: number;
      y: number;
      coordinateSpace?: 'screen' | 'screenshot';
      originX?: number;
      originY?: number;
    }) => Promise<{ x: number; y: number; color: string; coordinateSpace: 'screen' | 'screenshot' }>;
    captureScreen: (options?: {
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      format?: 'png' | 'jpeg';
      quality?: number;
    }) => Promise<{
      x: number;
      y: number;
      width: number;
      height: number;
      bytesPerPixel: number;
      dataUrl: string;
      rawDataUrl?: string;
      imageFormat?: 'png' | 'jpeg';
      imageQuality?: number;
      annotation?: {
        minorGridPx: number;
        majorGridPx: number;
        originMarker: { x: number; y: number; size: number };
      };
      coordinateSpace: 'screenshot';
      displayId?: string;
      display?: {
        displayId: string;
        bounds: { x: number; y: number; width: number; height: number };
        scaleFactor: number;
        robotScreenSize: { width: number; height: number };
        captureSize: { width: number; height: number };
      };
    }>;
  };
}

declare global {
  interface ElectronAPI extends _ElectronAPI {}
}

type _ElectronAPI = ElectronAPI
