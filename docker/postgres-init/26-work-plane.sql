-- 26-work-plane.sql
-- Phase 2: Work Plane — projects, work_items, evidence_packets, handoffs
-- Additive only — no DROP, no ALTER on existing tables

-- ── Projects ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS projects (
    id          TEXT PRIMARY KEY,
    group_id    TEXT NOT NULL,
    name        TEXT NOT NULL,
    description TEXT,
    status      TEXT NOT NULL DEFAULT 'active',
    owner_id    TEXT,
    team_id     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ,

    CONSTRAINT projects_group_id_check
        CHECK (group_id ~ '^allura-[a-z0-9-]+$'),

    CONSTRAINT projects_status_check
        CHECK (status IN ('active', 'archived', 'paused'))
);

CREATE INDEX IF NOT EXISTS idx_projects_group_id
    ON projects (group_id);

CREATE INDEX IF NOT EXISTS idx_projects_active
    ON projects (group_id, status)
    WHERE status = 'active';

-- ── Lanes ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lanes (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id),
    group_id    TEXT NOT NULL,
    name        TEXT NOT NULL,
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT lanes_group_id_check
        CHECK (group_id ~ '^allura-[a-z0-9-]+$')
);

CREATE INDEX IF NOT EXISTS idx_lanes_project
    ON lanes (project_id, group_id);

-- ── Work Items ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS work_items (
    id                  TEXT PRIMARY KEY,
    project_id          TEXT NOT NULL REFERENCES projects(id),
    lane_id             TEXT REFERENCES lanes(id),
    group_id            TEXT NOT NULL,
    title               TEXT NOT NULL,
    description         TEXT,
    status              TEXT NOT NULL DEFAULT 'backlog',
    priority            TEXT NOT NULL DEFAULT 'medium',
    owner_id            TEXT,
    team_id             TEXT,
    acceptance_criteria JSONB DEFAULT '[]'::jsonb,
    linked_run_id       TEXT,
    latest_receipt_id   TEXT,
    blocker             TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ,

    CONSTRAINT work_items_group_id_check
        CHECK (group_id ~ '^allura-[a-z0-9-]+$'),

    CONSTRAINT work_items_status_check
        CHECK (status IN ('backlog', 'ready', 'in_progress', 'in_review', 'blocked', 'done', 'cancelled')),

    CONSTRAINT work_items_priority_check
        CHECK (priority IN ('critical', 'high', 'medium', 'low'))
);

CREATE INDEX IF NOT EXISTS idx_work_items_project
    ON work_items (project_id, group_id);

CREATE INDEX IF NOT EXISTS idx_work_items_status
    ON work_items (group_id, status)
    WHERE status NOT IN ('done', 'cancelled');

CREATE INDEX IF NOT EXISTS idx_work_items_lane
    ON work_items (lane_id, group_id)
    WHERE lane_id IS NOT NULL;

-- ── Work Item Dependencies ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS work_item_dependencies (
    id              TEXT PRIMARY KEY,
    work_item_id    TEXT NOT NULL REFERENCES work_items(id),
    depends_on_id   TEXT NOT NULL REFERENCES work_items(id),
    group_id        TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT work_item_deps_group_id_check
        CHECK (group_id ~ '^allura-[a-z0-9-]+$'),

    CONSTRAINT work_item_deps_no_self
        CHECK (work_item_id != depends_on_id),

    UNIQUE (work_item_id, depends_on_id, group_id)
);

-- ── Evidence Packets ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS evidence_packets (
    id              TEXT PRIMARY KEY,
    group_id        TEXT NOT NULL,
    work_item_id    TEXT REFERENCES work_items(id),
    run_id          TEXT,
    step_id         TEXT,
    actor_id        TEXT NOT NULL,
    packet_type     TEXT NOT NULL DEFAULT 'general',
    content         JSONB NOT NULL DEFAULT '{}'::jsonb,
    artifact_refs   JSONB DEFAULT '[]'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT evidence_packets_group_id_check
        CHECK (group_id ~ '^allura-[a-z0-9-]+$'),

    CONSTRAINT evidence_packets_type_check
        CHECK (packet_type IN ('general', 'gate_result', 'review', 'approval', 'test_result', 'audit'))
);

CREATE INDEX IF NOT EXISTS idx_evidence_packets_group
    ON evidence_packets (group_id);

CREATE INDEX IF NOT EXISTS idx_evidence_packets_work_item
    ON evidence_packets (work_item_id, group_id)
    WHERE work_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_evidence_packets_run
    ON evidence_packets (run_id, group_id)
    WHERE run_id IS NOT NULL;

-- ── Handoffs ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS handoffs (
    id              TEXT PRIMARY KEY,
    group_id        TEXT NOT NULL,
    work_item_id    TEXT REFERENCES work_items(id),
    from_actor_id   TEXT NOT NULL,
    to_actor_id     TEXT NOT NULL,
    message         TEXT,
    status          TEXT NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ,

    CONSTRAINT handoffs_group_id_check
        CHECK (group_id ~ '^allura-[a-z0-9-]+$'),

    CONSTRAINT handoffs_status_check
        CHECK (status IN ('pending', 'acknowledged', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_handoffs_group
    ON handoffs (group_id, status)
    WHERE status = 'pending';
