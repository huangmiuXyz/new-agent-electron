import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPersist from 'pinia-plugin-persistedstate-async'

import App from './App.vue'
import router from './router'
import { PluginLoader } from './services/plugins/pluginLoader'

const app = createApp(App)

const pinia = createPinia()
pinia.use(piniaPersist)

app.use(pinia)
app.use(router)

// 初始化插件加载器
const pluginLoader = new PluginLoader(app, pinia)

// 将插件加载器挂载到全局，方便后续使用
app.config.globalProperties.$pluginLoader = pluginLoader

router.isReady().then(() => {
  app.mount('#app')
})
