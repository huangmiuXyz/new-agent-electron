import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPersist from 'pinia-plugin-persistedstate-async'

import './utils/zod-extensions'
import App from './App.vue'
import router from './router'
import Button from './components/Button.vue'
import Switch from './components/Switch.vue'
import Input from './components/Input.vue'
import SelectorPopover from './components/SelectorPopover.vue'
import DownloadProgress from './components/DownloadProgress.vue'
import Select from './components/Select.vue'
import Image from './components/Image.vue'
import Loading from './components/Loading.vue'
import { setPluginLoader } from './services/plugins/pluginLoaderInstance'

const app = createApp(App)

const pinia = createPinia()
pinia.use(piniaPersist)

app.use(pinia)
app.use(router)

// 动态导入 PluginLoader（含 JSZip），避免启动时同步加载
// registerComponents 必须在 mount 前完成，所以在 then 链中确保顺序
import('./services/plugins/pluginLoader').then(({ PluginLoader }) => {
  const pluginLoader = new PluginLoader(app, pinia, router)
  pluginLoader.registerComponents({
    Button,
    Switch,
    DownloadProgress,
    Image,
    Loading,
    Input,
    SelectorPopover,
    Select
  })

  setPluginLoader(pluginLoader)

  router.isReady().then(() => {
    app.mount('#app')
  })
})
