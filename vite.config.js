import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  server: {
    port: 5180,
    open: true
  },
  build: {
    target: 'esnext',
    outDir: 'dist'
  }
})
