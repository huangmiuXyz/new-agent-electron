import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/server/index.ts'),
      fileName: 'server',
      formats: ['cjs']
    },
    rollupOptions: {
      external: ['http', 'path', 'fs', 'url', 'events'],
      output: {
        dir: 'dist',
        entryFileNames: 'server.js',
      }
    },
    outDir: 'dist',
    emptyOutDir: false,
    minify: false,
    target: 'node20',
    ssr: true,
    ssrEmitAssets: false
  },
  ssr: {
    noExternal: true
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
});
