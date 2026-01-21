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

    const isWin = navigator.platform.toLowerCase().includes('win');
    const apiKeyEnv = this.apiKey || 'DUMMY_KEY';
    const command = isWin
      ? `set CIVITAI_API_KEY=${apiKeyEnv} && set PORT=${this.serverPort} && node "${serverPath}"`
      : `CIVITAI_API_KEY=${apiKeyEnv} PORT=${this.serverPort} node "${serverPath}"`;

    // 异步执行并捕获输出
    api.exec(command, (error: any, stdout: string, stderr: string) => {
      if (error) {
        console.error('Civitai Server Error:', error);
      }
      if (stdout) console.log('[Civitai Server]:', stdout);
      if (stderr) console.error('[Civitai Server Error]:', stderr);
    });

    for (let i = 0; i < 15; i++) {
      try {
        const response = await fetch(`${this.serverUrl}/health`);
        if (response.ok) return;
      } catch (e) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    throw new Error('Timeout waiting for Civitai server to start');
  }

  /**
   * 更新配置 (如 API Key)
   */
  async updateConfig(apiKey: string) {
    this.apiKey = apiKey;
    try {
      await fetch(`${this.serverUrl}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey })
      });
    } catch (e) {
      // Server might not be running yet
    }
  }

  /**
   * 生成图片 - 通过本地 Node 服务器代理
   */
  async generateImage(params: any) {
    console.log('JSBridge: Starting generateImage via Node Server Proxy', params);
    await this.ensureServer();

    try {
      const response = await fetch(`${this.serverUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ params, apiKey: this.apiKey })
      });

      const data = await response.json();
      if (data.error) {
        console.error('JSBridge: Server returned error:', data);
        throw new Error(`Server Error: ${data.error}. Details: ${JSON.stringify(data.details || data.errorBody)}`);
      }
      console.log('JSBridge: Generate success:', data);
      return data;
    } catch (error: any) {
      console.error('JSBridge: Fetch failed:', error);
      throw error;
    }
  }

  /**
   * 获取任务状态 - 通过本地 Node 服务器代理
   */
  async getJobStatus(jobId: string) {
    console.log('JSBridge: Getting status for jobId:', jobId);
    await this.ensureServer();

    try {
      const response = await fetch(`${this.serverUrl}/api/jobs/${jobId}?apiKey=${this.apiKey}`);
      const data = await response.json();
      if (data.error) {
        console.error('JSBridge: Status check failed:', data);
        throw new Error(`Status Error: ${data.error}`);
      }
      return data;
    } catch (error: any) {
      console.error('JSBridge: Status fetch failed:', error);
      throw error;
    }
  }

  /**
   * 获取模型列表 - 直接 fetch
   */
  async listModels(params: any = {}) {
    const { nextUrl, ...restParams } = params;
    let urlString = nextUrl;

    if (!urlString) {
      const url = new URL('https://civitai.com/api/v1/models');

      const searchParams = { ...restParams };
      delete searchParams.page;

      Object.entries(searchParams).forEach(([key, value]) => {
        if (value !== undefined && value !== '' && value !== null) {
          if (Array.isArray(value)) {
            value.forEach((v) => url.searchParams.append(key, String(v)))
          } else if (typeof value === 'boolean') {
            // 显式处理布尔值：只发送为 true 的布尔值
            // 如果 API 报错 "expected boolean, received string"，可能是因为后端对 query params 的校验过于严格
            // 且不支持 "false" 字符串的 coerce。
            // 通常 API 的布尔参数默认值为 false，所以只在 true 时发送 'true' 可能是更安全的做法。
            if (value) {
              url.searchParams.append(key, 'true')
            }
          } else {
            url.searchParams.append(key, String(value))
          }
        }
      })
      if (!url.searchParams.has('limit')) url.searchParams.append('limit', '20');
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

  /**
   * 获取模型版本详情
   */
  async getModelVersion(versionId: string | number) {
    const response = await fetch(`https://civitai.com/api/v1/model-versions/${versionId}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to fetch model version: ${response.statusText}`);
    }

    return response.json();
  }
}
