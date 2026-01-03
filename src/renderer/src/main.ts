import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPersist from 'pinia-plugin-persistedstate-async'

import App from './App.vue'
import router from './router'
import Button from './components/Button.vue'
import Switch from './components/Switch.vue'
import { PluginLoader } from './services/plugins/pluginLoader'
import { setPluginLoader } from './services/plugins/pluginLoaderInstance'

const app = createApp(App)

const pinia = createPinia()
pinia.use(piniaPersist)

app.use(pinia)
app.use(router)


const pluginLoader = new PluginLoader(app, pinia)
pluginLoader.registerComponents({
  Button,
  Switch
})


setPluginLoader(pluginLoader)

router.isReady().then(() => {
  app.mount('#app')
})
