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

    const serverPath = api.path.join(this.pluginPath, 'dist', 'server.cjs');

    // 启动服务器的命令
    // 我们将 API Key 作为环境变量传递
    const isWin = navigator.platform.toLowerCase().includes('win');
    const apiKeyEnv = this.apiKey || 'DUMMY_KEY';
    const command = isWin
      ? `set CIVITAI_API_KEY=${apiKeyEnv} && set PORT=${this.serverPort} && node "${serverPath}"`
      : `CIVITAI_API_KEY=${apiKeyEnv} PORT=${this.serverPort} node "${serverPath}"`;

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
   * 更新服务器配置 (如 API Key)
   */
  async updateConfig(apiKey: string) {
    this.apiKey = apiKey;
    await this.ensureServer();
    const response = await fetch(`${this.serverUrl}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey })
    });
    return response.json();
  }

  /**
   * 生成图片
   */
  async generateImage(params: any) {
    console.log('JSBridge: Starting generateImage');
    await this.ensureServer();
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s 超时

    try {
      console.log('JSBridge: Fetching /api/generate');
      const response = await fetch(`${this.serverUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ params, apiKey: this.apiKey }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      console.log('JSBridge: /api/generate response received');
      
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      return data;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Generate request timed out after 30s. The server might be busy or stuck.');
      }
      throw error;
    }
  }

  /**
   * 获取任务状态
   */
  async getJobStatus(jobId: string) {
    await this.ensureServer();
    const url = new URL(`${this.serverUrl}/api/jobs/${jobId}`);
    if (this.apiKey) url.searchParams.append('apiKey', this.apiKey);

    const response = await fetch(url.toString());
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  /**
   * 获取模型列表 - 直接使用 fetch API 请求 Civitai 官方接口
   */
  async listModels(params: any = {}) {
    const { nextUrl, ...restParams } = params;
    let urlString = nextUrl;

    if (!urlString) {
      const url = new URL('https://civitai.com/api/v1/models');
      Object.entries(restParams).forEach(([key, value]) => {
        if (value !== undefined) url.searchParams.append(key, String(value));
      });
      if (!url.searchParams.has('limit')) url.searchParams.append('limit', '20');
      if (!url.searchParams.has('types')) url.searchParams.append('types', 'Checkpoint');
      urlString = url.toString();
    }

    const response = await fetch(urlString, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to fetch models: ${response.statusText}`);
    }

    return response.json();
  }
}
