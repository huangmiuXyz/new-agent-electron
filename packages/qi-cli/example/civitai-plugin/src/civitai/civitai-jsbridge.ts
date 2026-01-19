/**
 * Civitai JSBridge - 用于在渲染进程中通过 Node.js 环境执行 Civitai SDK
 */

export interface CivitaiBridgeOptions {
  apiKey: string;
  pluginPath: string;
}

export class CivitaiSDKBridge {
  private apiKey: string;
  private pluginPath: string;
  private serverPort: number = 18888;
  private serverUrl: string = `http://localhost:18888`;

  constructor(options: CivitaiBridgeOptions) {
    this.apiKey = options.apiKey;
    this.pluginPath = options.pluginPath;
  }

  /**
   * 确保 Node.js 服务器正在运行
   */
  private async ensureServer(): Promise<void> {
    try {
      const response = await fetch(`${this.serverUrl}/health`);
      if (response.ok) return;
    } catch (e) {
      // Server not running, start it
    }

    const api = (window as any).api;
    if (!api || !api.exec) {
      throw new Error('JSBridge (window.api.exec) not found. Are you running in Electron?');
    }

    const serverPath = api.path.join(this.pluginPath, 'dist', 'server.js');

    // 启动服务器的命令
    // 我们将 API Key 作为环境变量传递
    const isWin = navigator.platform.toLowerCase().includes('win');
    const command = isWin
      ? `set CIVITAI_API_KEY=${this.apiKey} && set PORT=${this.serverPort} && node "${serverPath}"`
      : `CIVITAI_API_KEY=${this.apiKey} PORT=${this.serverPort} node "${serverPath}"`;

    // 异步执行，不等待结束（因为它是一个长运行的服务）
    api.exec(command, (error: any) => {
      if (error) {
        console.error('Failed to start Civitai server:', error);
      }
    });

    // 等待服务器启动
    for (let i = 0; i < 10; i++) {
      try {
        const response = await fetch(`${this.serverUrl}/health`);
        if (response.ok) return;
      } catch (e) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    throw new Error('Timeout waiting for Civitai server to start');
  }

  /**
   * 向服务器发送请求
   */
  private async request(action: string, params: any): Promise<any> {
    await this.ensureServer();

    const response = await fetch(this.serverUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action, params })
    });

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error);
    }
    return data;
  }

  /**
   * 模拟 SDK 的 image.fromText
   */
  async generateImage(params: any) {
    return this.request('generateImage', params);
  }

  /**
   * 模拟获取任务状态
   */
  async getJobStatus(jobId: string) {
    return this.request('getJobStatus', { jobId });
  }
}
