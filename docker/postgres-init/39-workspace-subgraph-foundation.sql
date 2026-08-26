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
ALTER TABLE canonical_proposals
  ADD COLUMN IF NOT EXISTS proposal_version BIGINT NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION app.bump_canonical_proposal_version()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.content, NEW.score, NEW.tier, NEW.status, NEW.trace_ref, NEW.rationale)
     IS DISTINCT FROM
     ROW(OLD.content, OLD.score, OLD.tier, OLD.status, OLD.trace_ref, OLD.rationale) THEN
    NEW.proposal_version := OLD.proposal_version + 1;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS canonical_proposals_version_trigger ON canonical_proposals;
CREATE TRIGGER canonical_proposals_version_trigger
  BEFORE UPDATE ON canonical_proposals FOR EACH ROW
  EXECUTE FUNCTION app.bump_canonical_proposal_version();

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

-- Preserve every heterogeneous existing policy verbatim. A restrictive policy
-- is ANDed with all permissive policies, closing cross-workspace access without
-- erasing or rewriting predicates owned by earlier migrations.
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace_scope_restrictive_policy ON events;
CREATE POLICY workspace_scope_restrictive_policy ON events AS RESTRICTIVE
  FOR ALL TO allura_app
  USING (
    group_id = current_setting('app.current_group_id', true)
    AND workspace_id = current_setting('app.current_workspace_id', true)
  )
  WITH CHECK (
    group_id = current_setting('app.current_group_id', true)
    AND workspace_id = current_setting('app.current_workspace_id', true)
  );

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

-- Preserve heterogeneous proposal policies and apply scope as a restrictive
-- policy so replay cannot destroy predicates from another migration.
DROP POLICY IF EXISTS workspace_scope_restrictive_policy ON canonical_proposals;
CREATE POLICY workspace_scope_restrictive_policy ON canonical_proposals AS RESTRICTIVE
  FOR ALL TO allura_app
  USING (
    group_id = current_setting('app.current_group_id', true)
    AND workspace_id = current_setting('app.current_workspace_id', true)
  )
  WITH CHECK (
    group_id = current_setting('app.current_group_id', true)
    AND workspace_id = current_setting('app.current_workspace_id', true)
  );

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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.evidence_requests'::regclass
      AND conname = 'evidence_requests_scope_identity_key'
  ) THEN
    ALTER TABLE evidence_requests
      ADD CONSTRAINT evidence_requests_scope_identity_key
      UNIQUE (group_id, workspace_id, proposal_id, id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS governance_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id TEXT NOT NULL CHECK (group_id ~ '^allura-[a-z0-9-]+$'),
  workspace_id TEXT NOT NULL,
  proposal_id UUID NOT NULL,
  proposal_version TEXT NOT NULL CHECK (LENGTH(TRIM(proposal_version)) > 0),
  evidence_request_id UUID NOT NULL,
  evidence_identity_hash TEXT NOT NULL CHECK (evidence_identity_hash ~ '^[a-f0-9]{64}$'),
  action TEXT NOT NULL CHECK (action IN ('approve', 'reject', 'request_evidence')),
  actor_id TEXT NOT NULL CHECK (LENGTH(TRIM(actor_id)) > 0),
  actor_role TEXT NOT NULL CHECK (actor_role IN ('curator', 'admin')),
  rationale TEXT NOT NULL CHECK (LENGTH(TRIM(rationale)) > 0),
  policy_reference TEXT NOT NULL CHECK (LENGTH(TRIM(policy_reference)) > 0),
  policy_version TEXT NOT NULL CHECK (LENGTH(TRIM(policy_version)) > 0),
  memory_id TEXT,
  result_ref TEXT,
  outbox_state TEXT NOT NULL
    CHECK (outbox_state IN ('not_enqueued', 'queued', 'synced', 'failed', 'not_applicable')),
  source_event_id BIGINT,
  witness_hash TEXT,
  evidence_references JSONB NOT NULL CHECK (
    jsonb_typeof(evidence_references) = 'array' AND jsonb_array_length(evidence_references) > 0
  ),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT governance_receipts_group_workspace_fkey
    FOREIGN KEY (group_id, workspace_id) REFERENCES workspaces(group_id, workspace_id),
  CONSTRAINT governance_receipts_proposal_scope_fkey
    FOREIGN KEY (group_id, workspace_id, proposal_id)
    REFERENCES canonical_proposals(group_id, workspace_id, id) ON DELETE RESTRICT,
  CONSTRAINT governance_receipts_evidence_scope_fkey
    FOREIGN KEY (group_id, workspace_id, proposal_id, evidence_request_id)
    REFERENCES evidence_requests(group_id, workspace_id, proposal_id, id) ON DELETE RESTRICT,
  CONSTRAINT governance_receipts_replay_key
    UNIQUE (group_id, workspace_id, proposal_id, proposal_version, evidence_identity_hash, action)
);

-- A receipt can cite an event only from that receipt's exact tenant/workspace.
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
      ON DELETE RESTRICT NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS governance_receipts_scope_proposal_occurred_idx
  ON governance_receipts (group_id, workspace_id, proposal_id, occurred_at DESC, id);

CREATE TABLE IF NOT EXISTS semantic_projections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id TEXT NOT NULL CHECK (group_id ~ '^allura-[a-z0-9-]+$'),
  workspace_id TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (LENGTH(TRIM(source_kind)) > 0),
  source_id TEXT NOT NULL CHECK (LENGTH(TRIM(source_id)) > 0),
  projection_version TEXT NOT NULL CHECK (LENGTH(TRIM(projection_version)) > 0),
  source_revision_hash TEXT NOT NULL CHECK (source_revision_hash ~ '^[a-f0-9]{64}$'),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  source_refs JSONB NOT NULL CHECK (
    jsonb_typeof(source_refs) = 'array' AND jsonb_array_length(source_refs) > 0
  ),
  redaction_policy_version TEXT NOT NULL CHECK (LENGTH(TRIM(redaction_policy_version)) > 0),
  markdown TEXT NOT NULL,
  embedding vector,
  embedding_model TEXT,
  embedding_model_version TEXT,
  build_state TEXT NOT NULL DEFAULT 'pending_embedding'
    CHECK (
      (build_state = 'pending_embedding' AND embedding IS NULL AND embedding_model IS NULL AND embedding_model_version IS NULL AND failure_code IS NULL)
      OR (build_state = 'ready' AND embedding IS NOT NULL AND LENGTH(TRIM(embedding_model)) > 0 AND LENGTH(TRIM(embedding_model_version)) > 0 AND failure_code IS NULL)
      OR (build_state = 'failed' AND embedding IS NULL AND LENGTH(TRIM(failure_code)) > 0)
    ),
  failure_code TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT semantic_projections_group_workspace_fkey
    FOREIGN KEY (group_id, workspace_id) REFERENCES workspaces(group_id, workspace_id),
  CONSTRAINT semantic_projections_idempotency_key
    UNIQUE (group_id, workspace_id, source_kind, source_id, projection_version,
            source_revision_hash, content_hash, source_refs, redaction_policy_version)
);

CREATE INDEX IF NOT EXISTS semantic_projections_scope_source_generated_idx
  ON semantic_projections (group_id, workspace_id, source_kind, source_id, generated_at DESC);

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
