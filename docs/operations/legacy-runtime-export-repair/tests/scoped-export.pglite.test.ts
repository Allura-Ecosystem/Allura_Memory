import { readFileSync } from 'node:fs'
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { scopedExport, SEMANTIC_EXPORT_SQL, EPISODIC_EXPORT_SQL } from '../candidate/src/mcp/canonical-tools/scoped-export'
import { tenantQuery } from '../base/src/lib/db/tenant-transaction'
import { createPrincipalContext, guardToolCall } from '../base/src/lib/auth/principal-context'
import { makeWrapper, request } from './helpers'

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
let db: PGlite
let calls: string[] = []
let releases = 0
let role = 'export_fixture_app'
const pool = {
  connect: async () => {
    await db.exec(`SET ROLE ${role}`)
    return { query: async (sql: string, values?: any[]) => { calls.push(sql); return db.query(sql, values) },
      release: () => { releases++ } }
  },
}
const execute = (sql: string, values: unknown[]) => tenantQuery({ tenantId: 'allura-test', workspaceId: 'ws-a', principalId: 'fixture-agent' }, sql, values, pool as any)
const run = (extra: any = {}) => scopedExport(request(extra), execute, 'ruvector')
const admin = async () => { await db.exec('RESET ROLE') }
async function graph(n: number, extra: Record<string, any> = {}) {
  const data = { id: id(n), group_id: 'allura-test', workspace_id: 'ws-a', user_id: 'fixture-agent', content: `semantic-${n}`, ...extra }
  await admin()
  await db.query(`INSERT INTO graph_memories (${Object.keys(data).join(',')}) VALUES (${Object.keys(data).map((_, i) => '$' + (i + 1)).join(',')})`, Object.values(data))
}
async function event(n: number, type = 'memory_add', extra: any = {}) {
  await admin()
  await db.query('INSERT INTO events(group_id,workspace_id,event_type,metadata,created_at) VALUES($1,$2,$3,$4,$5)',
    [extra.group_id ?? 'allura-test', extra.workspace_id ?? 'ws-a', type,
      JSON.stringify({ memory_id: id(n), user_id: extra.user_id ?? 'fixture-agent', content: extra.content ?? `episodic-${n}`, source: 'conversation', tags: ['fixture'], ...extra.metadata }),
      extra.created_at ?? '2026-01-01T00:00:00Z'])
}
async function edge(newer: number, older: number, extra: any = {}) {
  await admin()
  await db.query('INSERT INTO graph_supersedes(group_id,workspace_id,workspace_scope_state,newer_id,superseded_id) VALUES($1,$2,$3,$4,$5)',
    [extra.group_id ?? 'allura-test', extra.workspace_id ?? 'ws-a', extra.state ?? 'workspace_scoped', id(newer), id(older)])
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(readFileSync(new URL('./fixture-schema.sql', import.meta.url), 'utf8'))
})
afterAll(async () => { await db.close() })
beforeEach(async () => {
  await admin(); await db.exec('TRUNCATE graph_memories, graph_supersedes, events RESTART IDENTITY')
  calls = []; releases = 0; role = 'export_fixture_app'
})

