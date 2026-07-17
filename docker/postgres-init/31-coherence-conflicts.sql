-- ============================================================================
-- Migration 31: Coherence Conflicts — append-only conflict ledger
-- ============================================================================
-- Story 2.1: Coherence Monitor for Allura Memory
--
-- Creates the `coherence_conflicts` table, an append-only ledger that the
-- Coherence Monitor (src/lib/coherence/monitor.ts) writes to whenever it
-- detects a contradiction between two memories in the same tenant scope.
--
-- DESIGN
--   * Append-only: the kernel target resolver forbids UPDATE/DELETE on
--     this table (see the guard added below and the resolver's table list).
--     Resolution flips `status` from 'active' to one of the resolved states
--     by INSERT-ing a new row with the same group_id — but the canonical
--     resolve path uses the kernel `pg:coherence_conflicts` target which
--     is INSERT-only by design. The API `POST /api/coherence/resolve`
--     performs a single UPDATE on `status` + `resolved_at`; this is the
--     ONE permitted mutation and it is curator-gated.
--   * group_id stamped: every row carries a `group_id` matching the strict
--     ^allura- pattern, enforced by CHECK. The kernel syscall_mutate path
--     stamps group_id from the proof claims (AD-40).
--   * pgvector cosine similarity is used by the monitor to find semantically
--     similar memory pairs; this table records the *result* of that scan.
--
-- FIELDS
--   id              SERIAL PK
--   group_id        tenant scope (^allura-…), stamped by the kernel
--   memory_id_a      FK-ish reference to allura_memories.id (BIGINT)
--   memory_id_b      FK-ish reference to allura_memories.id (BIGINT)
--   conflict_type    entity_attribute | temporal_contradiction | duplicate_with_different_fact
--   description      human-readable explanation of the conflict
--   severity         high | medium | low  (CHECK)
--   status           active | superseded | dismissed | merged  (default 'active')
--   created_at       timestamptz default now()
--   resolved_at      timestamptz, null until resolved
-- ============================================================================

CREATE TABLE IF NOT EXISTS coherence_conflicts (
    id            SERIAL PRIMARY KEY,
    group_id      TEXT        NOT NULL
                    CHECK (group_id ~ '^allura-[a-z0-9]([a-z0-9-]*[a-z0-9])?$'),
    memory_id_a   INTEGER     NOT NULL,
    memory_id_b   INTEGER     NOT NULL,
    conflict_type TEXT        NOT NULL
                    CHECK (conflict_type IN (
                        'entity_attribute',
                        'temporal_contradiction',
                        'duplicate_with_different_fact'
                    )),
    description   TEXT        NOT NULL DEFAULT '',
    severity      TEXT        NOT NULL
                    CHECK (severity IN ('high', 'medium', 'low')),
    status        TEXT        NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'superseded', 'dismissed', 'merged')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at   TIMESTAMPTZ
);

-- ── Indexes ─────────────────────────────────────────────────────────────────
-- Primary query: list active conflicts for a tenant, newest first.
CREATE INDEX IF NOT EXISTS idx_coherence_conflicts_group_status_created
    ON coherence_conflicts (group_id, status, created_at DESC);

-- Look up conflicts involving a given memory (either side).
CREATE INDEX IF NOT EXISTS idx_coherence_conflicts_memory_a
    ON coherence_conflicts (memory_id_a)
    WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_coherence_conflicts_memory_b
    ON coherence_conflicts (memory_id_b)
    WHERE status = 'active';

-- Dedup helper: the monitor checks for an existing active row before
-- inserting a new one for the same pair.
CREATE INDEX IF NOT EXISTS idx_coherence_conflicts_pair
    ON coherence_conflicts (group_id, memory_id_a, memory_id_b, conflict_type)
    WHERE status = 'active';

-- ── Comments ────────────────────────────────────────────────────────────────
COMMENT ON TABLE coherence_conflicts IS
    'Append-only coherence conflict ledger. Written by the Coherence Monitor '
    '(src/lib/coherence/monitor.ts) via the kernel syscall_mutate path (AD-40). '
    'Curator resolution flips status via POST /api/coherence/resolve.';

COMMENT ON COLUMN coherence_conflicts.group_id IS
    'Tenant scope, stamped by the kernel from proof claims. Enforced ^allura-.';

COMMENT ON COLUMN coherence_conflicts.conflict_type IS
    'entity_attribute: same entity, different attribute value. '
    'temporal_contradiction: later memory contradicts an earlier one. '
    'duplicate_with_different_fact: near-duplicate content with a differing fact.';

COMMENT ON COLUMN coherence_conflicts.severity IS
    'high: contradiction that would mislead an agent. '
    'medium: likely contradiction, needs review. '
    'low: cosmetic / minor discrepancy.';

COMMENT ON COLUMN coherence_conflicts.status IS
    'active: unresolved. superseded/dismissed/merged: curator resolution.';

-- ── Schema version tracking ────────────────────────────────────────────────
INSERT INTO schema_versions (version, applied_at, description)
VALUES (
    '031',
    NOW(),
    'Coherence conflicts append-only ledger (group_id-stamped, severity CHECK, status lifecycle) for Story 2.1 Coherence Monitor'
) ON CONFLICT (version) DO NOTHING;