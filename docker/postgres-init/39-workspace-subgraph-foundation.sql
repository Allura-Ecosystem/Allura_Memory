-- Story 25.2a: workspace scope and evidence lifecycle foundation.
--
-- Additive only. Legacy group-scoped rows are intentionally not assigned an
-- invented workspace. They remain outside future workspace-scoped reads until a
-- reviewed migration map is supplied.

-- A workspace remains globally addressable for compatibility, while this
-- composite key is the tenant-safe reference used by new scoped records.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.workspaces'::regclass
      AND conname = 'workspaces_group_workspace_key'
  ) THEN
    ALTER TABLE workspaces
      ADD CONSTRAINT workspaces_group_workspace_key UNIQUE (group_id, workspace_id);
  END IF;
END $$;

-- Existing token rows are not rewritten. The original workspace foreign key
-- remains in place for compatibility; this additional NOT VALID composite FK
-- enforces the tenant/workspace relationship for every new write.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.mcp_tokens'::regclass
      AND conname = 'mcp_tokens_group_workspace_fkey'
  ) THEN
    ALTER TABLE mcp_tokens
      ADD CONSTRAINT mcp_tokens_group_workspace_fkey
      FOREIGN KEY (group_id, workspace_id)
      REFERENCES workspaces(group_id, workspace_id)
      NOT VALID;
  END IF;
END $$;

-- Legacy proposals remain unscoped and are intentionally unavailable to the
-- workspace-scoped application role. New app writes must carry the same
-- tenant/workspace pair resolved from the authenticated principal.
ALTER TABLE canonical_proposals
  ADD COLUMN IF NOT EXISTS workspace_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.canonical_proposals'::regclass
      AND conname = 'canonical_proposals_group_workspace_fkey'
  ) THEN
    ALTER TABLE canonical_proposals
      ADD CONSTRAINT canonical_proposals_group_workspace_fkey
      FOREIGN KEY (group_id, workspace_id)
      REFERENCES workspaces(group_id, workspace_id)
      NOT VALID;
  END IF;
END $$;

-- A proposal's globally unique id is insufficient for a workspace-owned child:
-- the composite key makes the referenced tenant/workspace explicit.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.canonical_proposals'::regclass
      AND conname = 'canonical_proposals_group_workspace_id_key'
  ) THEN
    ALTER TABLE canonical_proposals
      ADD CONSTRAINT canonical_proposals_group_workspace_id_key
      UNIQUE (group_id, workspace_id, id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_canonical_proposals_workspace_queue
  ON canonical_proposals (group_id, workspace_id, status, score DESC)
  WHERE workspace_id IS NOT NULL;

-- Preserve the existing durable event-id uniqueness boundary. Event IDs are
-- globally durable and each workspace-governed event already belongs to exactly
-- one workspace, so idx_canonical_proposals_trace_ref_unique is sufficient and
-- must remain in place. A second scoped trace index would be redundant and
-- would weaken that global idempotency guarantee.

-- Events remain append-only and legacy rows stay unscoped.  Workspace-governed
-- producers must provide this explicit pair; workspace watchdog reads exclude
-- NULL rows rather than assigning a default workspace to historical evidence.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS workspace_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.events'::regclass
      AND conname = 'events_group_workspace_fkey'
  ) THEN
    ALTER TABLE events
      ADD CONSTRAINT events_group_workspace_fkey
      FOREIGN KEY (group_id, workspace_id)
      REFERENCES workspaces(group_id, workspace_id)
      NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_events_workspace_watchdog_candidates
  ON events (group_id, workspace_id, created_at DESC)
  WHERE workspace_id IS NOT NULL;

-- Retain the global event primary key while exposing a scope-qualified identity
-- for children that must prove their source belongs to the same tenant/workspace.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.events'::regclass
      AND conname = 'events_group_workspace_id_key'
  ) THEN
    ALTER TABLE events
      ADD CONSTRAINT events_group_workspace_id_key
      UNIQUE (group_id, workspace_id, id);
  END IF;
END $$;

