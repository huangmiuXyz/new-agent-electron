import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'

// 静默 Rolldown 的 sourcemap 路径警告（pnpm monorepo 正常现象）
const origWarn = console.warn
console.warn = (...args) => {
  if (args.some(a => typeof a === 'string' && a.includes('outside its package'))) return
  origWarn.apply(console, args)
}

export default defineConfig(() => {
  // sourcemap 默认关闭以节省内存。调试时临时改为 true（或 'hidden'）
  const sourcemap = false
  return {
    main: {
      plugins: [externalizeDepsPlugin()],
      build: {
        lib: {
          entry: resolve('src/main/index.ts')
        },
        sourcemap
      }
    },
    preload: {
      plugins: [externalizeDepsPlugin()],
      build: {
        lib: {
          entry: resolve('src/preload/index.ts')
        },
        sourcemap
      }
    },
    renderer: {
      resolve: {
        alias: {
          '@renderer': resolve('src/renderer/src')
        }
      },
      optimizeDeps: {
        exclude: ['@chevrotain/regexp-to-ast'],
        rolldownOptions: {
          output: {
            sourcemapExcludeSources: true
          }
        }
      },
      plugins: [
        vue({
          script: {
            globalTypeFiles: [
              resolve('src/renderer/src/types/components.d.ts')
            ]
          }
        }),
        vueJsx(),
        AutoImport({
          imports: ['vue', 'vue-router', 'pinia'],
          dts: 'src/auto-imports.d.ts',
          vueTemplate: true,
          dirs: [
            'src/composables',
            'src/composables/**',
            'src/utils',
            'src/utils/**',
            'src/stores',
            'src/stores/**',
            'src/services',
            'src/services/**'
          ]
        }),
        Components({
          dirs: ['src/components', 'src/pages'],
          directoryAsNamespace: true,
          dts: 'src/components.d.ts',
        })
      ],
      build: {
        sourcemap,
        rollupOptions: {
          output: {
            sourcemapExcludeSources: true
          }
        }
      },
      server: {
        port: 3000,
        watch: process.env.NO_RELOAD ? { ignored: ['**/*'] } : undefined
      }
    }
  }
})
