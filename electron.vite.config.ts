import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      sourcemap: true,
      rollupOptions: {
        external: ['better-sqlite3']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      sourcemap: true
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    optimizeDeps: {
      exclude: ['@chevrotain/regexp-to-ast']
    },
    plugins: [
      vue(),
      vueJsx(),
      vueDevTools(),
      AutoImport({
        imports: ['vue', 'vue-router', 'pinia'],
        dts: 'src/auto-imports.d.ts',
        vueTemplate: true,
        dirs: ['src/composables', 'src/utils', 'src/stores', 'src/services']
      }),
      Components({
        dirs: ['src/components', 'src/pages'],
        directoryAsNamespace: true,
        dts: 'src/components.d.ts'
      })
    ],
    server: {
      port: 3000
    }
  }
})
