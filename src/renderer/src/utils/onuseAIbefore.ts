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

    const isInstalled = (): Promise<boolean> =>
      new Promise((resolve) => {
        window.api.exec('ollama --version', (err) => resolve(!err))
      })

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

    if (!(await isInstalled())) {
      messageApi.error('未检测到 Ollama，请先安装。')
      throw new Error('ollama not installed')
    }
    if (!(await isRunning())) {
      window.api.startOllama(getHost(url))

      const ok = await waitUntilRunning(10_000, 500)
      if (!ok) {
        throw new Error('ollama start timeout')
      }
    }
  }
}
