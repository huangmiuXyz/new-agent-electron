export const onUseAIBefore = async ({
  model,
  providerType,
  apiKey,
  baseURL
}: {
  model?: string
  providerType: providerType
  apiKey: string
  baseURL: string
}) => {
  if (providerType === 'ollama') {
    const url = baseURL
    const isRunning = async (): Promise<boolean> => {
      try {
        const res = await fetch(`${url}/models`, {
          method: 'GET',
          signal: AbortSignal.timeout(1500)
        })
        return res.ok
      } catch {
        return false
      }
    }

    const waitUntilRunning = async (timeoutMs = 10_000, intervalMs = 500): Promise<boolean> => {
      const start = Date.now()

      while (Date.now() - start < timeoutMs) {
        if (await isRunning()) {
          return true
        }
        await new Promise((r) => setTimeout(r, intervalMs))
      }

      return false
    }
    try {
      await execPromise('ollama --version')
    } catch {
      messageApi.error('未检测到 Ollama，请先安装。')
      throw new Error('ollama not installed')
    }
    if (!(await isRunning())) {
      window.api.startOllama()
      messageApi.info('自动启动ollama。')

      const ok = await waitUntilRunning(10_000, 500)
      if (!ok) {
        throw new Error('ollama start timeout')
      }
    }
  }
}