-- Migration 36 created a group-only events policy. Tighten it and every policy
-- already present on events so permissive-policy OR semantics cannot retain a
-- same-group cross-workspace bypass. NULL-workspace legacy events fail this
-- predicate and therefore remain unavailable to workspace-scoped app reads.
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE events FORCE ROW LEVEL SECURITY;
DO $$
DECLARE
  policy_name TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.events'::regclass
      AND polname = 'tenant_isolation_policy'
  ) THEN
    CREATE POLICY tenant_isolation_policy ON events
      FOR ALL TO allura_app
      USING (
        group_id = current_setting('app.current_group_id', true)
        AND workspace_id = current_setting('app.current_workspace_id', true)
      )
      WITH CHECK (
        group_id = current_setting('app.current_group_id', true)
        AND workspace_id = current_setting('app.current_workspace_id', true)
      );
  END IF;

  FOR policy_name IN
    SELECT polname
    FROM pg_policy
    WHERE polrelid = 'public.events'::regclass
  LOOP
    EXECUTE format(
      'ALTER POLICY %I ON events USING (group_id = current_setting(''app.current_group_id'', true) AND workspace_id = current_setting(''app.current_workspace_id'', true)) WITH CHECK (group_id = current_setting(''app.current_group_id'', true) AND workspace_id = current_setting(''app.current_workspace_id'', true))',
      policy_name
    );
  END LOOP;
END $$;

