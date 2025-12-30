import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPersist from 'pinia-plugin-persistedstate-async'

import App from './App.vue'
import router from './router'
import { PluginLoader } from './services/plugins/pluginLoader'
import { setPluginLoader } from './services/plugins/pluginLoaderInstance'

const app = createApp(App)

const pinia = createPinia()
pinia.use(piniaPersist)

app.use(pinia)
app.use(router)

// 初始化插件加载器
const pluginLoader = new PluginLoader(app, pinia)

// 设置插件加载器全局实例（使用 ref，可在 setup 中访问）
setPluginLoader(pluginLoader)

router.isReady().then(() => {
  app.mount('#app')
})
