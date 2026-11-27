import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
// @ts-expect-error type error without @types/node package
import process from "node:process";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [solid(), tailwindcss()],

  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/monaco-editor")) {
            return "monaco-vendor";
          }
          if (id.includes("node_modules/lucide-solid")) {
            return "icons-vendor";
          }
        },
      },
    },
    chunkSizeWarningLimit: 2000,
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
