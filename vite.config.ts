import path from "path"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Tauri production build needs relative asset paths; dev server can keep default
// We set base to './' for production builds (when not running Vite dev server)
const isTauriBuild = process.env.TAURI_BUILD === 'true' || process.env.NODE_ENV === 'production'

export default defineConfig({
  base: isTauriBuild ? './' : '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Do NOT externalize @tauri-apps/api modules; they must be bundled so the
    // production app can resolve them when loaded from filesystem / custom protocol.
    rollupOptions: {
      // external: [] // keep default
    }
  }
})
