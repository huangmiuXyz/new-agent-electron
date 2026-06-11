const cleanProviderOptions = (value: any): any => {
  if (Array.isArray(value)) {
    const cleanedArray = value
      .map((item) => cleanProviderOptions(item))
      .filter((item) => item !== undefined)
    return cleanedArray.length > 0 ? cleanedArray : undefined
  }

  if (value && typeof value === 'object') {
    const cleanedEntries = Object.entries(value)
      .map(([key, nestedValue]) => [key, cleanProviderOptions(nestedValue)] as const)
      .filter(([, nestedValue]) => nestedValue !== undefined)

    return cleanedEntries.length > 0 ? Object.fromEntries(cleanedEntries) : undefined
  }

  if (value === '' || value === null || value === undefined) {
    return undefined
  }

  return value
}

const isMiniMaxM3Request = (provider: string, baseURL: string, model: string) => {
  const providerName = provider.toLowerCase()
  const providerBaseURL = baseURL.toLowerCase()
  const modelName = model.toLowerCase()
  return (
    modelName.includes('minimax-m3') ||
    providerName.includes('minimax') ||
    providerBaseURL.includes('minimax')
  )
}

const stripThinkingRuntimeOptions = (options: Record<string, any>) => {
  const {
    thinking,
    thinkingConfig,
    thinking_config,
    reasoning,
    reasoningEffort,
    reasoning_effort,
    reasoningSummary,
    reasoning_summary,
    forceReasoning,
    force_reasoning,
    sendReasoning,
    send_reasoning,
    enable_thinking,
    effort,
    taskBudget,
    task_budget,
    ...rest
  } = options

  const sanitized = { ...rest }

  if (Array.isArray(sanitized.include)) {
    sanitized.include = sanitized.include.filter(
      (item: unknown) => typeof item !== 'string' || !item.includes('reasoning')
    )
    if (sanitized.include.length === 0) {
      delete sanitized.include
    }
  }

  if (sanitized.contextManagement?.edits && Array.isArray(sanitized.contextManagement.edits)) {
    const edits = sanitized.contextManagement.edits.filter(
      (edit: unknown) =>
        !(
          edit &&
          typeof edit === 'object' &&
          'type' in edit &&
          typeof edit.type === 'string' &&
          edit.type.includes('thinking')
        )
    )

    if (edits.length > 0) {
      sanitized.contextManagement = {
        ...sanitized.contextManagement,
        edits
      }
    } else {
      delete sanitized.contextManagement
    }
  }

  return sanitized
}

const getInputAudioMimeType = (format?: unknown): string => {
  return format === 'mp3' ? 'audio/mpeg' : 'audio/wav'
}

const normalizeInputAudioDataUrls = (value: any): any => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeInputAudioDataUrls(item))
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  if (value.type === 'input_audio' && value.input_audio && typeof value.input_audio === 'object') {
    const data = value.input_audio.data
    const format = value.input_audio.format
    const normalizedData =
      typeof data === 'string' && data.startsWith('data:')
        ? data
        : typeof data === 'string'
          ? `data:${getInputAudioMimeType(format)};base64,${data}`
          : data

    return {
      ...value,
      input_audio: {
        data: normalizedData
      }
    }
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      normalizeInputAudioDataUrls(nestedValue)
    ])
  )
}

const buildOpenAICompatibleTransformRequestBody = (params: {
  transformRequestBody?: string
  isMiniMaxM3OpenAICompatible: boolean
  normalizeInputAudio?: boolean
  thinkingMode?: string | null
}) => {
  const { transformRequestBody, isMiniMaxM3OpenAICompatible, normalizeInputAudio, thinkingMode } =
    params
  let parsedTransform: Record<string, any> | undefined
  try {
    if (transformRequestBody?.trim()) {
      const parsed = JSON.parse(transformRequestBody)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        console.warn('transformRequestBody 必须是 JSON 对象字符串')
      } else {
        parsedTransform = parsed
      }
    }
  } catch (error) {
    console.warn('transformRequestBody JSON 解析失败:', error)
  }

  if (!parsedTransform && !isMiniMaxM3OpenAICompatible && !normalizeInputAudio) return undefined

  return (args: Record<string, any>) => {
    let next = {
      ...args,
      ...parsedTransform
    }

    if (isMiniMaxM3OpenAICompatible) {
      delete next.reasoningEffort
      delete next.reasoning_effort
      delete next.enable_thinking
      next.thinking = {
        type: thinkingMode ? 'adaptive' : 'disabled'
      }
    }

    if (normalizeInputAudio) {
      next = normalizeInputAudioDataUrls(next)
    }

    return next
  }
}

