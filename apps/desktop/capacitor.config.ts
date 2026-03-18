import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.agentqi.app',
  appName: 'agent-qi',
  webDir: 'out/renderer',
  backgroundColor: '#fbfbfb',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    CapacitorHttp: {
      enabled: true
    }
  }
}

export default config
