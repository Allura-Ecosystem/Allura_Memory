import { defineConfig } from 'vitest/config'
import { mergeConfig } from 'vite'
import viteConfig from './vite.config'

export default mergeConfig(viteConfig, defineConfig({
  test: {
    include: [
      'review-walkthrough.test.tsx',
      'studio-adapters/ecommerce/commerce-samples.test.ts',
      'connections-graph-model.test.ts',
      'connections-force-model.test.ts',
    ],
    environment: 'node',
    passWithNoTests: false,
  },
}))
