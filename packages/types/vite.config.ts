import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'AgentQiTypes',
      fileName: 'index',
      formats: ['es', 'cjs']
    },
    rollupOptions: {
      external: ['ai', 'openai']
    }
  },
  plugins: [
    dts({
      include: ['src/**/*.ts', 'src/**/*.d.ts'],
      outDir: 'dist',
      insertTypesEntry: true,
      copyDtsFiles: true
    })
  ]
})
