declare global {
  // 显示设置接口
  interface DisplaySettings {
    darkMode: boolean
    compactDensity: boolean
    showTimestamps: boolean
    fontSize: number
  }

  // 模型提供商接口
  interface Provider {
    id: string
    name: string
    logo: string
    apiKey?: string
    baseUrl: string
    modelType: 'openai' | 'google-genai' | 'anthropic' | 'deepseek'
    models: Model[]
  }

  // MCP 服务器接口
  interface McpServer {
    id: string
    name: string
    command: string
    args: string[]
    env: Record<string, string>
    active: boolean
  }

  // 设置状态接口
  interface SettingsState {
    display: DisplaySettings
    providers: Provider[]
    activeProviderId: string
    mcpServers: McpServer[]
  }
}

export {}
