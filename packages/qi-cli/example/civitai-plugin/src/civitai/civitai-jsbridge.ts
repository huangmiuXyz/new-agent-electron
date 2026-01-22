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

  private async ensureServer(): Promise<void> {
    try {
      const response = await fetch(`${this.serverUrl}/health`);
      if (response.ok) return;
    } catch (e) {
    }

    const api = (window as any).api;
    if (!api || !api.spawn) {
      throw new Error('JSBridge (window.api.spawn) not found. Are you running in Electron?');
    }

    const serverPath = api.path.join(this.pluginPath, 'dist', 'server.cjs');

    api.spawn('node', [serverPath]);

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

  async generateImage(params: any) {
    await this.ensureServer();

    try {
      const response = await fetch(`${this.serverUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ params, apiKey: this.apiKey })
      });

      const data = await response.json();
      if (data.error) {
        throw new Error(`Server Error: ${data.error}. Details: ${JSON.stringify(data.details || data.errorBody)}`);
      }
      return data;
    } catch (error: any) {
      throw error;
    }
  }

  async getJobStatus(jobId: string) {
    await this.ensureServer();

    try {
      const response = await fetch(`${this.serverUrl}/api/jobs/${jobId}?apiKey=${this.apiKey}`);
      const data = await response.json();
      if (data.error) {
        throw new Error(`Status Error: ${data.error}`);
      }
      return data;
    } catch (error: any) {
      throw error;
    }
  }

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
            if (value) {
              url.searchParams.append(key, 'true')
            }
          } else {
            url.searchParams.append(key, String(value))
          }
        }
      });
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
