import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/main.ts'),
      name: 'mainPlugin',
      fileName: 'main',
      formats: ['cjs'],
    },
    rollupOptions: {
      output: {
        dir: 'dist',
        entryFileNames: 'main.js',
        inlineDynamicImports: true,
      },
      external: ['electron'],
    },
    outDir: 'dist',
    emptyOutDir: false,
    minify: false,
    target: 'esnext',
  },
})
