import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    // Rust rebuilds replace/lock executables under target on Windows. Vite 8
    // must not attach filesystem watchers there or the dev server can crash
    // with EBUSY while Tauri is relaunching the native process.
    watch: {
      ignored: ['**/src-tauri/target/**'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: 'baseline-widely-available',
    minify: !process.env.TAURI_DEBUG ? 'oxc' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
})
