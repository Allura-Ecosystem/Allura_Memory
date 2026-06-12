-- 25-process-engine.sql
-- Phase 1: Production Run Kernel — process_definitions + process_runs tables
-- AD-P1-01, AD-P1-02 from architecture-phase1-run-kernel.md
-- Migration is ADDITIVE ONLY — no DROP, no ALTER on existing tables

-- ── Process Definitions ──────────────────────────────────────────────────────
-- Versioned, tenant-scoped process definitions stored as JSON.
-- Each (id, revision, group_id) is unique. Revision auto-increments within tenant.
-- Soft-delete via deleted_at — run-pinned lookups ignore deleted_at.

CREATE TABLE IF NOT EXISTS process_definitions (
    id              TEXT NOT NULL,
    revision        INTEGER NOT NULL DEFAULT 1,
    group_id        TEXT NOT NULL,
    name            TEXT NOT NULL,
    definition_json JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,

    PRIMARY KEY (id, revision, group_id),

    CONSTRAINT process_definitions_group_id_check
        CHECK (group_id ~ '^allura-[a-z0-9-]+$'),

    CONSTRAINT process_definitions_json_size_check
        CHECK (length(definition_json::text) < 1048576)
);

CREATE INDEX IF NOT EXISTS idx_process_definitions_group_id
    ON process_definitions (group_id);

CREATE INDEX IF NOT EXISTS idx_process_definitions_active
    ON process_definitions (id, group_id)
    WHERE deleted_at IS NULL;

-- ── Process Runs (Snapshot Table) ────────────────────────────────────────────
-- Read optimization over append-only events. Events are the source of truth.
-- Optimistic concurrency via updated_at (WHERE updated_at = $expected).
-- Write order invariant: event INSERT → snapshot UPDATE, never reversed.

CREATE TABLE IF NOT EXISTS process_runs (
    id                   TEXT PRIMARY KEY,
    definition_id        TEXT NOT NULL,
    definition_revision  INTEGER NOT NULL,
    group_id             TEXT NOT NULL,
    status               TEXT NOT NULL DEFAULT 'pending',
    state_json           JSONB NOT NULL DEFAULT '{}'::jsonb,
    actor_id             TEXT,
    started_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at         TIMESTAMPTZ,

    CONSTRAINT process_runs_group_id_check
        CHECK (group_id ~ '^allura-[a-z0-9-]+$'),

    CONSTRAINT process_runs_status_check
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'paused')),

    CONSTRAINT process_runs_definition_fk
        FOREIGN KEY (definition_id, definition_revision, group_id)
        REFERENCES process_definitions (id, revision, group_id)
);

CREATE INDEX IF NOT EXISTS idx_process_runs_group_id
    ON process_runs (group_id);

CREATE INDEX IF NOT EXISTS idx_process_runs_status
    ON process_runs (group_id, status)
    WHERE status IN ('running', 'paused', 'pending');

CREATE INDEX IF NOT EXISTS idx_process_runs_definition
    ON process_runs (definition_id, definition_revision, group_id);
