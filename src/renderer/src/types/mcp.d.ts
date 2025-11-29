import { ClientConfig } from '@langchain/mcp-adapters'

declare global {
  type ExtendedServerConfig = ClientConfig['mcpServers'][string] & {
    active: boolean
  }
  type McpServers = Record<string, ExtendedServerConfig>
}

export {}
