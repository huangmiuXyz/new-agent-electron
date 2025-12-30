import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    build: {
        lib: {
            entry: resolve(__dirname, 'src/index.ts'),
            name: 'plugin',
            fileName: 'index',
            formats: ['es']
        },
        rollupOptions: {
            output: {
                dir: 'dist',
                entryFileNames: 'index.js',
                chunkFileNames: '[name].js',
                assetFileNames: '[name][extname]',
                inlineDynamicImports: true
            },
            external: []
        },
        outDir: 'dist',
        emptyOutDir: true,
        minify: false
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src')
        }
    }
});
