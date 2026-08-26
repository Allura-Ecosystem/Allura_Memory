BEGIN;

-- Lossless recovery to the actually shipped Migration-39 contract. Current-only
-- workspace rows cannot be represented by Migration 39 and therefore refuse a
-- destructive rollback. Archived Migration-39 receipts are restored verbatim.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM promotion_outbox WHERE workspace_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM promotion_idempotency WHERE workspace_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM allura_memories WHERE workspace_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM graph_memories WHERE workspace_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM graph_supersedes WHERE workspace_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM graph_structural_nodes WHERE workspace_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM graph_structural_edges WHERE workspace_id IS NOT NULL) THEN
    RAISE EXCEPTION 'rollback refused: migration-040 workspace-scoped rows exist';
  END IF;
  IF EXISTS (SELECT 1 FROM canonical_proposals WHERE proposal_version <> 1) THEN
    RAISE EXCEPTION 'rollback refused: proposal_version differs from baseline 1';
  END IF;
  IF EXISTS (SELECT 1 FROM governance_receipts WHERE proposal_version_origin='current-contract') THEN
    RAISE EXCEPTION 'rollback refused: migration-040 current receipts exist';
  END IF;
  IF EXISTS (
    SELECT 1 FROM semantic_projections p JOIN schema_versions v ON v.version='040'
    WHERE p.generated_at >= v.applied_at
  ) THEN
    RAISE EXCEPTION 'rollback refused: post-040 semantic projections exist';
  END IF;
END $$;

DROP FUNCTION IF EXISTS app.finalize_governance_receipt_evidence(UUID,UUID[]);
DROP TRIGGER IF EXISTS governance_receipt_evidence_requests_immutable_trigger ON governance_receipt_evidence_requests;
DROP TABLE IF EXISTS governance_receipt_evidence_requests;
DROP TRIGGER IF EXISTS governance_receipts_immutable_trigger ON governance_receipts;
ALTER TABLE governance_receipts DROP CONSTRAINT IF EXISTS governance_receipts_current_contract_check;
ALTER TABLE governance_receipts DROP CONSTRAINT IF EXISTS governance_receipts_replay_key;
ALTER TABLE governance_receipts DROP CONSTRAINT IF EXISTS governance_receipts_proposal_scope_fkey;
ALTER TABLE governance_receipts DROP CONSTRAINT IF EXISTS governance_receipts_evidence_scope_fkey;
ALTER TABLE governance_receipts DROP CONSTRAINT IF EXISTS governance_receipts_scope_identity_key;
ALTER TABLE governance_receipts ADD COLUMN IF NOT EXISTS subject_kind TEXT;
ALTER TABLE governance_receipts ADD COLUMN IF NOT EXISTS subject_id TEXT;
ALTER TABLE governance_receipts ALTER COLUMN proposal_version DROP NOT NULL;
UPDATE governance_receipts
SET subject_kind=COALESCE(subject_kind,'proposal'),
    subject_id=COALESCE(subject_id,proposal_id::text);

-- Restore every archived legacy row using the shipped columns, not a lossy
-- reinterpretation of its JSON envelope.
INSERT INTO governance_receipts(
  id,group_id,workspace_id,subject_kind,subject_id,action,actor_id,actor_role,
  rationale,policy_reference,policy_version,proposal_version,memory_id,result_ref,
  outbox_state,source_event_id,witness_hash,evidence_references,occurred_at,created_at)
SELECT
  (archived_receipt->>'id')::uuid,archived_receipt->>'group_id',archived_receipt->>'workspace_id',
  archived_receipt->>'subject_kind',archived_receipt->>'subject_id',archived_receipt->>'action',
  archived_receipt->>'actor_id',archived_receipt->>'actor_role',archived_receipt->>'rationale',
  archived_receipt->>'policy_reference',archived_receipt->>'policy_version',archived_receipt->>'proposal_version',
  archived_receipt->>'memory_id',archived_receipt->>'result_ref',COALESCE(archived_receipt->>'outbox_state','not_enqueued'),
  NULLIF(archived_receipt->>'source_event_id','')::bigint,archived_receipt->>'witness_hash',
  COALESCE(archived_receipt->'evidence_references','[]'::jsonb),
  (archived_receipt->>'occurred_at')::timestamptz,(archived_receipt->>'created_at')::timestamptz
