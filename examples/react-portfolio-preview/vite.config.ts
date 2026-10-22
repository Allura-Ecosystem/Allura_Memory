import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@studio': fileURLToPath(new URL('./studio-baseui', import.meta.url)),
      '@': fileURLToPath(new URL('./shared', import.meta.url)),
      'next/link': fileURLToPath(new URL('./link.tsx', import.meta.url)),
    },
  },
  esbuild: { jsx: 'automatic' },
  server: { host: '127.0.0.1', port: 4008, strictPort: true },
})
