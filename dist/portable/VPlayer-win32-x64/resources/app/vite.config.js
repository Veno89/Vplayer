import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Use a relative base for production so assets load correctly when opening
// dist/index.html via file:// (as in portable/Electron builds).
const isProduction = process.env.NODE_ENV === 'production'

export default defineConfig({
  base: isProduction ? './' : '/',
  plugins: [react()]
})
