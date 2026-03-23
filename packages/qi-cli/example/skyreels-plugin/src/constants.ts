export const PLUGIN_NAME = 'skyreels-plugin'
export const PROVIDER_ID = 'skyreels'
export const PROVIDER_NAME = 'SkyReels'
export const DEFAULT_BASE_URL = 'https://api-gateway.skyreels.ai'
export const DEFAULT_MODEL_ID = 'skyreels-v4-video'
export const PROVIDER_LOGO = '/images/providers/openai.png'
export const STORAGE_KEY = 'skyreels-plugin-config'

export const SKYREELS_ENDPOINTS = {
  text2video: {
    submitPath: '/api/v1/video/text2video/submit',
    queryPath: (taskId: string) => `/api/v1/video/text2video/task/${taskId}`
  },
  image2video: {
    submitPath: '/api/v1/video/image2video/submit',
    queryPath: (taskId: string) => `/api/v1/video/image2video/task/${taskId}`
  },
  omni: {
    submitPath: '/api/v1/video/omni-video/submit',
    queryPath: (taskId: string) => `/api/v1/video/omni-video/task/${taskId}`
  }
} as const

export type SkyReelsCapability = keyof typeof SKYREELS_ENDPOINTS
