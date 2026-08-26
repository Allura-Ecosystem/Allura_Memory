import { memory_add, memory_search } from "@/mcp/canonical-tools"
import { closeConnections } from "@/mcp/canonical-tools/connection"
import type { MemoryAddRequest, MemorySearchRequest } from "@/lib/memory/canonical-contracts"
import { closeRuVectorPool } from "@/lib/ruvector/connection"
import { closePool, getPool } from "@/lib/postgres/connection"

const groups = {
  raleigh: "allura-factory-smoke-raleigh-loadtest",
  charlotte: "allura-factory-smoke-charlotte-loadtest",
} as const

function scopeFor(group_id: string, agent_id: string) {
  return { group_id, workspace_id: `ws-${group_id}`, agent_id }
}

async function seedWorkspace(group_id: string): Promise<void> {
  // Migration 39's restrictive RLS policy requires a real workspace row and a
  // matching app.current_workspace_id GUC for every app-role write.
  await getPool().query(
    `INSERT INTO workspaces (workspace_id, group_id, name)
     VALUES ($1, $2, 'factory-cross-team-smoke')
     ON CONFLICT (workspace_id, group_id) DO NOTHING`,
    [`ws-${group_id}`, group_id],
  )
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function writeAndFind(group_id: string, user_id: string, marker: string) {
  const added = await memory_add({
    group_id,
    user_id,
    content: `factory_ci_smoke ${marker}`,
    metadata: {
      source: "manual",
      agent_id: user_id,
      conversation_id: `factory-ci-${marker}`,
    },
    scope: scopeFor(group_id, user_id),
    threshold: 1,
  } as MemoryAddRequest)

  assert(added.stored === "episodic", `${group_id}: expected an episodic PostgreSQL write`)

  const own = await memory_search({
    group_id,
    user_id,
    query: marker,
    status: "all",
    limit: 10,
    scope: scopeFor(group_id, user_id),
  } as MemorySearchRequest)

  assert(
    own.results.some((result) => String(result.content).includes(marker)),
    `${group_id}: written marker was not retrievable`
  )
}

async function assertIsolated(group_id: string, foreignMarker: string) {
  const result = await memory_search({
    group_id,
    query: foreignMarker,
    status: "all",
    limit: 10,
    scope: scopeFor(group_id, `${group_id}-ci`),
  } as MemorySearchRequest)

  assert(
    result.results.every((item) => !String(item.content).includes(foreignMarker)),
    `${group_id}: cross-tenant marker leaked into search results`
  )
}

async function main() {
  const runId = `${Date.now()}-${crypto.randomUUID()}`
  const raleighMarker = `raleigh-${runId}`
  const charlotteMarker = `charlotte-${runId}`

  await seedWorkspace(groups.raleigh)
  await seedWorkspace(groups.charlotte)

  await writeAndFind(groups.raleigh, "factory-raleigh-ci", raleighMarker)
  await writeAndFind(groups.charlotte, "factory-charlotte-ci", charlotteMarker)
  await assertIsolated(groups.raleigh, charlotteMarker)
  await assertIsolated(groups.charlotte, raleighMarker)

  console.log(
    JSON.stringify({
      ok: true,
      run_id: runId,
      groups,
      assertions: [
        "PostgreSQL-first writes succeeded",
        "each tenant retrieved its own marker",
        "Raleigh could not retrieve Charlotte marker",
        "Charlotte could not retrieve Raleigh marker",
      ],
    })
  )
}

try {
  await main()
} finally {
  await closeConnections()
  await closeRuVectorPool()
  await closePool().catch(() => undefined)
}

// Imported budget/telemetry modules may own background timers. This is a
// one-shot CI process, so terminate explicitly after all resources are closed.
process.exit(0)
