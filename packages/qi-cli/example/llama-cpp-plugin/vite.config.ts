import { defineConfig } from 'vite';
import vueJsx from '@vitejs/plugin-vue-jsx';
import { resolve } from 'path';


export default defineConfig({
  plugins: [vueJsx()],

  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'process.env': JSON.stringify({ NODE_ENV: 'production' }),
    'process.emit': 'undefined'
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.tsx'),
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
          'vue/jsx-runtime': 'Vue'
        }
      }
    },
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
    target: 'esnext'
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
});
