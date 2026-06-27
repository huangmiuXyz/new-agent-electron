import { defineConfig } from 'vite'
import { builtinModules } from 'module'
import { resolve } from 'path'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/main.ts'),
      name: 'mainPlugin',
      fileName: 'main',
      formats: ['cjs']
    },
    rollupOptions: {
      output: {
        dir: 'dist',
        entryFileNames: 'main.js',
        inlineDynamicImports: true
      },
      external: [
        'electron',
        ...builtinModules.map((m) => `node:${m}`),
        ...builtinModules,
      ]
    },
    outDir: 'dist',
    emptyOutDir: false,
    minify: false,
    target: 'esnext'
  }
})
