import { ClientConfig } from '@langchain/mcp-adapters'

declare global {
  type ExtendedServerConfig = ClientConfig['mcpServers'][string] & {
    active: boolean
    name: string
    tools?: Tools
    description?: string
  }
  type McpServers = Record<string, ExtendedServerConfig>
}

export {}
