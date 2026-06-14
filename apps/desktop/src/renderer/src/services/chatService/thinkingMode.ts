/**
 * 思考模式（thinkingMode）相关的共享逻辑。
 *
 * 思考深度在不同 providerType 下取值范围不同：
 *   - deepseek:           high | max
 *   - xai:                low | high
 *   - minimax-m3:         adaptive
 *   - 其它（默认）:        low | medium | high | xhigh
 *
 * thinkingMode 作为全局单值保存，切换模型/provider 时需要按新的
 * providerType 校正到合法取值，否则后端会收到不兼容的思考参数而报错。
 */

export type ThinkingDepth = 'low' | 'medium' | 'high' | 'max' | 'adaptive' | 'xhigh'

export interface ThinkingDepthOption {
  label: string
  value: ThinkingDepth
  desc: string
}

/** 按"思考强度"递增排列的有序档位，用于跨 provider 降级时找最近邻 */
const ORDERED_DEPTHS: ThinkingDepth[] = ['adaptive', 'low', 'medium', 'high', 'xhigh', 'max']

const DEPTH_RANK: Record<ThinkingDepth, number> = ORDERED_DEPTHS.reduce(
  (acc, depth, index) => {
    acc[depth] = index
    return acc
  },
  {} as Record<ThinkingDepth, number>
)

/** 判断给定 provider/model 是否为 MiniMax-M3（openai-compatible 下的特殊分支） */
export const isMiniMaxM3Provider = (
  providerType?: string | null,
  providerId?: string,
  modelId?: string
) => {
  if (providerType !== 'openai-compatible') return false
  return (
    (modelId || '').toLowerCase().includes('minimax-m3') ||
    (providerId || '').toLowerCase().includes('minimax')
  )
}

/** 判断给定 providerType 是否支持思考模式切换 */
export const supportsThinkingToggle = (providerType?: string | null): boolean => {
  if (!providerType) return false
  return [
    'anthropic',
    'deepseek',
    'google',
    'openai',
    'xai',
    'openrouter',
    'openai-compatible'
  ].includes(providerType)
}

/** 返回某 provider/model 下合法的思考深度档位（保持展示顺序） */
export const getThinkingDepthOptions = (params: {
  providerType?: string | null
  providerId?: string
  modelId?: string
}): ThinkingDepthOption[] => {
  const { providerType, providerId, modelId } = params
  if (!providerType) return []

  if (isMiniMaxM3Provider(providerType, providerId, modelId)) {
    return [{ label: '自适应', value: 'adaptive', desc: 'MiniMax-M3 自适应思考' }]
  }

  if (providerType === 'deepseek') {
    return [
      { label: '高', value: 'high', desc: '标准思考' },
      { label: '最大', value: 'max', desc: '深度思考' }
    ]
  }

  if (providerType === 'xai') {
    return [
      { label: '低', value: 'low', desc: '轻量思考' },
      { label: '高', value: 'high', desc: '深度思考' }
    ]
  }

  return [
    { label: '低', value: 'low', desc: '轻量思考' },
    { label: '中', value: 'medium', desc: '均衡思考' },
    { label: '高', value: 'high', desc: '深度思考' },
    { label: '超高', value: 'xhigh', desc: '最大思考' }
  ]
}

/**
 * 校正 thinkingMode 到目标 provider/model 支持的最近档位。
 *
 * - 关闭态（null/undefined）保持不变；
 * - 已是合法档位则原样返回；
 * - 否则按强度 rank 找到最接近且不超过的合法档位，若没有更低档则取最低档；
 * - 找不到任何合法档位（例如目标 provider 不支持思考）时返回 null。
 */
export const correctThinkingMode = (
  current: string | null | undefined,
  params: { providerType?: string | null; providerId?: string; modelId?: string }
): ThinkingDepth | null => {
  if (current == null || current === '') return null

  if (!supportsThinkingToggle(params.providerType)) return null

  const validOptions = getThinkingDepthOptions(params)
  if (validOptions.length === 0) return null

  const validDepths = validOptions.map((option) => option.value)

  // 原样命中
  if (validDepths.includes(current as ThinkingDepth)) {
    return current as ThinkingDepth
  }

  // MiniMax-M3 只认 adaptive
  if (isMiniMaxM3Provider(params.providerType, params.providerId, params.modelId)) {
    return 'adaptive'
  }

  // 找强度不高于 current 的最大合法档位
  const currentRank = (DEPTH_RANK[current as ThinkingDepth] ?? DEPTH_RANK['medium'])
  const lowerOrEqual = validDepths
    .filter((depth) => DEPTH_RANK[depth] <= currentRank)
    .sort((a, b) => DEPTH_RANK[b] - DEPTH_RANK[a])

  if (lowerOrEqual.length > 0) {
    return lowerOrEqual[0]
  }

  // current 比所有合法档位都低，取最低档
  return validDepths.sort((a, b) => DEPTH_RANK[a] - DEPTH_RANK[b])[0]
}
