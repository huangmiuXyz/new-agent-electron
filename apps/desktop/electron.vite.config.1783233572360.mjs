// electron.vite.config.ts
import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
var origWarn = console.warn;
console.warn = (...args) => {
  if (args.some((a) => typeof a === "string" && a.includes("outside its package"))) return;
  origWarn.apply(console, args);
};
var electron_vite_config_default = defineConfig(() => {
  const sourcemap = false;
  return {
    main: {
      plugins: [externalizeDepsPlugin()],
      build: {
        lib: {
          entry: resolve("src/main/index.ts")
        },
        sourcemap
      }
    },
    preload: {
      plugins: [externalizeDepsPlugin()],
      build: {
        lib: {
          entry: resolve("src/preload/index.ts")
        },
        sourcemap
      }
    },
    renderer: {
      resolve: {
        alias: {
          "@renderer": resolve("src/renderer/src")
        }
      },
      optimizeDeps: {
        exclude: ["monaco-editor", "drizzle-kit", "typescript"],
        include: [
          "vue",
          "vue-router",
          "pinia",
          "@vueuse/core",
          "ai",
          "@ai-sdk/vue",
          "@ai-sdk/openai",
          "@ai-sdk/anthropic",
          "@ai-sdk/google",
          "nanoid",
          "dayjs",
          "es-toolkit",
          "zod",
          "localforage",
          "pinia-plugin-persistedstate-async",
          "@modelcontextprotocol/sdk",
          "@ai-sdk/mcp"
        ],
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
              resolve("src/renderer/src/types/components.d.ts")
            ]
          }
        }),
        vueJsx(),
        AutoImport({
          imports: ["vue", "vue-router", "pinia"],
          dts: "src/auto-imports.d.ts",
          vueTemplate: true,
          dirs: [
            "src/composables",
            "src/composables/**",
            "src/utils",
            "src/utils/**",
            "src/stores",
            "src/stores/**",
            "src/services",
            "src/services/**"
          ]
        }),
        Components({
          dirs: ["src/components", "src/pages"],
          directoryAsNamespace: true,
          dts: "src/components.d.ts"
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
        port: 3e3,
        watch: process.env.NO_RELOAD ? { ignored: ["**/*"] } : void 0,
        fs: {
          // 允许访问 pnpm 符号链接真实路径下的资源（如 material-icon-theme 的 SVG）
          allow: [
            resolve("src/renderer/src"),
            resolve("node_modules"),
            resolve("../..")
          ]
        }
      }
    }
  };
});
export {
  electron_vite_config_default as default
};