FROM governance_receipts_legacy_archive
ON CONFLICT(id) DO NOTHING;

ALTER TABLE governance_receipts ALTER COLUMN subject_kind SET NOT NULL;
ALTER TABLE governance_receipts ALTER COLUMN subject_id SET NOT NULL;
ALTER TABLE governance_receipts ALTER COLUMN proposal_version DROP NOT NULL;
ALTER TABLE governance_receipts DROP COLUMN IF EXISTS proposal_id;
ALTER TABLE governance_receipts DROP COLUMN IF EXISTS evidence_request_id;
ALTER TABLE governance_receipts DROP COLUMN IF EXISTS evidence_identity_hash;
ALTER TABLE governance_receipts DROP COLUMN IF EXISTS proposal_version_origin;
DROP INDEX IF EXISTS governance_receipts_scope_proposal_occurred_idx;
CREATE INDEX IF NOT EXISTS governance_receipts_scope_subject_occurred_idx
  ON governance_receipts(group_id,workspace_id,subject_kind,subject_id,occurred_at DESC,id);
CREATE OR REPLACE FUNCTION app.prevent_governance_receipt_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'governance_receipts are immutable'; END; $$;
CREATE TRIGGER governance_receipts_immutable_trigger BEFORE UPDATE OR DELETE ON governance_receipts
  FOR EACH ROW EXECUTE FUNCTION app.prevent_governance_receipt_mutation();
DROP TABLE governance_receipts_legacy_archive;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='semantic_projections' AND column_name='source_kind') THEN
    ALTER TABLE semantic_projections RENAME COLUMN source_kind TO subject_kind;
    ALTER TABLE semantic_projections RENAME COLUMN source_id TO subject_id;
    ALTER TABLE semantic_projections RENAME COLUMN markdown TO content_markdown;
    ALTER TABLE semantic_projections RENAME COLUMN generated_at TO built_at;
  END IF;
END $$;
ALTER TABLE semantic_projections DROP CONSTRAINT IF EXISTS semantic_projections_build_state_check;
ALTER TABLE semantic_projections DROP CONSTRAINT IF EXISTS semantic_projections_idempotency_key;
ALTER TABLE semantic_projections DROP COLUMN IF EXISTS content_hash;
ALTER TABLE semantic_projections DROP COLUMN IF EXISTS embedding_model;
ALTER TABLE semantic_projections ALTER COLUMN build_state SET DEFAULT 'ready';
ALTER TABLE semantic_projections ADD CONSTRAINT semantic_projections_build_state_check CHECK(build_state IN('ready','failed'));
ALTER TABLE semantic_projections ADD CONSTRAINT semantic_projections_idempotency_key
  UNIQUE(group_id,workspace_id,subject_kind,subject_id,projection_version,source_revision_hash,source_refs,redaction_policy_version);
DROP INDEX IF EXISTS semantic_projections_scope_source_generated_idx;
CREATE INDEX IF NOT EXISTS semantic_projections_scope_subject_built_idx
  ON semantic_projections(group_id,workspace_id,subject_kind,subject_id,built_at DESC);

