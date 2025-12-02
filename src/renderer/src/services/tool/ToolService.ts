import type { ToolCall } from 'langchain'
import { ClientConfig } from '@langchain/mcp-adapters'

export interface IToolService {
  getTools(config: ClientConfig, cache?: boolean): Promise<any[]>
  callTool(toolCall: ToolCall, config: ClientConfig): Promise<any>
}

export class ToolService implements IToolService {
  async getTools(config: ClientConfig, cache: boolean = true): Promise<any[]> {
    if (!config) return []
    return await window.api.list_tools(JSON.parse(JSON.stringify(config)), cache)
  }

  async callTool(toolCall: ToolCall, config: ClientConfig): Promise<any> {
    const tools = await this.getTools(config, false)
    const tool = tools.find((t) => t.name === toolCall.name)
    if (!tool) {
      throw new Error(`Tool '${toolCall.name}' not found.`)
    }
    return await tool.func(toolCall.args)
  }
}
