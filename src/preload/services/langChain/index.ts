import { ClientConfig, MultiServerMCPClient } from '@langchain/mcp-adapters'
import { initChatModel } from 'langchain'
import { createAgent } from 'langchain'
import { MemorySaver } from '@langchain/langgraph'

const checkpointer = new MemorySaver()
export const langChainServices = () => {
  const create_client = async (
    config: ClientConfig,
    modelName: string,
    modelProvider: string
  ): Promise<ReturnType<typeof createAgent>> => {
    const model = await initChatModel(modelName, {
      modelProvider
    })
    const client = new MultiServerMCPClient(config)
    const tools = await client.getTools()
    const agent = createAgent({
      model,
      tools,
      checkpointer
    })
    return agent
  }
  return {
    create_client
  }
}
