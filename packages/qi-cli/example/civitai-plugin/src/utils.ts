import { AssetType, ImageJobNetworkParams } from './types'

/**
 * 映射调度器
 */
export const mapScheduler = (sampler: string) => {
  if (!sampler) return 'EulerA'
  // 移除空格和特殊字符进行匹配
  const s = sampler.toLowerCase().replace(/[^a-z0-9+]/g, '')

  if (s.includes('eulera')) return 'EulerA'
  if (s.includes('euler')) return 'Euler'

  // DPM++ 系列
  if (s.includes('dpm++2sakarras') || s.includes('dpm2sakarras')) return 'DPM2SAKarras'
  if (s.includes('dpm++2mkarras') || s.includes('dpm2mkarras')) return 'DPM2MKarras'
  if (s.includes('dpm++sdekarras') || s.includes('dpmsdekarras')) return 'DPMSDEKarras'
  if (s.includes('dpm++2sa') || s.includes('dpm2sa')) return 'DPM2SA'
  if (s.includes('dpm++2m') || s.includes('dpm2m')) return 'DPM2M'
  if (s.includes('dpm++sde') || s.includes('dpmsde')) return 'DPMSDE'

  // DPM2 系列
  if (s.includes('dpm2akarras')) return 'DPM2AKarras'
  if (s.includes('dpm2a')) return 'DPM2A'
  if (s.includes('dpm2karras')) return 'DPM2Karras'
  if (s.includes('dpm2')) return 'DPM2'

  // 其他
  if (s.includes('lmskarras')) return 'LMSKarras'
  if (s.includes('lms')) return 'LMS'
  if (s.includes('heun')) return 'Heun'
  if (s.includes('dpmfast')) return 'DPMFast'
  if (s.includes('dpmadaptive')) return 'DPMAdaptive'
  if (s.includes('ddim')) return 'DDIM'
  if (s.includes('plms')) return 'PLMS'
  if (s.includes('unipc')) return 'UniPC'
  if (s.includes('lcm')) return 'LCM'
  if (s.includes('ddpm')) return 'DDPM'
  if (s.includes('deis')) return 'DEIS'

  return 'EulerA'
}

/**
 * 解析尺寸
 */
export const parseSize = (meta: any) => {
  const rawSize = meta.Size || meta.size
  if (rawSize && typeof rawSize === 'string') {
    // 处理 "512x768" 格式
    if (rawSize.includes('x')) return rawSize
    // 处理 "512, 768" 格式
    if (rawSize.includes(',')) return rawSize.replace(/\s/g, '').replace(',', 'x')
  }
  // 处理独立的 width 和 height 字段
  const w = meta.width || meta.Width || meta.ADetailer_inpaint_width
  const h = meta.height || meta.Height || meta.ADetailer_inpaint_height
  if (w && h) return `${w}x${h}`

  return '1024x1024'
}

/**
 * 根据 hash 获取 AIR
 */
const airCache: Record<string, string> = {}
export const getAirByHash = async (hash: string) => {
  if (!hash) return null
  if (airCache[hash]) return airCache[hash]

  try {
    const response = await fetch(`https://civitai.com/api/v1/model-versions/by-hash/${hash}`)
    if (!response.ok) return null
    const data = await response.json()
    if (data && data.air) {
      airCache[hash] = data.air
      return data.air
    }
  } catch (e) {
    console.error(`Failed to fetch AIR for hash ${hash}:`, e)
  }
  return null
}

/**
 * 处理 additionalNetworks (Lora, Vae, Hypernetwork 等)
 */
export const parseAdditionalNetworks = async (meta: any, details: any) => {
  const additionalNetworks: Record<string, ImageJobNetworkParams> = {}
  const typeMap: Record<string, AssetType> = {
    lora: 'Lora',
    locon: 'LoCon',
    vae: 'Vae',
    hypernetwork: 'Hypernetwork',
    textualinversion: 'TextualInversion',
    lycoris: 'Lycoris',
    checkpoint: 'Checkpoint'
  }

  if (meta.resources && Array.isArray(meta.resources)) {
    for (const res of meta.resources) {
      debugger
      const mappedType = typeMap[res.type?.toLowerCase()]
      if (mappedType) {
        let air = null
        const hash = meta[res.name] || meta[`"${res.name}`] || meta[`\\"${res.name}`]

        if (hash && typeof hash === 'string') {
          air = await getAirByHash(hash.replace(/[\\"]/g, ''))
        }

        const params: ImageJobNetworkParams = {
          type: mappedType
        }

        // In case of Lora and LoCon, set the strength of the network.
        if (mappedType === 'Lora' || mappedType === 'LoCon') {
          params.strength = res.weight || 1
        }

        // In case of a TextualInversion, set the trigger word of the network.
        if (mappedType === 'TextualInversion' && res.name) {
          params.triggerWord = res.name
        }

        additionalNetworks[air] = params
      }
    }
  }
  return additionalNetworks
}

/**
 * 简单的 debounce 函数
 */
export const debounce = (fn: Function, delay: number) => {
  let timer: any = null
  return (...args: any[]) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      fn(...args)
    }, delay)
  }
}
