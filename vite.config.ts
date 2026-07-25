import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: './',
  // inspectAttr 仅开发期注入 code-path，生产构建不携带
  plugins: [command === 'serve' ? inspectAttr() : null, react()].filter(Boolean),
  build: {
    target: 'esnext',
    assetsInlineLimit: 0,
  },
  optimizeDeps: {
    esbuildOptions: { target: 'esnext' },
  },
  worker: {
    format: 'es',
  },
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