describe('actual embedded PostgreSQL SQL + RLS + exact wrapper transaction (not live DB)', () => {
  it('wrapper exports actual semantic rows without the retired adapter', async () => {
    await graph(1); await event(2)
    const wrapper = makeWrapper(pool)
    const result = await wrapper.memory_export(request())
    expect(result.memories.map((m: any) => m.id)).toEqual([id(1), id(2)])
    expect(result).toMatchObject({ count: 2, canonical_count: 1, episodic_count: 1, meta: { degraded: false } })
    expect(wrapper.retired).not.toHaveBeenCalled()
    expect(calls.filter(sql => sql === SEMANTIC_EXPORT_SQL || sql === EPISODIC_EXPORT_SQL)).toHaveLength(2)
    expect(calls).toContain("SET LOCAL app.current_group_id = 'allura-test'")
    expect(calls).toContain("SET LOCAL app.current_principal = 'fixture-agent'")
    expect(calls).toContain("SET LOCAL app.current_workspace_id = 'ws-a'")
    expect(releases).toBe(2)
  })
  it('canonical-only runs real semantic path and never events SQL', async () => {
    await graph(1); await event(2)
    const result = await run({ canonical_only: true })
    expect(result.memories.map(m => m.id)).toEqual([id(1)])
    expect(calls).not.toContain(EPISODIC_EXPORT_SQL)
    expect(result.meta?.stores_attempted).toEqual(['graph'])
  })
  it('does not leak same-tenant other-workspace, other-tenant, or quarantined semantic data', async () => {
    await graph(1); await graph(2, { workspace_id: 'ws-b' }); await graph(3, { group_id: 'allura-other' })
    await graph(4, { workspace_scope_state: 'unresolved' }); await graph(5, { workspace_id: null, workspace_scope_state: 'tenant_only' })
    await event(6); await event(7, 'memory_add', { workspace_id: 'ws-b' }); await event(8, 'memory_add', { group_id: 'allura-other' })
    expect((await run()).memories.map(m => m.id)).toEqual([id(1), id(6)])
  })
  it('RLS independently blocks mismatched SQL workspace parameters', async () => {
    await graph(1); await graph(2, { workspace_id: 'ws-b' })
    const result = await execute(SEMANTIC_EXPORT_SQL, ['allura-test', 'ws-b', 'fixture-agent', false, 100])
    expect(result.rows).toEqual([])
  })
  it('RLS independently blocks mismatched SQL tenant parameters', async () => {
    await graph(1, { group_id: 'allura-other' })
    expect((await execute(SEMANTIC_EXPORT_SQL, ['allura-other', 'ws-a', 'fixture-agent', false, 100])).rows).toEqual([])
  })
  it('RLS without transaction-local authority returns no rows', async () => {
    await graph(1)
    await db.exec('SET ROLE export_fixture_app')
    expect((await db.query('SELECT * FROM graph_memories')).rows).toEqual([])
  })
  it('transport discards spoofed ws-b before exact wrapper and SQL execute', async () => {
    await graph(1); await graph(2, { workspace_id: 'ws-b' })
    const principal = createPrincipalContext({ principalId: 'fixture-agent', workspaceId: 'ws-a', tenantIds: ['allura-test'],
      roles: ['viewer'], scopes: ['memory:read'], authMethod: 'mcp_token', sessionId: 'isolated-fixture' })
    const guarded = guardToolCall(principal, 'memory_export', request({ scope: { group_id: 'allura-test', workspace_id: 'ws-b', agent_id: 'attacker' } }))
    expect((await makeWrapper(pool).memory_export(guarded.args)).memories.map((m: any) => m.id)).toEqual([id(1)])
  })
  it('optional user selector restricts semantic; episodic remains verified-principal only', async () => {
    await graph(1); await graph(2, { user_id: 'other-agent' }); await event(3); await event(4, 'memory_add', { user_id: 'other-agent' })
    expect((await run()).memories.map(m => m.id)).toEqual([id(1), id(2), id(3)])
    expect((await run({ user_id: 'fixture-agent' })).memories.map(m => m.id)).toEqual([id(1), id(3)])
  })
  it('current semantic only: excludes deleted, deprecated and explicitly superseded', async () => {
    await graph(1); await graph(2, { deleted_at: '2026-01-02' }); await graph(3, { deprecated: true }); await graph(4); await graph(5)
    await edge(5, 4)
    expect((await run({ canonical_only: true })).memories.map(m => m.id)).toEqual([id(1), id(5)])
  })
  it('other-workspace and quarantined supersession edges do not hide eligible rows', async () => {
    await graph(1); await graph(2); await graph(3)
    await edge(3, 1, { workspace_id: 'ws-b' }); await edge(3, 2, { state: 'unresolved' })
    expect((await run({ canonical_only: true })).memories.map(m => m.id)).toEqual([id(1), id(2), id(3)])
  })
  it('episodic lifecycle uses latest delete/restore, scoped by workspace and principal', async () => {
    await event(1); await event(1, 'memory_delete', { created_at: '2026-01-02' })
    await event(2); await event(2, 'memory_delete', { created_at: '2026-01-02' }); await event(2, 'memory_restore', { created_at: '2026-01-03' })
    await event(3); await event(3, 'memory_restore', { created_at: '2026-01-02' }); await event(3, 'memory_delete', { created_at: '2026-01-03' })
    await event(4); await event(4, 'memory_delete', { workspace_id: 'ws-b' }); await event(4, 'memory_delete', { user_id: 'other-agent' })
    expect((await run()).memories.map(m => m.id)).toEqual([id(2), id(4)])
  })
  it('duplicate adds pick earliest record and latest lifecycle ties use event ID', async () => {
    await event(1, 'memory_add', { content: 'first' }); await event(1, 'memory_add', { content: 'duplicate' })
    await event(2); await event(2, 'memory_delete', { created_at: '2026-01-02' }); await event(2, 'memory_restore', { created_at: '2026-01-02' })
    await event(3); await event(3, 'memory_restore', { created_at: '2026-01-02' }); await event(3, 'memory_delete', { created_at: '2026-01-02' })
    const result = await run()
    expect(result.memories.map(m => m.id)).toEqual([id(1), id(2)])
    expect(result.memories[0].content).toBe('first')
  })
  it('deduplicates before pagination with semantic precedence across every page', async () => {
    // Deliberately insert reverse order and equal timestamps. IDs overlap heavily.
    for (let n = 17; n >= 1; n--) {
      if (n % 3 !== 0) await graph(n)
      if (n % 2 !== 0 || n % 3 === 0) await event(n)
    }
    const full = await run()
    expect(full.count).toBe(17)
    for (const size of [1, 2, 3, 7]) {
      const pages: any[] = []
      for (let offset = 0; offset < 20; offset += size) {
        const page = await run({ offset, limit: size })
        expect(page.count).toBeLessThanOrEqual(size)
        expect(page.canonical_count + page.episodic_count).toBe(page.count)
        pages.push(...page.memories)
      }
      expect(pages).toEqual(full.memories)
    }
    for (const memory of full.memories) {
      const n = Number(memory.id.slice(-12))
      expect(memory.source).toBe(n % 3 !== 0 ? 'semantic' : 'episodic')
    }
  })
  it('real SQL 42501 is a denial, not graph outage or episodic fallback', async () => {
    await graph(1); await event(2); role = 'export_fixture_no_graph'
    await expect(run()).rejects.toMatchObject({ code: '42501' })
    expect(calls).not.toContain(EPISODIC_EXPORT_SQL)
    expect(calls).toContain('ROLLBACK')
    expect(releases).toBe(1)
  })
  it('real canonical-only SQL denial fails closed too', async () => {
    role = 'export_fixture_no_graph'
    await expect(run({ canonical_only: true })).rejects.toMatchObject({ code: '42501' })
    expect(calls).not.toContain(EPISODIC_EXPORT_SQL)
  })
  it('signals a bounded page without claiming a store outage', async () => {
    await graph(1); await graph(2); await graph(3)
    const first = await run({ limit: 2 })
    expect(first.meta).toMatchObject({ degraded: false, incomplete: true, warnings: [] })
    expect(first.meta?.coverage_limitations).toContain('export_page_limited')
    const last = await run({ offset: 2, limit: 2 })
    expect(last.count).toBe(1)
    expect(last.meta?.incomplete).toBe(false)
  })
  it('fixture executor really uses a non-superuser, non-bypass-RLS role', async () => {
    const result = await execute('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user', [])
    expect(result.rows).toEqual([{ rolsuper: false, rolbypassrls: false }])
  })
  it('actual missing-table SQL error is not reported as graph outage', async () => {
    await admin()
    await db.exec('ALTER TABLE graph_memories RENAME TO fixture_hidden_memories')
    try {
      await expect(run()).rejects.toMatchObject({ name: 'DatabaseQueryError', cause: { code: '42P01' } })
      expect(calls).not.toContain(EPISODIC_EXPORT_SQL)
    } finally {
      await admin()
      await db.exec('ALTER TABLE fixture_hidden_memories RENAME TO graph_memories')
    }
  })
  it('zero rows is a healthy empty export, distinct from a failed source', async () => {
    const result = await run()
    expect(result).toMatchObject({ memories: [], count: 0, canonical_count: 0, episodic_count: 0, meta: { degraded: false, incomplete: false, stores_used: ['graph', 'postgres'], warnings: [] } })
  })
})
