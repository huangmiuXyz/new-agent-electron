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


const pluginLoader = new PluginLoader(app, pinia)


setPluginLoader(pluginLoader)

router.isReady().then(() => {
  app.mount('#app')
})
