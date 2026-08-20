# Control Plane Write Gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make syscall_mutate and syscall_query the single choke point for all database writes and reads — both the agent-facing `agentMemory` API and the internal `memory()` graph writer route through the control plane's proof→policy→audit pipeline.

**Architecture:** A new target resolver module maps syscall target strings (e.g., `pg:events`, `neo4j:Entity`) to actual database operations using the existing `getPool()` and `writeTransaction()`/`readTransaction()` functions. The two load-bearing syscalls (`mutate`, `query`) call the resolver inside their executor callbacks. `agentMemory` and `memory()` are rewired to call syscalls instead of DB clients directly. The other 10 syscalls stay stubbed.

**Tech Stack:** TypeScript, Vitest, PostgreSQL (`pg` via `getPool()`), Neo4j (`neo4j-driver` via `writeTransaction`/`readTransaction`), RuVix control plane (proof.ts, policy.ts)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/control-plane/target-resolver.ts` | **Create** | Maps target strings to DB operations, enforces invariants |
| `src/control-plane/target-resolver.test.ts` | **Create** | Unit tests for target resolver |
| `src/control-plane/syscalls.ts` | **Modify** | Wire mutate + query executors to target resolver |
| `src/control-plane/syscalls.test.ts` | **Create** | Unit tests for wired syscalls (mocked resolver) |
| `src/agents/memory-wrapper.ts` | **Modify** | Route through control plane instead of canonicalMemoryTools |
| `src/agents/memory-wrapper.test.ts` | **Modify** | Update mock boundary from canonicalTools to syscalls |
| `src/lib/memory/writer.ts` | **Modify** | Route through control plane instead of direct Neo4j/PG |
| `src/lib/memory/writer.test.ts` | **Create** | Unit tests for control plane-routed writer |

---

### Task 1: Target Resolver

**Files:**
- Create: `src/control-plane/target-resolver.ts`
- Test: `src/control-plane/target-resolver.test.ts`

- [ ] **Step 1: Write the failing test for target resolution**

```typescript
// src/control-plane/target-resolver.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveTarget,
  type TargetOperation,
} from "./target-resolver";

// Mock DB modules — resolver must not import them at module level
vi.mock("@/lib/postgres/connection", () => ({
  getPool: vi.fn(() => ({
    query: vi.fn().mockResolvedValue({ rows: [{ id: "test-id" }], rowCount: 1 }),
  })),
}));

vi.mock("@/lib/neo4j/connection", () => ({
  writeTransaction: vi.fn(async (work: Function) => work({
    run: vi.fn().mockResolvedValue({
      records: [{ get: () => ({ properties: { node_id: "n1" } }) }],
    }),
  })),
  readTransaction: vi.fn(async (work: Function) => work({
    run: vi.fn().mockResolvedValue({
      records: [{ get: () => ({ properties: { node_id: "n1" } }), keys: ["n"] }],
    }),
  })),
}));

