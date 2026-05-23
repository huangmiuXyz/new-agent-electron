const MOBILE_UNSUPPORTED_SETTING_IDS = new Set([
  'system',
  'shortcuts',
  'knowledge',
  'mcp',
  'plugins',
  'terminal',
  'userData',
  'backup'
])

const MOBILE_UNSUPPORTED_ROUTE_PREFIXES = ['/mobile/my-apps', '/mobile/image/speech']

export const isMobileSettingSupported = (settingId: string) => {
  return !MOBILE_UNSUPPORTED_SETTING_IDS.has(settingId)
}

export const isMobileRouteSupported = (path: string) => {
  return !MOBILE_UNSUPPORTED_ROUTE_PREFIXES.some((prefix) => path.startsWith(prefix))
}
