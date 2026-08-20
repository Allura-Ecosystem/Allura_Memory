-- 30-agent-trajectories.sql
-- Story 1.3: SONA Trajectory Recording
--
-- Append-only table capturing agent execution trajectories for the SONA
-- (Self-Observing Neural Architecture) subsystem. Every memory_add,
-- memory_search, and curator operation records a row here so that we can
-- measure per-agent success rate, action counts, and latency.
--
-- TENANCY (AD-40): group_id is mandatory and stamped via the control plane
-- syscall_mutate path. The CHECK constraint enforces the ^allura- format
-- established by ADR-001.
--
-- MUTABILITY: append-only. There is no UPDATE or DELETE in the control plane target
-- resolver for this table — only INSERTs flow through. The table is
-- therefore a durable evidence store for SOC2 audit replay.

CREATE TABLE IF NOT EXISTS agent_trajectories (
    id           SERIAL PRIMARY KEY,
    group_id     TEXT NOT NULL
                   CHECK (group_id ~ '^allura-[a-z0-9]([a-z0-9-]*[a-z0-9])?$'),
    agent_id     TEXT NOT NULL,
    action       TEXT NOT NULL,
    task_type    TEXT NOT NULL DEFAULT 'unknown',
    input_hash   TEXT,
    output_hash  TEXT,
    success      BOOLEAN NOT NULL DEFAULT TRUE,
    duration_ms  INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary query pattern: per-agent chronological replay
CREATE INDEX IF NOT EXISTS idx_agent_trajectories_agent_created
    ON agent_trajectories (agent_id, created_at DESC);

-- Tenant-scoped listing (the /api/trajectories default query)
CREATE INDEX IF NOT EXISTS idx_agent_trajectories_group_created
    ON agent_trajectories (group_id, created_at DESC);

-- Stats aggregation: per-agent action counts / success rates
CREATE INDEX IF NOT EXISTS idx_agent_trajectories_group_agent
    ON agent_trajectories (group_id, agent_id);

-- ── Schema version tracking ───────────────────────────────────────────────────
INSERT INTO schema_versions (version, applied_at, description)
VALUES (
    '030',
    NOW(),
    'SONA trajectory recording: agent_trajectories append-only table (group_id-stamped, per-agent success/duration tracking for memory_add / memory_search / curator ops)'
) ON CONFLICT (version) DO NOTHING;