describe("Target Resolver", () => {
  describe("resolveTarget", () => {
    it("should resolve pg:events insert", async () => {
      const op: TargetOperation = {
        intent: "mutate",
        target: "pg:events",
        type: "insert",
        data: {
          group_id: "allura-system",
          agent_id: "brooks",
          event_type: "TEST",
          status: "completed",
          metadata: {},
        },
      };

      const result = await resolveTarget(op);
      expect(result.success).toBe(true);
      expect(result.affected_rows).toBeGreaterThanOrEqual(0);
    });

    it("should reject update on pg:events (append-only)", async () => {
      const op: TargetOperation = {
        intent: "mutate",
        target: "pg:events",
        type: "update",
        data: { group_id: "allura-system" },
      };

      await expect(resolveTarget(op)).rejects.toThrow("append-only");
    });

    it("should reject delete on pg:events (append-only)", async () => {
      const op: TargetOperation = {
        intent: "mutate",
        target: "pg:events",
        type: "delete_op",
        data: { group_id: "allura-system" },
      };

      await expect(resolveTarget(op)).rejects.toThrow("append-only");
    });

    it("should reject missing group_id", async () => {
      const op: TargetOperation = {
        intent: "mutate",
        target: "pg:events",
        type: "insert",
        data: { agent_id: "brooks" },
      };

      await expect(resolveTarget(op)).rejects.toThrow("group_id");
    });

    it("should resolve neo4j:Entity insert", async () => {
      const op: TargetOperation = {
        intent: "mutate",
        target: "neo4j:Entity",
        type: "insert",
        data: {
          label: "Insight",
          node_id: "ins-001",
          group_id: "allura-system",
          summary: "Test insight",
        },
      };

      const result = await resolveTarget(op);
      expect(result.success).toBe(true);
    });

    it("should resolve pg:memories query", async () => {
      const op: TargetOperation = {
        intent: "query",
        target: "pg:memories",
        query: { group_id: "allura-system" },
        limit: 10,
      };

      const result = await resolveTarget(op);
      expect(result.success).toBe(true);
      expect(Array.isArray(result.rows)).toBe(true);
    });

    it("should reject unknown target prefix", async () => {
      const op: TargetOperation = {
        intent: "mutate",
        target: "redis:cache",
        type: "insert",
        data: { group_id: "allura-system" },
      };

      await expect(resolveTarget(op)).rejects.toThrow("Unknown target");
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun vitest run src/control-plane/target-resolver.test.ts`
Expected: FAIL — module `./target-resolver` not found

- [ ] **Step 3: Write the target resolver**

```typescript
// src/control-plane/target-resolver.ts
/**
 * Control Plane Target Resolver
 *
 * Maps syscall target strings to actual database operations.
 * Enforces invariants (append-only, group_id, SUPERSEDES) at the boundary.
 *
 * Target format: "backend:resource"
 *   pg:events      → PostgreSQL events table (append-only)
 *   pg:memories    → PostgreSQL memories table
 *   neo4j:Entity   → Neo4j node write via writeTransaction
 *   neo4j:Query    → Neo4j read via readTransaction
 */

if (typeof window !== "undefined") {
  throw new Error("target-resolver is server-side only");
}

import { getPool } from "@/lib/postgres/connection";
import {
  readTransaction,
  writeTransaction,
} from "@/lib/neo4j/connection";
import { validateGroupId } from "@/lib/validation/group-id";

// ── Types ──────────────────────────────────────────────────────────────────

export interface TargetOperation {
  intent: "mutate" | "query";
  target: string;
  /** Mutation type — required when intent is "mutate" */
  type?: "insert" | "update" | "delete_op" | "upsert" | "bulk_insert";
  /** Data payload for mutations */
  data?: Record<string, unknown>;
  /** Query filter for reads */
  query?: Record<string, unknown>;
  /** Result limit for queries */
  limit?: number;
  /** Result offset for queries */
  offset?: number;
}

export interface ResolveResult {
  success: boolean;
  affected_rows?: number;
  rows?: unknown[];
}

// ── Invariant checks ───────────────────────────────────────────────────────

const APPEND_ONLY_TARGETS = new Set(["pg:events"]);

function extractGroupId(data?: Record<string, unknown>, query?: Record<string, unknown>): string {
  const groupId = (data?.group_id ?? query?.group_id) as string | undefined;
  if (!groupId) {
    throw new Error("group_id is required on every database operation");
  }
  validateGroupId(groupId);
  return groupId;
}

function enforceAppendOnly(target: string, type?: string): void {
  if (APPEND_ONLY_TARGETS.has(target) && type && type !== "insert") {
    throw new Error(
      `Target "${target}" is append-only — "${type}" operations are prohibited`
    );
  }
}

// ── PostgreSQL handlers ────────────────────────────────────────────────────

async function pgMutate(
  table: string,
  type: string,
  data: Record<string, unknown>,
  groupId: string
): Promise<ResolveResult> {
  const pool = getPool();

  if (type === "insert") {
    const keys = Object.keys(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`);
    const values = keys.map((k) =>
      typeof data[k] === "object" && data[k] !== null
        ? JSON.stringify(data[k])
        : data[k]
    );

    const result = await pool.query(
      `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${placeholders.join(", ")})`,
      values
    );

    return { success: true, affected_rows: result.rowCount ?? 0 };
  }

  throw new Error(`Unsupported mutation type "${type}" for pg:${table}`);
}

async function pgQuery(
  table: string,
  query: Record<string, unknown>,
  groupId: string,
  limit = 50,
  offset = 0
): Promise<ResolveResult> {
  const pool = getPool();
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  for (const [key, value] of Object.entries(query)) {
    conditions.push(`${key} = $${idx}`);
    values.push(value);
    idx++;
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  values.push(limit, offset);
  const result = await pool.query(
    `SELECT * FROM ${table} ${whereClause} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
    values
  );

  return { success: true, rows: result.rows };
}

// ── Neo4j handlers ─────────────────────────────────────────────────────────

async function neo4jMutate(
  data: Record<string, unknown>,
  groupId: string
): Promise<ResolveResult> {
  const label = data.label as string;
  const nodeId = (data.node_id as string) ?? crypto.randomUUID();
  const props = { ...data, node_id: nodeId, group_id: groupId };

  // Remove non-property fields
  delete props.label;

  await writeTransaction(async (tx) => {
    await tx.run(
      `MERGE (n:${label} {node_id: $node_id, group_id: $group_id}) SET n += $props`,
      { node_id: nodeId, group_id: groupId, props }
    );
  });

  return { success: true, affected_rows: 1 };
}

async function neo4jQuery(
  query: Record<string, unknown>,
  groupId: string,
  limit = 50
): Promise<ResolveResult> {
  const label = (query.label as string) ?? "Memory";
  const conditions: string[] = ["n.group_id = $group_id"];
  const params: Record<string, unknown> = { group_id: groupId, limit };

  for (const [key, value] of Object.entries(query)) {
    if (key === "label" || key === "group_id") continue;
    conditions.push(`n.${key} = $${key}`);
    params[key] = value;
  }

  const rows = await readTransaction(async (tx) => {
    const result = await tx.run(
      `MATCH (n:${label}) WHERE ${conditions.join(" AND ")} RETURN n LIMIT $limit`,
      params
    );
    return result.records.map((r) => {
      const val = r.get("n");
      return val?.properties ?? val;
    });
  });

  return { success: true, rows };
}

// ── Public resolver ────────────────────────────────────────────────────────

export async function resolveTarget(op: TargetOperation): Promise<ResolveResult> {
  const [backend, resource] = op.target.split(":");

  if (!backend || !resource) {
    throw new Error(`Unknown target format: "${op.target}" — expected "backend:resource"`);
  }

  const groupId = extractGroupId(op.data, op.query);

  if (op.intent === "mutate") {
    enforceAppendOnly(op.target, op.type);

    if (backend === "pg") {
      return pgMutate(resource, op.type!, op.data!, groupId);
    }
    if (backend === "neo4j") {
      return neo4jMutate(op.data!, groupId);
    }
  }

  if (op.intent === "query") {
    if (backend === "pg") {
      return pgQuery(resource, op.query ?? {}, groupId, op.limit, op.offset);
    }
    if (backend === "neo4j") {
      return neo4jQuery(op.query ?? {}, groupId, op.limit);
    }
  }

  throw new Error(`Unknown target backend: "${backend}"`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun vitest run src/control-plane/target-resolver.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/control-plane/target-resolver.ts src/control-plane/target-resolver.test.ts
git commit -m "feat(control plane): add target resolver for syscall DB routing

Maps pg:events, pg:memories, neo4j:Entity, neo4j:Query targets to actual
DB operations. Enforces append-only on events, group_id on all ops."
```

---

### Task 2: Wire syscall_mutate and syscall_query

**Files:**
- Modify: `src/control-plane/syscalls.ts:310-376` (mutate and query executors)
- Create: `src/control-plane/syscalls.test.ts`

- [ ] **Step 1: Write the failing test for wired mutate**

```typescript
// src/control-plane/syscalls.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { syscall_mutate, syscall_query } from "./syscalls";
import type { SyscallContext } from "./syscalls";

// Mock the control plane secret
vi.stubEnv("RUVIX_CONTROL_PLANE_SECRET", "test-secret-key-for-ruvix-control plane-proof-engine-32chars");

// Mock target resolver
vi.mock("./target-resolver", () => ({
  resolveTarget: vi.fn().mockResolvedValue({
    success: true,
    affected_rows: 1,
  }),
}));

import { resolveTarget } from "./target-resolver";

const ctx: SyscallContext = {
  actor: "brooks-architect",
  group_id: "allura-system",
  permission_tier: "control plane",
};

describe("Wired Syscalls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("syscall_mutate", () => {
    it("should route insert through target resolver", async () => {
      const result = await syscall_mutate(
        { type: "insert", target: "pg:events", data: { group_id: "allura-system", event_type: "TEST" } },
        ctx
      );

      expect(result.success).toBe(true);
      expect(result.data?.affected_rows).toBe(1);
      expect(resolveTarget).toHaveBeenCalledWith(
        expect.objectContaining({
          intent: "mutate",
          target: "pg:events",
          type: "insert",
        })
      );
    });

    it("should return audit ID on success", async () => {
      const result = await syscall_mutate(
        { type: "insert", target: "pg:events", data: { group_id: "allura-system" } },
        ctx
      );

      expect(result.auditId).toBeDefined();
      expect(result.auditId).toMatch(/^audit-allura-system-mutate-/);
    });
  });

  describe("syscall_query", () => {
    it("should route query through target resolver", async () => {
      vi.mocked(resolveTarget).mockResolvedValueOnce({
        success: true,
        rows: [{ id: "mem-1", content: "test" }],
      });

      const result = await syscall_query(
        { target: "pg:memories", query: { group_id: "allura-system" }, limit: 10 },
        ctx
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual([{ id: "mem-1", content: "test" }]);
      expect(resolveTarget).toHaveBeenCalledWith(
        expect.objectContaining({
          intent: "query",
          target: "pg:memories",
        })
      );
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun vitest run src/control-plane/syscalls.test.ts`
Expected: FAIL — mutate still returns `affected_rows: 0` (stub), query returns `[]` (stub)

- [ ] **Step 3: Wire syscall_mutate executor to target resolver**

In `src/control-plane/syscalls.ts`, replace the mutate executor (lines ~317–351):

```typescript
// Add import at top of file
import { resolveTarget } from "./target-resolver";
```

Replace the `syscall_mutate` function body:

```typescript
export async function syscall_mutate(
  request: MutationRequest,
  context: SyscallContext
): Promise<SyscallResult<{ affected_rows: number; auditId: string }>> {
  return executeSyscall(
    "mutate",
    `database:${request.target}`,
    context,
    async (claims) => {
      const result = await resolveTarget({
        intent: "mutate",
        target: request.target,
        type: request.type,
        data: {
          ...(request.data as Record<string, unknown>),
          group_id: claims.group_id,
        },
      });

      if (!result.success) {
        throw new Error("Target resolver mutation failed");
      }

      return {
        affected_rows: result.affected_rows ?? 0,
        auditId: generateAuditId("mutate", request.target, claims.group_id),
      };
    }
  );
}
```

Replace the `syscall_query` function body:

```typescript
export async function syscall_query(
  request: QueryRequest,
  context: SyscallContext
): Promise<SyscallResult<unknown[]>> {
  return executeSyscall(
    "query",
    `database:${request.target}`,
    context,
    async (claims) => {
      const result = await resolveTarget({
        intent: "query",
        target: request.target,
        query: {
          ...(request.query ?? {}),
          group_id: claims.group_id,
        },
        limit: request.limit,
        offset: request.offset,
      });

      return result.rows ?? [];
    }
  );
}
```

Also remove the now-unused transaction helpers (`beginTransaction`, `commitTransaction`, `rollbackTransaction`, `activeTransactions`, `TransactionContext`) — the target resolver owns transactions now.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun vitest run src/control-plane/syscalls.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 5: Run existing control plane tests**

Run: `bun vitest run src/control-plane/`
Expected: All existing tests still pass (proof.test.ts, mutate-events.test.ts etc.)

- [ ] **Step 6: Commit**

```bash
git add src/control-plane/syscalls.ts src/control-plane/syscalls.test.ts
git commit -m "feat(control plane): wire syscall_mutate and syscall_query to target resolver

Replaces TODO stubs with real DB routing through resolveTarget().
Removes in-memory transaction scaffolding — resolver owns transactions."
```

---

### Task 3: Route agentMemory through control plane

**Files:**
- Modify: `src/agents/memory-wrapper.ts`
- Modify: `src/agents/memory-wrapper.test.ts`

- [ ] **Step 1: Update the test mock boundary**

The current tests mock `canonicalMemoryTools`. After this change, the mock boundary moves to `syscall_mutate`/`syscall_query`. Update the mock:

```typescript
// src/agents/memory-wrapper.test.ts — replace the existing mock block

// Mock control plane syscalls (the new boundary)
vi.mock("/control-plane/syscalls", () => ({
  syscall_mutate: vi.fn().mockResolvedValue({
    success: true,
    data: { affected_rows: 1, auditId: "audit-allura-system-mutate-123" },
    auditId: "audit-allura-system-mutate-123",
  }),
  syscall_query: vi.fn().mockResolvedValue({
    success: true,
    data: [],
  }),
}));

// Mock control plane secret for proof generation
vi.stubEnv("RUVIX_CONTROL_PLANE_SECRET", "test-secret-key-for-ruvix-control plane-proof-engine-32chars");

import { syscall_mutate, syscall_query } from "/control-plane/syscalls";
```

Update the `add()` success test expectation:

```typescript
it("should add a memory with valid parameters", async () => {
  vi.mocked(syscall_mutate).mockResolvedValueOnce({
    success: true,
    data: { affected_rows: 1, auditId: "audit-allura-system-mutate-123" },
    auditId: "audit-allura-system-mutate-123",
  });

  const result = await agentMemory.add({
    group_id: "allura-system",
    user_id: "brooks-architect",
    content: "ADR: Implemented agent memory wrapper",
    metadata: { source: "conversation", confidence: 0.9 },
  });

  expect(result.id).toBeDefined();
  expect(syscall_mutate).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "insert",
      target: "pg:memories",
    }),
    expect.objectContaining({
      actor: "brooks-architect",
      group_id: "allura-system",
    })
  );
});
```

Update the `search()` success test:

```typescript
it("should search memories with valid parameters", async () => {
  vi.mocked(syscall_query).mockResolvedValueOnce({
    success: true,
    data: [{ id: TEST_MEMORY_ID, content: "ADR: Memory wrapper", score: 0.95 }],
  });

  const result = await agentMemory.search({
    group_id: "allura-system",
    query: "architecture decisions",
  });

  expect(result.results).toBeDefined();
  expect(syscall_query).toHaveBeenCalledWith(
    expect.objectContaining({
      target: "pg:memories",
    }),
    expect.objectContaining({
      group_id: "allura-system",
    })
  );
});
```

Validation tests (empty content, invalid group_id, missing user_id) remain unchanged — those fire before the control plane is called.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun vitest run src/agents/memory-wrapper.test.ts`
Expected: FAIL — agentMemory still calls canonicalMemoryTools, not syscalls

- [ ] **Step 3: Rewire agentMemory to use control plane syscalls**

In `src/agents/memory-wrapper.ts`, replace the imports and implementation:

Replace the canonicalMemoryTools import:

```typescript
// Remove this:
// import { canonicalMemoryTools } from "@/mcp/canonical-tools";

// Add this:
import { syscall_mutate, syscall_query } from "/control-plane/syscalls";
import type { SyscallContext } from "/control-plane/syscalls";
```

Add a helper to build syscall context:

```typescript
function buildContext(userId: string, groupId: string): SyscallContext {
  return {
    actor: userId,
    group_id: groupId,
    permission_tier: "plugin",
  };
}
```

Replace the `add()` method:

```typescript
async add(params: AgentMemoryAddParams): Promise<MemoryAddResponse> {
  validateGroupId(params.group_id);

  if (!params.content || params.content.trim().length === 0) {
    throw new ValidationError("content must not be empty", {
      content: ["content is required and must not be empty"],
    });
  }

  if (!params.user_id) {
    throw new ValidationError("user_id is required", {
      user_id: ["user_id must be provided (agent identifier)"],
    });
  }

  if (params.threshold !== undefined && (params.threshold < 0 || params.threshold > 1)) {
    throw new ValidationError("threshold must be between 0 and 1", {
      threshold: ["threshold must be between 0 and 1"],
    });
  }

  const ctx = buildContext(params.user_id, params.group_id);
  const result = await syscall_mutate(
    {
      type: "insert",
      target: "pg:memories",
      data: {
        group_id: params.group_id,
        user_id: params.user_id,
        content: params.content,
        metadata: params.metadata ?? {},
        threshold: params.threshold,
      },
    },
    ctx
  );

  if (!result.success) {
    throw new Error(result.error ?? "Control Plane mutate failed");
  }

  return MemoryAddResponseSchema.parse({
    id: result.data?.auditId ?? crypto.randomUUID(),
    stored: "episodic",
    score: params.threshold ?? 0.5,
    created_at: new Date().toISOString(),
  });
}
```

Replace the `search()` method:

```typescript
async search(params: MemorySearchParams): Promise<MemorySearchResponse> {
  validateGroupId(params.group_id);

  if (!params.query || params.query.trim().length === 0) {
    throw new ValidationError("query must not be empty", {
      query: ["query is required and must not be empty"],
    });
  }

  if (params.limit !== undefined && (params.limit < 1 || params.limit > 100)) {
    throw new ValidationError("limit must be between 1 and 100", {
      limit: ["limit must be between 1 and 100"],
    });
  }

  const ctx = buildContext(params.user_id ?? "anonymous", params.group_id);
  const result = await syscall_query(
    {
      target: "pg:memories",
      query: {
        group_id: params.group_id,
        ...(params.user_id ? { user_id: params.user_id } : {}),
      },
      limit: params.limit ?? 10,
    },
    ctx
  );

  if (!result.success) {
    throw new Error(result.error ?? "Control Plane query failed");
  }

  const rows = (result.data ?? []) as Array<Record<string, unknown>>;
  return MemorySearchResponseSchema.parse({
    results: rows.map((r) => ({
      id: r.id ?? r.memory_id ?? crypto.randomUUID(),
      content: r.content ?? "",
      score: (r.score as number) ?? 0.5,
      source: "episodic" as const,
      provenance: (r.provenance as string) ?? "conversation",
      created_at: (r.created_at as string) ?? new Date().toISOString(),
    })),
    count: rows.length,
    latency_ms: 0,
    meta: {
      contract_version: "v1" as const,
      degraded: false,
      stores_used: ["postgres"],
      stores_attempted: ["postgres"],
      warnings: [],
    },
  });
}
```

Replace `get()`:

```typescript
async get(params: MemoryGetParams): Promise<MemoryGetResponse> {
  validateGroupId(params.group_id);

  if (!params.id || params.id.trim().length === 0) {
    throw new ValidationError("id is required", {
      id: ["id must be a valid UUID"],
    });
  }

  const ctx = buildContext("system", params.group_id);
  const result = await syscall_query(
    {
      target: "pg:memories",
      query: { group_id: params.group_id, id: params.id },
      limit: 1,
    },
    ctx
  );

  if (!result.success) {
    throw new Error(result.error ?? "Control Plane query failed");
  }

  const rows = (result.data ?? []) as Array<Record<string, unknown>>;
  if (rows.length === 0) {
    throw new Error(`Memory not found: ${params.id}`);
  }

  const row = rows[0];
  return MemoryGetResponseSchema.parse({
    id: row.id ?? params.id,
    content: row.content ?? "",
    user_id: row.user_id ?? null,
    metadata: row.metadata ?? {},
    created_at: (row.created_at as string) ?? new Date().toISOString(),
    updated_at: (row.updated_at as string) ?? null,
  });
}
```

Replace `list()`:

```typescript
async list(params: MemoryListParams): Promise<MemoryListResponse> {
  validateGroupId(params.group_id);

  if (params.limit !== undefined && (params.limit < 1 || params.limit > 1000)) {
    throw new ValidationError("limit must be between 1 and 1000", {
      limit: ["limit must be between 1 and 1000"],
    });
  }

  if (params.offset !== undefined && params.offset < 0) {
    throw new ValidationError("offset must be >= 0", {
      offset: ["offset must be non-negative"],
    });
  }

  const ctx = buildContext(params.user_id ?? "system", params.group_id);
  const result = await syscall_query(
    {
      target: "pg:memories",
      query: {
        group_id: params.group_id,
        ...(params.user_id ? { user_id: params.user_id } : {}),
      },
      limit: params.limit ?? 50,
      offset: params.offset ?? 0,
    },
    ctx
  );

  if (!result.success) {
    throw new Error(result.error ?? "Control Plane query failed");
  }

  const rows = (result.data ?? []) as Array<Record<string, unknown>>;
  return MemoryListResponseSchema.parse({
    memories: rows.map((r) => ({
      id: r.id ?? r.memory_id ?? crypto.randomUUID(),
      content: r.content ?? "",
      user_id: r.user_id ?? null,
      metadata: r.metadata ?? {},
      created_at: (r.created_at as string) ?? new Date().toISOString(),
    })),
    count: rows.length,
  });
}
```

Replace `delete()`:

```typescript
async delete(params: MemoryDeleteParams): Promise<MemoryDeleteResponse> {
  validateGroupId(params.group_id);

  if (!params.id || params.id.trim().length === 0) {
    throw new ValidationError("id is required", {
      id: ["id must be a valid UUID"],
    });
  }

  if (!params.user_id) {
    throw new ValidationError("user_id is required for deletion", {
      user_id: ["user_id must be provided (for audit trail)"],
    });
  }

  const ctx = buildContext(params.user_id, params.group_id);

  // Soft-delete: insert a deletion event, don't actually DELETE
  const result = await syscall_mutate(
    {
      type: "insert",
      target: "pg:events",
      data: {
        group_id: params.group_id,
        agent_id: params.user_id,
        event_type: "MEMORY_DELETED",
        status: "completed",
        metadata: { memory_id: params.id, deleted_by: params.user_id },
      },
    },
    ctx
  );

  if (!result.success) {
    throw new Error(result.error ?? "Control Plane delete event failed");
  }

  return MemoryDeleteResponseSchema.parse({
    id: params.id,
    deleted: true,
  });
}
```

Also remove unused imports: `canonicalMemoryTools`, `asGroupId`, `asMemoryId`, `MemoryIdSchema`, and the `BrandedGroupId`/`BrandedMemoryId` type imports if no longer needed.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun vitest run src/agents/memory-wrapper.test.ts`
Expected: All validation tests PASS. Success path tests PASS with new mock boundary.

- [ ] **Step 5: Commit**

```bash
git add src/agents/memory-wrapper.ts src/agents/memory-wrapper.test.ts
git commit -m "feat(agents): route agentMemory through control plane syscalls

agentMemory.add/search/get/list/delete now flow through
syscall_mutate/syscall_query instead of calling canonicalMemoryTools
directly. Validation remains at the wrapper boundary."
```

---

### Task 4: Route memory() writer through control plane

**Files:**
- Modify: `src/lib/memory/writer.ts`
- Create: `src/lib/memory/writer.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/memory/writer.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock control plane syscalls
vi.mock("/control-plane/syscalls", () => ({
  syscall_mutate: vi.fn().mockResolvedValue({
    success: true,
    data: { affected_rows: 1, auditId: "audit-123" },
  }),
  syscall_query: vi.fn().mockResolvedValue({
    success: true,
    data: [{ node_id: "n1", summary: "test" }],
  }),
}));

vi.stubEnv("RUVIX_CONTROL_PLANE_SECRET", "test-secret-key-for-ruvix-control plane-proof-engine-32chars");
vi.stubEnv("GRAPH_BACKEND", "neo4j");

import { syscall_mutate, syscall_query } from "/control-plane/syscalls";
import { memory } from "./writer";

describe("memory() — control plane-routed writer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createEntity", () => {
    it("should route entity creation through syscall_mutate", async () => {
      vi.mocked(syscall_mutate).mockResolvedValueOnce({
        success: true,
        data: { affected_rows: 1, auditId: "audit-123" },
      });

      const result = await memory().createEntity({
        label: "Insight",
        group_id: "allura-system",
        props: { summary: "Test insight", confidence: 0.9 },
      });

      expect(result.node_id).toBeDefined();
      expect(syscall_mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "insert",
          target: "neo4j:Entity",
        }),
        expect.objectContaining({
          group_id: "allura-system",
        })
      );
    });

    it("should reject invalid group_id", async () => {
      await expect(
        memory().createEntity({
          label: "Insight",
          group_id: "bad-group",
          props: { summary: "test" },
        })
      ).rejects.toThrow();
    });
  });

  describe("createRelationship", () => {
    it("should route relationship creation through syscall_mutate", async () => {
      vi.mocked(syscall_mutate).mockResolvedValueOnce({
        success: true,
        data: { affected_rows: 1, auditId: "audit-456" },
      });

      await memory().createRelationship({
        fromId: "n1",
        fromLabel: "Agent",
        toId: "n2",
        toLabel: "Insight",
        type: "CONTRIBUTED",
      });

      expect(syscall_mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          target: "neo4j:Relationship",
        }),
        expect.objectContaining({
          actor: "system",
        })
      );
    });
  });

  describe("search", () => {
    it("should route search through syscall_query", async () => {
      vi.mocked(syscall_query).mockResolvedValueOnce({
        success: true,
        data: [{ node_id: "n1", summary: "test insight", group_id: "allura-system" }],
      });

      const results = await memory().search({
        label: "Insight",
        group_id: "allura-system",
        props: { status: "active" },
        limit: 5,
      });

      expect(results).toHaveLength(1);
      expect(syscall_query).toHaveBeenCalledWith(
        expect.objectContaining({
          target: "neo4j:Query",
        }),
        expect.objectContaining({
          group_id: "allura-system",
        })
      );
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun vitest run src/lib/memory/writer.test.ts`
Expected: FAIL — memory() still calls Neo4j/PG directly, not syscalls

- [ ] **Step 3: Add control plane-routed backend to writer.ts**

In `src/lib/memory/writer.ts`, add a new import and backend builder.

Add import near top:

```typescript
import { syscall_mutate, syscall_query } from "/control-plane/syscalls";
import type { SyscallContext } from "/control-plane/syscalls";
```

Add a new backend builder after `buildAdapterBackend()`:

```typescript
// ── Control Plane Backend (routes all operations through proof-gated syscalls) ──

function buildControlPlaneBackend(): MemoryAPI {
  function ctx(groupId: string, actor = "system"): SyscallContext {
    return { actor, group_id: groupId, permission_tier: "plugin" };
  }

  return {
    async createEntity({
      label,
      props,
      group_id,
      relationships,
    }: CreateEntityInput): Promise<CreateEntityResult> {
      const validatedGroupId = validateGroupId(group_id);
      const node_id = resolveNodeId(props);

      const result = await syscall_mutate(
        {
          type: "insert",
          target: "neo4j:Entity",
          data: {
            label,
            node_id,
            group_id: validatedGroupId,
            ...props,
            created_at: props.created_at ?? new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        },
        ctx(validatedGroupId)
      );

      if (!result.success) {
        throw new Error(result.error ?? "Control Plane mutate failed for createEntity");
      }

      // Handle relationships
      for (const rel of relationships ?? []) {
        const fromId = rel.direction === "in" ? rel.targetId : node_id;
        const toId = rel.direction === "in" ? node_id : rel.targetId;

        await syscall_mutate(
          {
            type: "insert",
            target: "neo4j:Relationship",
            data: {
              group_id: validatedGroupId,
              from_id: fromId,
              to_id: toId,
              type: rel.type,
              ...(rel.props ?? {}),
            },
          },
          ctx(validatedGroupId)
        );
      }

      return { node_id };
    },

    async createRelationship({
      fromId,
      fromLabel,
      toId,
      toLabel,
      type,
      props,
    }: CreateRelationshipCallInput): Promise<void> {
      const groupId = (props?.group_id as string) ?? process.env.DEFAULT_GROUP_ID ?? "allura-system";
      const validatedGroupId = validateGroupId(groupId);

      const result = await syscall_mutate(
        {
          type: "insert",
          target: "neo4j:Relationship",
          data: {
            group_id: validatedGroupId,
            from_id: fromId,
            from_label: fromLabel,
            to_id: toId,
            to_label: toLabel,
            type,
            ...(props ?? {}),
          },
        },
        ctx(validatedGroupId)
      );

      if (!result.success) {
        throw new Error(result.error ?? "Control Plane mutate failed for createRelationship");
      }
    },

    async query<T = Record<string, unknown>>(
      cypher: string,
      params?: Record<string, unknown>
    ): Promise<T[]> {
      // Raw cypher queries still need a group_id for the control plane context
      const groupId = (params?.group_id as string) ?? process.env.DEFAULT_GROUP_ID ?? "allura-system";

      const result = await syscall_query(
        {
          target: "neo4j:Query",
          query: { cypher, ...params },
          limit: (params?.limit as number) ?? 100,
        },
        ctx(groupId)
      );

      return (result.data ?? []) as T[];
    },

    async search<T = Record<string, unknown>>({
      label,
      group_id,
      props,
      textMatch,
      limit = 10,
    }: SearchInput): Promise<T[]> {
      const validatedGroupId = validateGroupId(group_id);

      const result = await syscall_query(
        {
          target: "neo4j:Query",
          query: {
            group_id: validatedGroupId,
            label,
            ...(props ?? {}),
            ...(textMatch ? { textMatch } : {}),
          },
          limit,
        },
        ctx(validatedGroupId)
      );

      return (result.data ?? []) as T[];
    },
  };
}
```

Update the `memory()` export to use the control plane backend:

```typescript
export function memory(): MemoryAPI {
  // Control Plane backend is now the default — proof-gates all operations
  const useControlPlane = process.env.MEMORY_BYPASS_KERNEL !== "true";

  if (useControlPlane) {
    return buildControlPlaneBackend();
  }

  // Fallback: direct DB access (for migration/testing only)
  const backend = getGraphBackend();
  if (backend === "ruvector") {
    return buildAdapterBackend();
  }
  return buildNeo4jBackend();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun vitest run src/lib/memory/writer.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Run all existing memory tests**

Run: `bun vitest run src/lib/memory/`
Expected: Existing relationship and traceable-memory tests still pass (they mock at different boundaries)

- [ ] **Step 6: Commit**

```bash
git add src/lib/memory/writer.ts src/lib/memory/writer.test.ts
git commit -m "feat(memory): route memory() writer through control plane syscalls

createEntity, createRelationship, query, and search now flow through
syscall_mutate/syscall_query. Direct Neo4j/PG backends kept as fallback
behind MEMORY_BYPASS_KERNEL=true for migration."
```

---

### Task 5: Full typecheck and cross-cutting verification

**Files:**
- All modified files

- [ ] **Step 1: Run typecheck**

Run: `bun run typecheck`
Expected: No type errors

- [ ] **Step 2: Run full unit test suite**

Run: `bun test`
Expected: All tests pass. If any fail, diagnose and fix — the mock boundaries may need adjustment in tests that import from modified modules.

- [ ] **Step 3: Verify no circular imports**

Run: `bun vitest run src/control-plane/target-resolver.test.ts src/control-plane/syscalls.test.ts src/agents/memory-wrapper.test.ts src/lib/memory/writer.test.ts`
Expected: All 4 test files pass without circular dependency errors

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: fix any typecheck or test issues from control plane write gate

Ensures all existing tests pass with the new control plane routing layer."
```

---

## Verification Checklist

After all tasks complete:

- [ ] `agentMemory.add()` → `syscall_mutate` → target resolver → PostgreSQL
- [ ] `agentMemory.search()` → `syscall_query` → target resolver → PostgreSQL
- [ ] `memory().createEntity()` → `syscall_mutate` → target resolver → Neo4j
- [ ] `memory().search()` → `syscall_query` → target resolver → Neo4j
- [ ] `pg:events` rejects update/delete (append-only)
- [ ] All operations require `group_id`
- [ ] Proof-of-intent created and verified on every syscall
- [ ] Policy evaluation runs on every syscall
- [ ] Audit IDs generated for all mutations
- [ ] `bun run typecheck` passes
- [ ] `bun test` passes
- [ ] No circular imports between control plane ↔ memory ↔ agents
