import { describe, expect, it, vi } from 'vitest'
import { scopedExport, MAX_EXPORT_OFFSET, SEMANTIC_EXPORT_SQL, EPISODIC_EXPORT_SQL } from '../candidate/src/mcp/canonical-tools/scoped-export'
import { DatabaseUnavailableError, DatabaseQueryError } from '../candidate/src/lib/errors/database-errors'
import { createPrincipalContext, guardToolCall } from '../base/src/lib/auth/principal-context'
import { request, row, makeWrapper } from './helpers'

const run = (req: any, execute: any) => scopedExport(req, execute, 'ruvector')
const dbError = (code: string) => Object.assign(new Error(`fixture-${code}`), { code })

describe('scope and input validation (no DB calls)', () => {
  it.each([
    ['missing scope', { scope: undefined }],
    ['missing workspace', { scope: { group_id: 'allura-test', agent_id: 'fixture-agent' } }],
    ['blank workspace', { scope: { group_id: 'allura-test', agent_id: 'fixture-agent', workspace_id: '  ' } }],
    ['missing principal', { scope: { group_id: 'allura-test', workspace_id: 'ws-a' } }],
    ['different tenant', { scope: { group_id: 'allura-other', workspace_id: 'ws-a', agent_id: 'fixture-agent' } }],
    ['different user', { user_id: 'other-agent' }],
    ['empty user', { user_id: '' }],
    ['negative offset', { offset: -1 }],
    ['fractional offset', { offset: 0.5 }],
    ['huge offset', { offset: MAX_EXPORT_OFFSET + 1 }],
    ['NaN limit', { limit: NaN }],
    ['zero limit', { limit: 0 }],
    ['negative limit', { limit: -2 }],
    ['fractional limit', { limit: 1.5 }],
    ['unsafe limit', { limit: Number.MAX_SAFE_INTEGER + 1 }],
    ['string boolean', { canonical_only: 'false' }],
    ['bad format', { format: 'csv' }],
  ])('rejects %s', async (_label, patch) => {
    const execute = vi.fn()
    await expect(run(request(patch), execute)).rejects.toThrow()
    expect(execute).not.toHaveBeenCalled()
  })
  it('wrapper rejects before connection acquisition', async () => {
    const wrapped = makeWrapper({})
    await expect(wrapped.memory_export(request({ scope: undefined }))).rejects.toThrow('scope')
    expect(wrapped.getConnections).not.toHaveBeenCalled()
  })
  it('retains default and capped limit, with bounded SQL prefix', async () => {
    const execute = vi.fn(async () => ({ rows: [] }))
    await run(request(), execute)
    expect(execute.mock.calls[0][1]).toEqual(['allura-test', 'ws-a', 'fixture-agent', false, 1001])
    await run(request({ limit: 20000, offset: MAX_EXPORT_OFFSET }), execute)
    expect(execute.mock.calls[2][1][4]).toBe(110001)
  })
})

describe('existing authenticated transport boundary', () => {
  const principal = (patch: any = {}) => createPrincipalContext({ principalId: 'fixture-agent', workspaceId: 'ws-a',
    tenantIds: ['allura-test'], roles: ['viewer'], scopes: ['memory:read'], authMethod: 'mcp_token', sessionId: 'fixture-session', ...patch })
  it('strips spoofed workspace and principal scope and injects credential workspace', () => {
    const raw = request({ workspace_id: 'ws-b', scope: { group_id: 'allura-test', workspace_id: 'ws-b', agent_id: 'attacker' } })
    const guarded = guardToolCall(principal(), 'memory_export', raw)
    expect(guarded.args.scope).toEqual({ group_id: 'allura-test', workspace_id: 'ws-a', agent_id: 'fixture-agent' })
    expect(raw.workspace_id).toBe('ws-b')
  })
  it('denies cross-tenant export', () => expect(() => guardToolCall(principal(), 'memory_export', request({ group_id: 'allura-other' }))).toThrow())
  it('denies cross-principal user selector', () => expect(() => guardToolCall(principal(), 'memory_export', request({ user_id: 'attacker' }))).toThrow())
  it('denies missing memory:read scope', () => expect(() => guardToolCall(principal({ scopes: [] }), 'memory_export', request())).toThrow())
  it('denies absent verified principal', () => expect(() => guardToolCall(undefined as any, 'memory_export', request())).toThrow())
  it('missing credential workspace cannot use supplied workspace', async () => {
    const guarded = guardToolCall(principal({ workspaceId: undefined }), 'memory_export', request())
    await expect(run(guarded.args as any, vi.fn())).rejects.toThrow('scope')
  })
})

