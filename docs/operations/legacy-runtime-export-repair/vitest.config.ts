import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('.', import.meta.url))
export default defineConfig({
  root,
  resolve: { alias: {
    '@allura/mcp-server': root + 'base/packages/mcp-server/src/index.ts',
    '@allura/types': root + 'base/packages/types/src/index.ts',
    '@allura/rbac': root + 'base/packages/rbac/src/index.ts',
    '@/lib/auth/types': root + 'base/src/lib/auth/types.ts',
    '@/lib/db/tenant-transaction': root + 'base/src/lib/db/tenant-transaction.ts',
    '@/lib/postgres/connection': root + 'tests/stubs/no-network.ts',
  } },
  test: { include: ['tests/*.test.ts'], environment: 'node', setupFiles: [], fileParallelism: false,
    minWorkers: 1, maxWorkers: 1, pool: 'forks', testTimeout: 15000, hookTimeout: 30000 },
})
