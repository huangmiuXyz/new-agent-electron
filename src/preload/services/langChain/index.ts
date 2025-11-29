import { ClientConfig, MultiServerMCPClient } from '@langchain/mcp-adapters'

export const langChainServices = () => {
  let client: MultiServerMCPClient
  const create_client = (config: ClientConfig) => {
    client = new MultiServerMCPClient(config)
    return client
  }
  const list_tools = async () => {
    return await client.getTools()
  }
  return {
    create_client,
    list_tools
  }
}