describe('real exporter behavior with explicit mock executors', () => {
  it('canonical-only executes the semantic SQL, never the episodic or retired API', async () => {
    const execute = vi.fn(async () => ({ rows: [row()] }))
    const result = await run(request({ canonical_only: true }), execute)
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledWith(SEMANTIC_EXPORT_SQL, ['allura-test', 'ws-a', 'fixture-agent', false, 1001])
    expect(result).toMatchObject({ count: 1, canonical_count: 1, episodic_count: 0, meta: { degraded: false, stores_used: ['graph'] } })
  })
  it('merges both stores before applying offset, semantic wins once', async () => {
    const execute = vi.fn(async (sql: string) => ({ rows: sql === SEMANTIC_EXPORT_SQL ? [row('c'), row('a')] : [row('b', 'episodic'), row('a', 'episodic')] }))
    const result = await run(request({ limit: 2, offset: 1 }), execute)
    expect(result.memories.map(r => r.id)).toEqual(['b', 'c'])
    expect(result.count).toBe(2)
    const full = await run(request(), execute)
    expect(full.memories[0].source).toBe('semantic')
    expect(full.canonical_count + full.episodic_count).toBe(full.count)
    expect(execute.mock.calls[1][0]).toBe(EPISODIC_EXPORT_SQL)
  })
  it.each(['42501', '28P01', '28000'])('fails closed on SQL authorization %s without fallback', async code => {
    const denied = dbError(code), execute = vi.fn(async () => { throw denied })
    await expect(run(request(), execute)).rejects.toBe(denied)
    expect(execute).toHaveBeenCalledTimes(1)
  })
  it.each([401, 403])('fails closed on wrapped HTTP authorization %s', async status => {
    const denied = new Error('adapter failed', { cause: Object.assign(new Error('denied'), { status }) })
    await expect(run(request(), async () => { throw denied })).rejects.toBe(denied)
  })
  it('denial from episodic discards already retrieved semantic results', async () => {
    const denied = dbError('42501')
    await expect(run(request(), async sql => { if (sql === EPISODIC_EXPORT_SQL) throw denied; return { rows: [row()] } })).rejects.toBe(denied)
  })
  it('injected connection failure degrades both-store export with explicit graph warning', async () => {
    const result = await run(request(), async sql => {
      if (sql === SEMANTIC_EXPORT_SQL) throw dbError('ECONNREFUSED')
      return { rows: [row('b', 'episodic')] }
    })
    expect(result).toMatchObject({ count: 1, meta: { degraded: true, incomplete: true, degraded_reason: 'graph_unavailable', stores_attempted: ['graph', 'postgres'], stores_used: ['postgres'], warnings: ['graph_unavailable'] } })
  })
  it('canonical-only never falls back on connection failure', async () => {
    const execute = vi.fn(async () => { throw dbError('ECONNREFUSED') })
    await expect(run(request({ canonical_only: true }), execute)).rejects.toBeInstanceOf(DatabaseUnavailableError)
    expect(execute).toHaveBeenCalledTimes(1)
  })
  it('episodic outage reports graph-only partial export explicitly', async () => {
    const result = await run(request(), async sql => { if (sql === EPISODIC_EXPORT_SQL) throw dbError('08006'); return { rows: [row()] } })
    expect(result.meta).toMatchObject({ degraded: true, stores_used: ['graph'], warnings: ['postgres_unavailable'] })
    expect(result.meta?.degraded_reason).toBeUndefined()
  })
  it('both unavailable throws, not an empty success', async () => {
    await expect(run(request(), async () => { throw dbError('ECONNRESET') })).rejects.toBeInstanceOf(DatabaseUnavailableError)
  })
  it.each(['42601', '42P01'])('query/schema error %s is not an outage', async code => {
    await expect(run(request(), async () => { throw dbError(code) })).rejects.toBeInstanceOf(DatabaseQueryError)
  })
  it('retired-operation error is not relabeled as backend unavailability', async () => {
    const error = new Error('retired tenant-only graph operation exportMemories')
    try { await run(request(), async () => { throw error }); throw new Error('expected rejection') }
    catch (caught) { expect(caught).toBeInstanceOf(DatabaseQueryError); expect(caught).not.toBeInstanceOf(DatabaseUnavailableError); expect((caught as Error).cause).toBe(error) }
  })
  it.each(['direct', 'wrapped', 'preclassified', 'cyclic'])('query cancellation %s fails without partial fallback', async kind => {
    const canceled = dbError('57014')
    let error: Error = canceled
    if (kind === 'wrapped') error = new Error('wrapper', { cause: canceled })
    if (kind === 'preclassified') error = new DatabaseUnavailableError('earlier-classification', canceled)
    if (kind === 'cyclic') { error = new Error('wrapper', { cause: canceled }); canceled.cause = error }
    const execute = vi.fn(async () => { throw error })
    await expect(run(request(), execute)).rejects.toBeInstanceOf(DatabaseQueryError)
    expect(execute).toHaveBeenCalledTimes(1)
  })
  it('canonical-only cancellation is a query error, not an outage', async () => {
    await expect(run(request({ canonical_only: true }), async () => { throw dbError('57014') })).rejects.toBeInstanceOf(DatabaseQueryError)
  })
  it('second-source cancellation discards the earlier semantic result', async () => {
    await expect(run(request(), async sql => { if (sql === EPISODIC_EXPORT_SQL) throw dbError('57014'); return { rows: [row()] } })).rejects.toBeInstanceOf(DatabaseQueryError)
  })
  it('invalid database rows do not become an empty or degraded success', async () => {
    await expect(run(request(), async () => ({ rows: [{ ...row(), created_at: 'invalid' }] }))).rejects.toThrow('invalid export record')
  })
  it('unsupported graph backend has explicit partial coverage, canonical-only errors', async () => {
    const execute = vi.fn(async () => ({ rows: [] }))
    expect((await scopedExport(request(), execute, 'neo4j')).meta?.warnings).toEqual(['unsupported_graph_backend'])
    await expect(scopedExport(request({ canonical_only: true }), execute, 'neo4j')).rejects.toThrow('unsupported graph backend')
  })
})
