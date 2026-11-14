import { describe, expect, it, vi } from 'vitest'
import { RuVectorGraphAdapter } from '../base/src/lib/graph-adapter/ruvector-adapter'
import { GraphAdapterError } from '../base/src/lib/graph-adapter/types'
import { DatabaseUnavailableError } from '../candidate/src/lib/errors/database-errors'
import { extractFunctions, request } from './helpers'

describe('runtime baseline characterization (real copied retired adapter)', () => {
  it('actual runtime exportMemories retires before any database query', async () => {
    const pool = { query: vi.fn() }
    const adapter = new RuVectorGraphAdapter(pool as any)
    await expect(adapter.exportMemories({ group_id: 'allura-test' as any, user_id: null, limit: 10, offset: 0 })).rejects.toBeInstanceOf(GraphAdapterError)
    await expect(adapter.exportMemories({ group_id: 'allura-test' as any, user_id: null, limit: 10, offset: 0 })).rejects.toThrow('retired')
    expect(pool.query).not.toHaveBeenCalled()
  })
  it('unpatched canonical-only handler mislabels actual retired error as database outage', async () => {
    const pool = { query: vi.fn() }
    const adapter = new RuVectorGraphAdapter(pool as any)
    const source = extractFunctions('../base/src/mcp/canonical-tools.ts', ['memory_export'], {
      validateGroupId: (group: string) => group,
      getConnections: async () => ({ pg: pool, neo4j: null }), createGraphAdapter: () => adapter,
      DatabaseUnavailableError,
    })
    try {
      await source.memory_export(request({ canonical_only: true }))
      throw new Error('expected legacy handler failure')
    } catch (error) {
      expect(error).toBeInstanceOf(DatabaseUnavailableError)
      expect((error as Error).cause).toBeInstanceOf(GraphAdapterError)
      expect(((error as Error).cause as Error).message).toContain('retired')
    }
    expect(pool.query).not.toHaveBeenCalled()
  })
})