DROP POLICY IF EXISTS workspace_scope_restrictive_policy ON graph_memories;
DROP POLICY IF EXISTS workspace_scope_restrictive_policy ON graph_supersedes;
DROP POLICY IF EXISTS workspace_scope_restrictive_policy ON graph_structural_nodes;
DROP POLICY IF EXISTS workspace_scope_restrictive_policy ON graph_structural_edges;
ALTER TABLE graph_structural_edges DROP CONSTRAINT IF EXISTS graph_structural_edges_group_workspace_fkey;
ALTER TABLE graph_structural_edges DROP CONSTRAINT IF EXISTS graph_structural_edges_workspace_scope_state_check;
ALTER TABLE graph_structural_edges DROP COLUMN IF EXISTS workspace_scope_state;
ALTER TABLE graph_structural_edges DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE graph_structural_nodes DROP CONSTRAINT IF EXISTS graph_structural_nodes_group_workspace_fkey;
ALTER TABLE graph_structural_nodes DROP CONSTRAINT IF EXISTS graph_structural_nodes_workspace_scope_state_check;
ALTER TABLE graph_structural_nodes DROP COLUMN IF EXISTS workspace_scope_state;
ALTER TABLE graph_structural_nodes DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE graph_supersedes DROP CONSTRAINT IF EXISTS graph_supersedes_superseded_scope_fkey;
ALTER TABLE graph_supersedes DROP CONSTRAINT IF EXISTS graph_supersedes_newer_scope_fkey;
ALTER TABLE graph_supersedes DROP CONSTRAINT IF EXISTS graph_supersedes_group_workspace_fkey;
ALTER TABLE graph_supersedes DROP CONSTRAINT IF EXISTS graph_supersedes_workspace_scope_state_check;
ALTER TABLE graph_supersedes DROP COLUMN IF EXISTS workspace_scope_state;
ALTER TABLE graph_supersedes DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE graph_memories DROP CONSTRAINT IF EXISTS graph_memories_group_workspace_fkey;
ALTER TABLE graph_memories DROP CONSTRAINT IF EXISTS graph_memories_scope_identity_key;
ALTER TABLE graph_memories DROP CONSTRAINT IF EXISTS graph_memories_workspace_scope_state_check;
ALTER TABLE graph_memories DROP COLUMN IF EXISTS workspace_scope_state;
ALTER TABLE graph_memories DROP COLUMN IF EXISTS workspace_id;
DROP POLICY IF EXISTS workspace_scope_restrictive_policy ON allura_memories;
DROP POLICY IF EXISTS workspace_scope_restrictive_policy ON promotion_outbox;
DROP POLICY IF EXISTS workspace_scope_restrictive_policy ON promotion_idempotency;
ALTER TABLE allura_memories DROP CONSTRAINT IF EXISTS allura_memories_workspace_scope_state_check;
ALTER TABLE allura_memories DROP CONSTRAINT IF EXISTS allura_memories_group_workspace_fkey;
ALTER TABLE promotion_outbox DROP CONSTRAINT IF EXISTS promotion_outbox_workspace_scope_state_check;
ALTER TABLE promotion_outbox DROP CONSTRAINT IF EXISTS promotion_outbox_group_workspace_fkey;
ALTER TABLE promotion_idempotency DROP CONSTRAINT IF EXISTS promotion_idempotency_workspace_scope_state_check;
ALTER TABLE promotion_idempotency DROP CONSTRAINT IF EXISTS promotion_idempotency_group_workspace_fkey;
ALTER TABLE promotion_outbox DROP CONSTRAINT IF EXISTS promotion_outbox_scope_proposal_key;
ALTER TABLE promotion_outbox ADD CONSTRAINT promotion_outbox_group_id_proposal_id_key UNIQUE(group_id,proposal_id);
ALTER TABLE promotion_idempotency DROP CONSTRAINT IF EXISTS promotion_idempotency_scope_key;
ALTER TABLE promotion_idempotency DROP CONSTRAINT IF EXISTS promotion_idempotency_pkey;
ALTER TABLE promotion_idempotency ADD CONSTRAINT promotion_idempotency_pkey PRIMARY KEY(group_id,idempotency_key);
ALTER TABLE promotion_idempotency DROP COLUMN IF EXISTS id;
ALTER TABLE allura_memories DROP COLUMN IF EXISTS workspace_scope_state;
ALTER TABLE allura_memories DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE promotion_outbox DROP COLUMN IF EXISTS workspace_scope_state;
ALTER TABLE promotion_outbox DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE promotion_idempotency DROP COLUMN IF EXISTS workspace_scope_state;
ALTER TABLE promotion_idempotency DROP COLUMN IF EXISTS workspace_id;

DROP TRIGGER IF EXISTS canonical_proposals_version_trigger ON canonical_proposals;
DROP FUNCTION IF EXISTS app.bump_canonical_proposal_version();
ALTER TABLE canonical_proposals DROP COLUMN IF EXISTS proposal_version;
DELETE FROM schema_versions WHERE version='040';
COMMIT;