const buildThinkingProviderOptions = (providerType: providerType, thinkingMode?: string | null) => {
  const thinkingToggleProviders = new Set([
    'anthropic',
    'deepseek',
    'google',
    'openai',
    'xai',
    'openrouter',
    'openai-compatible'
  ])

  const supportsThinkingToggle = thinkingToggleProviders.has(providerType)
  const thinkingProviderOptions: Record<string, unknown> = {}
  if (!supportsThinkingToggle) return thinkingProviderOptions

  const depth = thinkingMode
  const normalizedDepth = depth === 'adaptive' ? 'medium' : depth
  const thinkingEnabled = Boolean(depth)

  switch (providerType) {
    case 'anthropic':
      thinkingProviderOptions.thinking = thinkingEnabled
        ? { type: 'enabled' }
        : { type: 'disabled' }
      break
    case 'deepseek':
      thinkingProviderOptions.thinking = {
        type: thinkingEnabled ? 'enabled' : 'disabled'
      }
      thinkingProviderOptions.enable_thinking = thinkingEnabled
      if (thinkingEnabled) {
        thinkingProviderOptions.reasoningEffort = normalizedDepth === 'max' ? 'max' : 'high'
      }
      break
    case 'google':
      thinkingProviderOptions.thinkingConfig = {
        includeThoughts: thinkingEnabled,
        ...(thinkingEnabled ? { thinkingLevel: normalizedDepth } : { thinkingBudget: 0 })
      }
      break
    case 'openai':
      thinkingProviderOptions.reasoningEffort = thinkingEnabled ? normalizedDepth : 'none'
      break
    case 'xai':
      if (thinkingEnabled) {
        thinkingProviderOptions.reasoningEffort = normalizedDepth === 'low' ? 'low' : 'high'
      }
      break
    case 'openrouter':
      thinkingProviderOptions.reasoning = thinkingEnabled
        ? { enabled: true, effort: normalizedDepth }
        : { enabled: false }
      break
    case 'openai-compatible':
      thinkingProviderOptions.reasoningEffort = thinkingEnabled ? normalizedDepth : 'none'
      break
  }

  return thinkingProviderOptions
}

export const resolveProviderRuntime = (params: {
  providerType: providerType
  provider: string
  baseURL: string
  model: string
  thinkingMode?: string | null
  customProviderOptions?: Record<string, any>
}) => {
  const { providerType, provider, baseURL, model, thinkingMode, customProviderOptions } = params
  const isMiniMaxM3OpenAICompatible =
    providerType === 'openai-compatible' && isMiniMaxM3Request(provider, baseURL, model)

  const transformRequestBody = buildOpenAICompatibleTransformRequestBody({
    transformRequestBody: customProviderOptions?.transformRequestBody,
    isMiniMaxM3OpenAICompatible,
    normalizeInputAudio: providerType === 'openai-compatible',
    thinkingMode
  })

  const { transformRequestBody: _transformRequestBody, ...runtimeProviderOptions } =
    customProviderOptions || {}
  const sanitizedRuntimeProviderOptions = stripThinkingRuntimeOptions(runtimeProviderOptions)
  const providerOptionsKey = providerType === 'openai-compatible' ? provider : providerType
  const thinkingProviderOptions = buildThinkingProviderOptions(providerType, thinkingMode)

  if (isMiniMaxM3OpenAICompatible) {
    delete thinkingProviderOptions.reasoningEffort
  }

  const mergedProviderOptions =
    cleanProviderOptions({
      ...sanitizedRuntimeProviderOptions,
      ...thinkingProviderOptions
    }) || {}

  return {
    providerOptionsKey,
    mergedProviderOptions,
    transformRequestBody
  }
}
