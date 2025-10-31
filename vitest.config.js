import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setupTests.js'
    ,include: ['src/**/*.test.{js,jsx,ts,tsx}']
  }
})