-- Proposal audit triggers predate workspace scope. Preserve their append-only
-- behavior while propagating a real workspace for every scoped app proposal;
-- legacy NULL-workspace proposal rows remain legacy events and stay hidden from
-- workspace-scoped app reads.
CREATE OR REPLACE FUNCTION log_proposal_created()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO events (
    group_id, workspace_id, event_type, agent_id, status, metadata, created_at
  ) VALUES (
    NEW.group_id,
    NEW.workspace_id,
    'proposal_created',
    'system',
    'completed',
    jsonb_build_object(
      'proposal_id', NEW.id,
      'score', NEW.score,
      'tier', NEW.tier,
      'content_preview', LEFT(NEW.content, 100)
    ),
    NEW.created_at
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION log_proposal_decided()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected') THEN
    INSERT INTO events (
      group_id, workspace_id, event_type, agent_id, status, metadata, created_at
    ) VALUES (
      NEW.group_id,
      NEW.workspace_id,
      CASE NEW.status
        WHEN 'approved' THEN 'proposal_approved'
        WHEN 'rejected' THEN 'proposal_rejected'
      END,
      NEW.decided_by,
      'completed',
      jsonb_build_object(
        'proposal_id', NEW.id,
        'decision', NEW.status,
        'rationale', NEW.rationale,
        'score', NEW.score
      ),
      NEW.decided_at
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE canonical_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_proposals FORCE ROW LEVEL SECURITY;

-- Compatibility/replay guard: deployed databases may already have the original
-- tenant_isolation_policy. Alter it in place rather than removing its protection.
-- Fresh databases create that same correctly scoped policy. Then constrain every
-- extant proposal policy so PostgreSQL's permissive-policy OR semantics cannot
-- leave an older group-only policy as a workspace bypass.
DO $$
DECLARE
  policy_name TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy
    WHERE polrelid = 'public.canonical_proposals'::regclass
      AND polname = 'tenant_isolation_policy'
  ) THEN
    CREATE POLICY tenant_isolation_policy ON canonical_proposals
      FOR ALL TO allura_app
      USING (
        group_id = current_setting('app.current_group_id', true)
        AND workspace_id = current_setting('app.current_workspace_id', true)
      )
      WITH CHECK (
        group_id = current_setting('app.current_group_id', true)
        AND workspace_id = current_setting('app.current_workspace_id', true)
      );
  END IF;

  FOR policy_name IN
    SELECT polname
    FROM pg_policy
    WHERE polrelid = 'public.canonical_proposals'::regclass
  LOOP
    EXECUTE format(
      'ALTER POLICY %I ON canonical_proposals USING (group_id = current_setting(''app.current_group_id'', true) AND workspace_id = current_setting(''app.current_workspace_id'', true)) WITH CHECK (group_id = current_setting(''app.current_group_id'', true) AND workspace_id = current_setting(''app.current_workspace_id'', true))',
      policy_name
    );
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS evidence_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id TEXT NOT NULL CHECK (group_id ~ '^allura-[a-z0-9-]+$'),
  workspace_id TEXT NOT NULL,
  proposal_id UUID NOT NULL,
  requested_by TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  state TEXT NOT NULL DEFAULT 'requested'
    CHECK (state IN ('requested', 'satisfied', 'reopened', 'cancelled')),
  reason TEXT NOT NULL CHECK (LENGTH(TRIM(reason)) > 0),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  evidence_references JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(evidence_references) = 'array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT evidence_requests_group_workspace_fkey
    FOREIGN KEY (group_id, workspace_id)
    REFERENCES workspaces(group_id, workspace_id),
  CONSTRAINT evidence_requests_proposal_scope_fkey
    FOREIGN KEY (group_id, workspace_id, proposal_id)
    REFERENCES canonical_proposals(group_id, workspace_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS evidence_requests_scope_proposal_state_idx
  ON evidence_requests (group_id, workspace_id, proposal_id, state, requested_at DESC, id);

CREATE TABLE IF NOT EXISTS governance_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id TEXT NOT NULL CHECK (group_id ~ '^allura-[a-z0-9-]+$'),
  workspace_id TEXT NOT NULL,
  subject_kind TEXT NOT NULL CHECK (LENGTH(TRIM(subject_kind)) > 0),
  subject_id TEXT NOT NULL CHECK (LENGTH(TRIM(subject_id)) > 0),
  action TEXT NOT NULL CHECK (LENGTH(TRIM(action)) > 0),
  actor_id TEXT NOT NULL CHECK (LENGTH(TRIM(actor_id)) > 0),
  actor_role TEXT NOT NULL CHECK (LENGTH(TRIM(actor_role)) > 0),
  rationale TEXT NOT NULL CHECK (LENGTH(TRIM(rationale)) > 0),
  policy_reference TEXT NOT NULL CHECK (LENGTH(TRIM(policy_reference)) > 0),
  policy_version TEXT NOT NULL CHECK (LENGTH(TRIM(policy_version)) > 0),
  proposal_version TEXT,
  memory_id TEXT,
  result_ref TEXT,
  outbox_state TEXT NOT NULL DEFAULT 'not_enqueued'
    CHECK (outbox_state IN ('not_enqueued', 'queued', 'synced', 'failed', 'not_applicable')),
  source_event_id BIGINT,
  witness_hash TEXT,
  evidence_references JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(evidence_references) = 'array'),
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT governance_receipts_group_workspace_fkey
    FOREIGN KEY (group_id, workspace_id)
    REFERENCES workspaces(group_id, workspace_id)
);

