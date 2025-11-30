import type { ClientConfig } from '@langchain/mcp-adapters'

export class MCPService {
  static async getTools(config: ClientConfig, cache: boolean = true) {
    return await window.api.list_tools(JSON.parse(JSON.stringify(config)), cache)
  }

  static async callTool(toolCall: any, config: ClientConfig) {
    const tools = await this.getTools(config)
    const tool = tools.find((t) => t.name === toolCall.name)
    if (!tool) throw new Error(`Tool '${toolCall.name}' not found.`)
    return await tool.func(toolCall.args)
  }
}
