import { defineConfig } from 'vite'
import { resolve } from 'path'
import vueJsx from '@vitejs/plugin-vue-jsx'

export default defineConfig({
  plugins: [vueJsx()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'process.env': JSON.stringify({ NODE_ENV: 'production' }),
    'process.emit': 'undefined'
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'plugin',
      fileName: 'index',
      formats: ['iife']
    },
    rollupOptions: {
      external: ['vue', 'vue/jsx-runtime'],
      output: {
        dir: 'dist',
        entryFileNames: 'index.js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]',
        inlineDynamicImports: true,
        globals: {
          vue: 'Vue',
          'vue/jsx-runtime': 'Vue',
        },
      },
    },
    outDir: 'dist',
    emptyOutDir: false,
    minify: false,
    target: 'esnext'
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
})
