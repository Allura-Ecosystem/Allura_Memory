import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
const repo = fileURLToPath(new URL('../../../', import.meta.url))
export default defineConfig({
 base: './',
 build: { outDir: '../html-preview' },
 root: fileURLToPath(new URL('.', import.meta.url)),
 publicDir: `${repo}public`,
 resolve: { alias: { '@studio': fileURLToPath(new URL('./studio-baseui', import.meta.url)), '@': `${repo}src`, 'next/link': fileURLToPath(new URL('./link.tsx', import.meta.url)) } },
 esbuild: { jsx: 'automatic' },
 server: { host: '127.0.0.1', port: 4010, strictPort: true, fs: { allow: [repo] } },
})