-- A receipt can cite an event only from that receipt's exact tenant/workspace.
-- NOT VALID preserves any pre-existing receipt data without inventing workspace
-- backfills, while still enforcing this provenance boundary for every new write.
ALTER TABLE governance_receipts
  DROP CONSTRAINT IF EXISTS governance_receipts_source_event_id_fkey;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.governance_receipts'::regclass
      AND conname = 'governance_receipts_source_event_scope_fkey'
  ) THEN
    ALTER TABLE governance_receipts
      ADD CONSTRAINT governance_receipts_source_event_scope_fkey
      FOREIGN KEY (group_id, workspace_id, source_event_id)
      REFERENCES events(group_id, workspace_id, id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS governance_receipts_scope_subject_occurred_idx
  ON governance_receipts (group_id, workspace_id, subject_kind, subject_id, occurred_at DESC, id);

CREATE TABLE IF NOT EXISTS semantic_projections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id TEXT NOT NULL CHECK (group_id ~ '^allura-[a-z0-9-]+$'),
  workspace_id TEXT NOT NULL,
  subject_kind TEXT NOT NULL CHECK (LENGTH(TRIM(subject_kind)) > 0),
  subject_id TEXT NOT NULL CHECK (LENGTH(TRIM(subject_id)) > 0),
  projection_version TEXT NOT NULL CHECK (LENGTH(TRIM(projection_version)) > 0),
  source_revision_hash TEXT NOT NULL CHECK (LENGTH(TRIM(source_revision_hash)) > 0),
  source_refs JSONB NOT NULL CHECK (
    jsonb_typeof(source_refs) = 'array' AND jsonb_array_length(source_refs) > 0
  ),
  redaction_policy_version TEXT NOT NULL CHECK (LENGTH(TRIM(redaction_policy_version)) > 0),
  content_markdown TEXT NOT NULL,
  embedding vector,
  embedding_model_version TEXT,
  build_state TEXT NOT NULL DEFAULT 'ready'
    CHECK (build_state IN ('ready', 'failed')),
  failure_code TEXT,
  built_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT semantic_projections_group_workspace_fkey
    FOREIGN KEY (group_id, workspace_id)
    REFERENCES workspaces(group_id, workspace_id),
  CONSTRAINT semantic_projections_idempotency_key
    UNIQUE (group_id, workspace_id, subject_kind, subject_id, projection_version,
            source_revision_hash, source_refs, redaction_policy_version)
);

CREATE INDEX IF NOT EXISTS semantic_projections_scope_subject_built_idx
  ON semantic_projections (group_id, workspace_id, subject_kind, subject_id, built_at DESC);

-- These tables are workspace-owned. New routes must establish both transaction
-- settings before accessing them; this migration does not change legacy routes.
ALTER TABLE evidence_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE governance_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE semantic_projections ENABLE ROW LEVEL SECURITY;
ALTER TABLE semantic_projections FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS evidence_requests_workspace_isolation_policy ON evidence_requests;
CREATE POLICY evidence_requests_workspace_isolation_policy ON evidence_requests
  FOR ALL TO allura_app
  USING (
    group_id = current_setting('app.current_group_id', true)
    AND workspace_id = current_setting('app.current_workspace_id', true)
  )
  WITH CHECK (
    group_id = current_setting('app.current_group_id', true)
    AND workspace_id = current_setting('app.current_workspace_id', true)
  );

DROP POLICY IF EXISTS governance_receipts_workspace_isolation_policy ON governance_receipts;
CREATE POLICY governance_receipts_workspace_isolation_policy ON governance_receipts
  FOR ALL TO allura_app
  USING (
    group_id = current_setting('app.current_group_id', true)
    AND workspace_id = current_setting('app.current_workspace_id', true)
  )
  WITH CHECK (
    group_id = current_setting('app.current_group_id', true)
    AND workspace_id = current_setting('app.current_workspace_id', true)
  );

DROP POLICY IF EXISTS semantic_projections_workspace_isolation_policy ON semantic_projections;
CREATE POLICY semantic_projections_workspace_isolation_policy ON semantic_projections
  FOR ALL TO allura_app
  USING (
    group_id = current_setting('app.current_group_id', true)
    AND workspace_id = current_setting('app.current_workspace_id', true)
  )
  WITH CHECK (
    group_id = current_setting('app.current_group_id', true)
    AND workspace_id = current_setting('app.current_workspace_id', true)
  );

CREATE OR REPLACE FUNCTION app.prevent_governance_receipt_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'governance_receipts are immutable';
END;
$$;

DROP TRIGGER IF EXISTS governance_receipts_immutable_trigger ON governance_receipts;
CREATE TRIGGER governance_receipts_immutable_trigger
  BEFORE UPDATE OR DELETE ON governance_receipts
  FOR EACH ROW
  EXECUTE FUNCTION app.prevent_governance_receipt_mutation();

GRANT SELECT, INSERT, UPDATE, DELETE ON evidence_requests, governance_receipts, semantic_projections TO allura_app;

INSERT INTO schema_versions (version, applied_at, description)
VALUES (
  '039',
  NOW(),
  'Story 25.2a workspace composite integrity and scoped evidence, receipt, and semantic projection foundations'
) ON CONFLICT (version) DO NOTHING;
