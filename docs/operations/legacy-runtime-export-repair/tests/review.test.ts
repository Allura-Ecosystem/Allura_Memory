import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { scopedExport, SEMANTIC_EXPORT_SQL } from '../candidate/src/mcp/canonical-tools/scoped-export'
import { DatabaseQueryError } from '../candidate/src/lib/errors/database-errors'
import { request, row } from './helpers'

// Review-only type-shape check, NOT the full archived migrations or deployed RLS.
// Migration 21 declares TEXT memory IDs, TEXT[] tags, REAL score and composite
// (id,group_id) key; migration 40 adds workspace identity/scope state. The original
// minimal fixture instead uses UUID IDs and JSONB tags. Test both actual shapes.
let db: PGlite
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE TABLE graph_memories (
      id TEXT NOT NULL, group_id TEXT NOT NULL, workspace_id TEXT,
      workspace_scope_state TEXT NOT NULL DEFAULT 'workspace_scoped',
      user_id TEXT, content TEXT NOT NULL, score REAL NOT NULL DEFAULT 0.5,
      provenance TEXT NOT NULL DEFAULT 'conversation', version INTEGER NOT NULL DEFAULT 1,
      tags TEXT[] DEFAULT '{}', deprecated BOOLEAN NOT NULL DEFAULT false,
      deleted_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (id,group_id)
    );
    CREATE TABLE graph_supersedes (
      newer_id TEXT NOT NULL, superseded_id TEXT NOT NULL, group_id TEXT NOT NULL,
      workspace_id TEXT, workspace_scope_state TEXT NOT NULL DEFAULT 'workspace_scoped',
      PRIMARY KEY (newer_id,superseded_id,group_id)
    );
  `)
  for (const id of ['Ω', 'é', 'z', 'a', 'A']) {
    await db.query(`INSERT INTO graph_memories(id,group_id,workspace_id,user_id,content,tags)
      VALUES($1,'allura-test','ws-a','fixture-agent',$2,ARRAY['first','second'])`, [id, `content-${id}`])
  }
})
afterAll(async () => { await db.close() })

describe('independent preservation review', () => {
  it('SQL C collation and merge preserve UTF-8 byte order with actual TEXT IDs', async () => {
    const execute = async (sql: string, values: unknown[]) => db.query(sql, values)
    const result = await scopedExport(request({ canonical_only: true }), execute, 'ruvector')
    expect(result.memories.map(memory => memory.id)).toEqual(['A', 'a', 'z', 'é', 'Ω'])
    expect(result.memories.every(memory => JSON.stringify(memory.tags) === '["first","second"]')).toBe(true)
  })
  it('actual TEXT[] tag fields survive SQL and bounded offset pagination', async () => {
    const result = await scopedExport(request({ canonical_only: true, offset: 2, limit: 2 }),
      async (sql, values) => db.query(sql, values), 'ruvector')
    expect(result.memories.map(memory => memory.id)).toEqual(['z', 'é'])
    expect(result.meta).toMatchObject({ degraded: false, incomplete: true })
  })
  it('regression: cancellation rejects instead of returning an apparent graph outage', async () => {
    const canceled = Object.assign(new Error('fixture cancellation'), { code: '57014' })
    const execute = vi.fn(async (sql: string) => {
      if (sql === SEMANTIC_EXPORT_SQL) throw canceled
      return { rows: [row('episodic-only', 'episodic')] }
    })
    await expect(scopedExport(request(), execute, 'ruvector')).rejects.toMatchObject({
      name: 'DatabaseQueryError', operation: 'memory_export:graph', cause: canceled,
    })
    expect(execute).toHaveBeenCalledTimes(1)
    // Cancellation must not mask a denial anywhere in the same cause chain.
    const denied = Object.assign(new Error('fixture denied'), { code: '42501' })
    for (const error of [
      Object.assign(new Error('fixture cancellation', { cause: denied }), { code: '57014' }),
      Object.assign(new Error('fixture denied', { cause: canceled }), { code: '42501' }),
    ]) {
      const reject = vi.fn(async () => { throw error })
      await expect(scopedExport(request(), reject, 'ruvector')).rejects.toBe(error)
      expect(reject).toHaveBeenCalledTimes(1)
    }
  })
  it('wrapped connection errors fail conservatively rather than hiding arbitrary query failures', async () => {
    const error = new Error('fixture wrapper', { cause: Object.assign(new Error('fixture refused'), { code: 'ECONNREFUSED' }) })
    await expect(scopedExport(request(), async () => { throw error }, 'ruvector')).rejects.toBeInstanceOf(DatabaseQueryError)
  })
})
