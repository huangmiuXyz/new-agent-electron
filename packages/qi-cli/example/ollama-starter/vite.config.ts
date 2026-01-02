import { defineConfig } from 'vite';
import { resolve } from 'path';


export default defineConfig({
  
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
      output: {
        dir: 'dist',
        entryFileNames: 'index.js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]',
        inlineDynamicImports: true
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
