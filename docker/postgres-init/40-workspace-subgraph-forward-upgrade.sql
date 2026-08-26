BEGIN;

-- Story 25.2a remediation — authoritative forward upgrade from shipped Migration 39.
-- Legacy rows are preserved only where their truth is reconstructible; unscoped
-- retained/promotion rows are explicitly quarantined and invisible to app-role workspace reads.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
    SELECT 1 FROM pg_constraint WHERE conrelid='public.evidence_requests'::regclass
      AND conname='evidence_requests_scope_identity_key'
  ) THEN
    ALTER TABLE evidence_requests ADD CONSTRAINT evidence_requests_scope_identity_key
      UNIQUE (group_id, workspace_id, proposal_id, id);
  END IF;
END $$;

-- Upgrade the actually shipped Migration-39 receipt shape before deciding that
-- any row is unmappable. Proposal subjects map directly; evidence-request
-- subjects map through their same-scope proposal. Only rows that still lack a
-- same-scope proposal/source event after both passes are archived.
ALTER TABLE governance_receipts ADD COLUMN IF NOT EXISTS proposal_id UUID;
ALTER TABLE governance_receipts ADD COLUMN IF NOT EXISTS evidence_request_id UUID;
ALTER TABLE governance_receipts ADD COLUMN IF NOT EXISTS evidence_identity_hash TEXT;
ALTER TABLE governance_receipts ADD COLUMN IF NOT EXISTS proposal_version_origin TEXT;
DROP TRIGGER IF EXISTS governance_receipts_immutable_trigger ON governance_receipts;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='governance_receipts' AND column_name='subject_kind') THEN
    EXECUTE $upgrade$
      UPDATE governance_receipts r
      SET proposal_id=p.id,
          proposal_version=COALESCE(NULLIF(btrim(r.proposal_version),''),p.proposal_version::text),
          proposal_version_origin=CASE WHEN r.proposal_version IS NULL OR btrim(r.proposal_version)='' THEN 'migration-040-baseline' ELSE 'migration-039-preserved' END
      FROM canonical_proposals p
      WHERE r.proposal_id IS NULL AND r.subject_kind='proposal' AND r.subject_id=p.id::text
        AND r.group_id=p.group_id AND r.workspace_id=p.workspace_id
    $upgrade$;
    EXECUTE $upgrade$
      UPDATE governance_receipts r
      SET proposal_id=er.proposal_id,
          evidence_request_id=er.id,
          proposal_version=COALESCE(NULLIF(btrim(r.proposal_version),''),p.proposal_version::text),
          proposal_version_origin=CASE WHEN r.proposal_version IS NULL OR btrim(r.proposal_version)='' THEN 'migration-040-baseline' ELSE 'migration-039-preserved' END
      FROM evidence_requests er
      JOIN canonical_proposals p ON p.group_id=er.group_id AND p.workspace_id=er.workspace_id AND p.id=er.proposal_id
      WHERE r.proposal_id IS NULL AND r.subject_kind IN ('evidence_request','evidence-request') AND r.subject_id=er.id::text
        AND r.group_id=er.group_id AND r.workspace_id=er.workspace_id
    $upgrade$;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS governance_receipts_legacy_archive (
  id UUID PRIMARY KEY, group_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
  archived_receipt JSONB NOT NULL, archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archive_reason TEXT NOT NULL DEFAULT 'pre-040-incomplete-or-unmappable'
);
REVOKE ALL ON governance_receipts_legacy_archive FROM PUBLIC;
REVOKE ALL ON governance_receipts_legacy_archive FROM allura_app;
INSERT INTO governance_receipts_legacy_archive(id,group_id,workspace_id,archived_receipt,archive_reason)
SELECT r.id,r.group_id,r.workspace_id,to_jsonb(r),
       CASE WHEN r.source_event_id IS NULL THEN 'missing-source-event'
            WHEN r.proposal_id IS NULL THEN 'unmappable-subject'
            WHEN r.action NOT IN ('approve','reject','request_evidence') THEN 'legacy-action'
            WHEN r.actor_role NOT IN ('curator','admin') THEN 'legacy-actor-role'
            WHEN jsonb_typeof(r.evidence_references) IS DISTINCT FROM 'array' OR jsonb_array_length(r.evidence_references)=0 THEN 'empty-or-invalid-evidence'
            WHEN r.proposal_version IS NULL OR btrim(r.proposal_version) !~ '^[1-9][0-9]*$' THEN 'invalid-proposal-version'
            WHEN r.action='request_evidence' AND r.evidence_request_id IS NULL THEN 'missing-evidence-request'
            ELSE 'cross-scope-source-event' END
FROM governance_receipts r
WHERE r.source_event_id IS NULL OR r.proposal_id IS NULL
   OR r.action NOT IN ('approve','reject','request_evidence')
   OR r.actor_role NOT IN ('curator','admin')
   OR jsonb_typeof(r.evidence_references) IS DISTINCT FROM 'array'
   OR (jsonb_typeof(r.evidence_references)='array' AND jsonb_array_length(r.evidence_references)=0)
   OR r.proposal_version IS NULL OR btrim(r.proposal_version) !~ '^[1-9][0-9]*$'
   OR (r.action='request_evidence' AND r.evidence_request_id IS NULL)
   OR NOT EXISTS (
  SELECT 1 FROM events e WHERE e.id=r.source_event_id AND e.group_id=r.group_id AND e.workspace_id=r.workspace_id)
ON CONFLICT(id) DO NOTHING;
DELETE FROM governance_receipts r
WHERE r.source_event_id IS NULL OR r.proposal_id IS NULL
   OR r.action NOT IN ('approve','reject','request_evidence')
   OR r.actor_role NOT IN ('curator','admin')
   OR jsonb_typeof(r.evidence_references) IS DISTINCT FROM 'array'
   OR (jsonb_typeof(r.evidence_references)='array' AND jsonb_array_length(r.evidence_references)=0)
   OR r.proposal_version IS NULL OR btrim(r.proposal_version) !~ '^[1-9][0-9]*$'
   OR (r.action='request_evidence' AND r.evidence_request_id IS NULL)
   OR NOT EXISTS (
  SELECT 1 FROM events e WHERE e.id=r.source_event_id AND e.group_id=r.group_id AND e.workspace_id=r.workspace_id);

ALTER TABLE governance_receipts ALTER COLUMN proposal_version SET NOT NULL;
ALTER TABLE governance_receipts ALTER COLUMN proposal_version_origin SET DEFAULT 'current-contract';
UPDATE governance_receipts SET proposal_version_origin='current-contract' WHERE proposal_version_origin IS NULL;
ALTER TABLE governance_receipts ALTER COLUMN proposal_version_origin SET NOT NULL;
ALTER TABLE governance_receipts ALTER COLUMN evidence_request_id DROP NOT NULL;
UPDATE governance_receipts r
SET evidence_references=(
      SELECT jsonb_agg(v ORDER BY v) FROM (
        SELECT DISTINCT jsonb_array_elements_text(r.evidence_references) AS v
      ) valueset
    ),
    evidence_identity_hash=encode(digest((
      SELECT '['||string_agg(to_json(v)::text,',' ORDER BY v)||']' FROM (
        SELECT DISTINCT jsonb_array_elements_text(r.evidence_references) AS v
      ) valueset
    ),'sha256'),'hex')
WHERE jsonb_array_length(r.evidence_references)>0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.governance_receipts'::regclass AND conname='governance_receipts_current_contract_check') THEN
    ALTER TABLE governance_receipts ADD CONSTRAINT governance_receipts_current_contract_check CHECK (
      proposal_id IS NOT NULL
      AND proposal_version ~ '^[1-9][0-9]*$'
      AND evidence_identity_hash ~ '^[a-f0-9]{64}$'
      AND source_event_id IS NOT NULL
      AND action IN ('approve','reject','request_evidence')
      AND actor_role IN ('curator','admin')
      AND (action <> 'request_evidence' OR evidence_request_id IS NOT NULL)
      AND jsonb_typeof(evidence_references)='array' AND jsonb_array_length(evidence_references)>0
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.governance_receipts'::regclass AND conname='governance_receipts_proposal_scope_fkey') THEN
    ALTER TABLE governance_receipts ADD CONSTRAINT governance_receipts_proposal_scope_fkey
      FOREIGN KEY (group_id,workspace_id,proposal_id)
      REFERENCES canonical_proposals(group_id,workspace_id,id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.governance_receipts'::regclass AND conname='governance_receipts_evidence_scope_fkey') THEN
    ALTER TABLE governance_receipts ADD CONSTRAINT governance_receipts_evidence_scope_fkey
      FOREIGN KEY (group_id,workspace_id,proposal_id,evidence_request_id)
      REFERENCES evidence_requests(group_id,workspace_id,proposal_id,id) ON DELETE RESTRICT;
  END IF;
END $$;
ALTER TABLE governance_receipts VALIDATE CONSTRAINT governance_receipts_current_contract_check;
ALTER TABLE governance_receipts VALIDATE CONSTRAINT governance_receipts_proposal_scope_fkey;
ALTER TABLE governance_receipts VALIDATE CONSTRAINT governance_receipts_evidence_scope_fkey;
ALTER TABLE governance_receipts VALIDATE CONSTRAINT governance_receipts_source_event_scope_fkey;
ALTER TABLE governance_receipts DROP CONSTRAINT IF EXISTS governance_receipts_replay_key;
ALTER TABLE governance_receipts ADD CONSTRAINT governance_receipts_replay_key
  UNIQUE (group_id,workspace_id,proposal_id,proposal_version,evidence_identity_hash,action);
CREATE INDEX IF NOT EXISTS governance_receipts_scope_proposal_occurred_idx
  ON governance_receipts(group_id,workspace_id,proposal_id,occurred_at DESC,id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.governance_receipts'::regclass AND conname='governance_receipts_scope_identity_key') THEN
    ALTER TABLE governance_receipts ADD CONSTRAINT governance_receipts_scope_identity_key
      UNIQUE(group_id,workspace_id,proposal_id,id);
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS governance_receipt_evidence_requests (
  receipt_id UUID NOT NULL,
  group_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  proposal_id UUID NOT NULL,
  evidence_request_id UUID NOT NULL,
  ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
  PRIMARY KEY(receipt_id,evidence_request_id),
  UNIQUE(receipt_id,ordinal),
  CONSTRAINT governance_receipt_evidence_requests_receipt_fkey
    FOREIGN KEY(group_id,workspace_id,proposal_id,receipt_id)
    REFERENCES governance_receipts(group_id,workspace_id,proposal_id,id) ON DELETE RESTRICT,
  CONSTRAINT governance_receipt_evidence_requests_evidence_fkey
    FOREIGN KEY(group_id,workspace_id,proposal_id,evidence_request_id)
    REFERENCES evidence_requests(group_id,workspace_id,proposal_id,id) ON DELETE RESTRICT
);
INSERT INTO governance_receipt_evidence_requests(receipt_id,group_id,workspace_id,proposal_id,evidence_request_id,ordinal)
SELECT receipt_id,group_id,workspace_id,proposal_id,evidence_request_id,
       row_number() OVER(PARTITION BY receipt_id ORDER BY evidence_request_id)-1
FROM (
  SELECT DISTINCT r.id AS receipt_id,r.group_id,r.workspace_id,r.proposal_id,er.id AS evidence_request_id
  FROM governance_receipts r
  JOIN LATERAL jsonb_array_elements_text(r.evidence_references) ref(value) ON true
  JOIN evidence_requests er ON er.group_id=r.group_id AND er.workspace_id=r.workspace_id AND er.proposal_id=r.proposal_id
    AND er.id::text=regexp_replace(ref.value,'^evidence-request:','')
  UNION
  SELECT r.id,r.group_id,r.workspace_id,r.proposal_id,r.evidence_request_id
  FROM governance_receipts r WHERE r.evidence_request_id IS NOT NULL
) linked
ON CONFLICT DO NOTHING;
ALTER TABLE governance_receipt_evidence_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_receipt_evidence_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS governance_receipt_evidence_requests_workspace_isolation_policy ON governance_receipt_evidence_requests;
CREATE POLICY governance_receipt_evidence_requests_workspace_isolation_policy ON governance_receipt_evidence_requests
  FOR ALL TO allura_app
  USING(group_id=current_setting('app.current_group_id',true) AND workspace_id=current_setting('app.current_workspace_id',true))
  WITH CHECK(group_id=current_setting('app.current_group_id',true) AND workspace_id=current_setting('app.current_workspace_id',true));
REVOKE INSERT,UPDATE,DELETE ON governance_receipt_evidence_requests FROM allura_app;
GRANT SELECT ON governance_receipt_evidence_requests TO allura_app;
CREATE OR REPLACE FUNCTION app.finalize_governance_receipt_evidence(p_receipt_id UUID,p_evidence_ids UUID[])
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r governance_receipts%ROWTYPE; canonical_refs JSONB; canonical_hash TEXT; supplied UUID[];
BEGIN
  SELECT * INTO STRICT r FROM governance_receipts WHERE id=p_receipt_id;
  IF r.group_id IS DISTINCT FROM current_setting('app.current_group_id',true)
     OR r.workspace_id IS DISTINCT FROM current_setting('app.current_workspace_id',true) THEN
    RAISE EXCEPTION 'receipt evidence finalization scope mismatch';
  END IF;
  supplied:=ARRAY(SELECT DISTINCT value FROM unnest(COALESCE(p_evidence_ids,ARRAY[]::uuid[])) value ORDER BY value);
  IF EXISTS(SELECT 1 FROM governance_receipt_evidence_requests WHERE receipt_id=p_receipt_id) THEN
    RAISE EXCEPTION 'receipt evidence membership is already finalized';
  END IF;
  IF EXISTS(SELECT 1 FROM unnest(supplied) value WHERE NOT EXISTS(
    SELECT 1 FROM evidence_requests e WHERE e.id=value AND e.group_id=r.group_id AND e.workspace_id=r.workspace_id AND e.proposal_id=r.proposal_id)) THEN
    RAISE EXCEPTION 'evidence request is outside receipt proposal scope';
  END IF;
  SELECT jsonb_agg(ref ORDER BY ref) INTO canonical_refs FROM (
    SELECT 'event:'||r.source_event_id::text AS ref
    UNION ALL SELECT 'evidence-request:'||value::text FROM unnest(supplied) value
  ) refs;
  SELECT encode(digest('['||string_agg(to_json(ref)::text,',' ORDER BY ref)||']','sha256'),'hex')
    INTO canonical_hash FROM jsonb_array_elements_text(canonical_refs) item(ref);
  IF r.evidence_references IS DISTINCT FROM canonical_refs OR r.evidence_identity_hash IS DISTINCT FROM canonical_hash THEN
    RAISE EXCEPTION 'receipt evidence set/hash does not match canonical membership';
  END IF;
  INSERT INTO governance_receipt_evidence_requests(receipt_id,group_id,workspace_id,proposal_id,evidence_request_id,ordinal)
  SELECT r.id,r.group_id,r.workspace_id,r.proposal_id,value,row_number() OVER(ORDER BY value)-1 FROM unnest(supplied) value;
END $$;
REVOKE ALL ON FUNCTION app.finalize_governance_receipt_evidence(UUID,UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.finalize_governance_receipt_evidence(UUID,UUID[]) TO allura_app;
CREATE OR REPLACE FUNCTION app.prevent_governance_receipt_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'governance receipt evidence is immutable'; END; $$;
DROP TRIGGER IF EXISTS governance_receipt_evidence_requests_immutable_trigger ON governance_receipt_evidence_requests;
CREATE TRIGGER governance_receipt_evidence_requests_immutable_trigger BEFORE UPDATE OR DELETE ON governance_receipt_evidence_requests
  FOR EACH ROW EXECUTE FUNCTION app.prevent_governance_receipt_mutation();
CREATE OR REPLACE FUNCTION app.prevent_governance_receipt_row_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'governance_receipts are immutable'; END; $$;
CREATE TRIGGER governance_receipts_immutable_trigger BEFORE UPDATE OR DELETE ON governance_receipts
  FOR EACH ROW EXECUTE FUNCTION app.prevent_governance_receipt_row_mutation();

-- Losslessly rename shipped projection columns and make embedding provenance truthful.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='semantic_projections' AND column_name='subject_kind')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='semantic_projections' AND column_name='source_kind') THEN
    ALTER TABLE semantic_projections RENAME COLUMN subject_kind TO source_kind;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='semantic_projections' AND column_name='subject_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='semantic_projections' AND column_name='source_id') THEN
    ALTER TABLE semantic_projections RENAME COLUMN subject_id TO source_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='semantic_projections' AND column_name='content_markdown')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='semantic_projections' AND column_name='markdown') THEN
    ALTER TABLE semantic_projections RENAME COLUMN content_markdown TO markdown;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='semantic_projections' AND column_name='built_at')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='semantic_projections' AND column_name='generated_at') THEN
    ALTER TABLE semantic_projections RENAME COLUMN built_at TO generated_at;
  END IF;
END $$;
ALTER TABLE semantic_projections ADD COLUMN IF NOT EXISTS content_hash TEXT;
ALTER TABLE semantic_projections ADD COLUMN IF NOT EXISTS embedding_model TEXT;
UPDATE semantic_projections SET content_hash=encode(digest(markdown,'sha256'),'hex') WHERE content_hash IS NULL;
ALTER TABLE semantic_projections ALTER COLUMN content_hash SET NOT NULL;
ALTER TABLE semantic_projections DROP CONSTRAINT IF EXISTS semantic_projections_build_state_check;
ALTER TABLE semantic_projections ALTER COLUMN build_state SET DEFAULT 'pending_embedding';
UPDATE semantic_projections
SET build_state='pending_embedding', embedding_model=NULL, embedding_model_version=NULL, failure_code=NULL
WHERE embedding IS NULL AND build_state='ready';
ALTER TABLE semantic_projections ADD CONSTRAINT semantic_projections_build_state_check CHECK (
  (build_state='pending_embedding' AND embedding IS NULL AND embedding_model IS NULL AND embedding_model_version IS NULL AND failure_code IS NULL)
  OR (build_state='ready' AND embedding IS NOT NULL AND length(btrim(embedding_model))>0 AND length(btrim(embedding_model_version))>0 AND failure_code IS NULL)
  OR (build_state='failed' AND embedding IS NULL AND length(btrim(failure_code))>0)
);
ALTER TABLE semantic_projections DROP CONSTRAINT IF EXISTS semantic_projections_idempotency_key;
ALTER TABLE semantic_projections ADD CONSTRAINT semantic_projections_idempotency_key
  UNIQUE(group_id,workspace_id,source_kind,source_id,projection_version,source_revision_hash,content_hash,source_refs,redaction_policy_version);
DROP INDEX IF EXISTS semantic_projections_scope_subject_built_idx;
CREATE INDEX IF NOT EXISTS semantic_projections_scope_source_generated_idx
  ON semantic_projections(group_id,workspace_id,source_kind,source_id,generated_at DESC);

-- Migration 40 owns retained/promotion family workspace upgrades. Existing NULL
-- rows remain, but are explicitly labeled legacy_quarantined; app-role policies
-- expose and accept only exact workspace-scoped rows.
ALTER TABLE graph_memories ADD COLUMN IF NOT EXISTS workspace_id TEXT;
ALTER TABLE graph_memories ADD COLUMN IF NOT EXISTS workspace_scope_state TEXT NOT NULL DEFAULT 'legacy_quarantined';
ALTER TABLE allura_memories ADD COLUMN IF NOT EXISTS workspace_id TEXT;
ALTER TABLE allura_memories ADD COLUMN IF NOT EXISTS workspace_scope_state TEXT NOT NULL DEFAULT 'legacy_quarantined';
ALTER TABLE promotion_outbox ADD COLUMN IF NOT EXISTS workspace_id TEXT;
ALTER TABLE promotion_outbox ADD COLUMN IF NOT EXISTS workspace_scope_state TEXT NOT NULL DEFAULT 'legacy_quarantined';
ALTER TABLE promotion_idempotency ADD COLUMN IF NOT EXISTS workspace_id TEXT;
ALTER TABLE promotion_idempotency ADD COLUMN IF NOT EXISTS workspace_scope_state TEXT NOT NULL DEFAULT 'legacy_quarantined';
ALTER TABLE promotion_idempotency ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE graph_supersedes ADD COLUMN IF NOT EXISTS workspace_id TEXT;
ALTER TABLE graph_supersedes ADD COLUMN IF NOT EXISTS workspace_scope_state TEXT NOT NULL DEFAULT 'legacy_quarantined';
ALTER TABLE graph_structural_nodes ADD COLUMN IF NOT EXISTS workspace_id TEXT;
ALTER TABLE graph_structural_nodes ADD COLUMN IF NOT EXISTS workspace_scope_state TEXT NOT NULL DEFAULT 'legacy_quarantined';
ALTER TABLE graph_structural_edges ADD COLUMN IF NOT EXISTS workspace_id TEXT;
ALTER TABLE graph_structural_edges ADD COLUMN IF NOT EXISTS workspace_scope_state TEXT NOT NULL DEFAULT 'legacy_quarantined';
UPDATE graph_memories SET workspace_scope_state='legacy_quarantined' WHERE workspace_id IS NULL;
UPDATE allura_memories SET workspace_scope_state='legacy_quarantined' WHERE workspace_id IS NULL;
UPDATE promotion_outbox SET workspace_scope_state='legacy_quarantined' WHERE workspace_id IS NULL;
UPDATE promotion_idempotency SET workspace_scope_state='legacy_quarantined' WHERE workspace_id IS NULL;
UPDATE graph_supersedes SET workspace_scope_state='legacy_quarantined' WHERE workspace_id IS NULL;
UPDATE graph_structural_nodes SET workspace_scope_state='legacy_quarantined' WHERE workspace_id IS NULL;
UPDATE graph_structural_edges SET workspace_scope_state='legacy_quarantined' WHERE workspace_id IS NULL;
UPDATE graph_memories m SET workspace_id=NULL,workspace_scope_state='legacy_quarantined'
 WHERE workspace_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM workspaces w WHERE w.group_id=m.group_id AND w.workspace_id=m.workspace_id);
UPDATE allura_memories m SET workspace_id=NULL,workspace_scope_state='legacy_quarantined'
 WHERE workspace_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM workspaces w WHERE w.group_id=m.group_id AND w.workspace_id=m.workspace_id);
UPDATE promotion_outbox m SET workspace_id=NULL,workspace_scope_state='legacy_quarantined'
 WHERE workspace_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM workspaces w WHERE w.group_id=m.group_id AND w.workspace_id=m.workspace_id);
UPDATE promotion_idempotency m SET workspace_id=NULL,workspace_scope_state='legacy_quarantined'
 WHERE workspace_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM workspaces w WHERE w.group_id=m.group_id AND w.workspace_id=m.workspace_id);
UPDATE graph_supersedes m SET workspace_id=NULL,workspace_scope_state='legacy_quarantined'
 WHERE workspace_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM workspaces w WHERE w.group_id=m.group_id AND w.workspace_id=m.workspace_id);
UPDATE graph_structural_nodes m SET workspace_id=NULL,workspace_scope_state='legacy_quarantined'
 WHERE workspace_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM workspaces w WHERE w.group_id=m.group_id AND w.workspace_id=m.workspace_id);
UPDATE graph_structural_edges m SET workspace_id=NULL,workspace_scope_state='legacy_quarantined'
 WHERE workspace_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM workspaces w WHERE w.group_id=m.group_id AND w.workspace_id=m.workspace_id);
ALTER TABLE graph_memories ALTER COLUMN workspace_scope_state SET DEFAULT 'workspace_scoped';
ALTER TABLE allura_memories ALTER COLUMN workspace_scope_state SET DEFAULT 'workspace_scoped';
ALTER TABLE promotion_outbox ALTER COLUMN workspace_scope_state SET DEFAULT 'workspace_scoped';
ALTER TABLE promotion_idempotency ALTER COLUMN workspace_scope_state SET DEFAULT 'workspace_scoped';
ALTER TABLE graph_supersedes ALTER COLUMN workspace_scope_state SET DEFAULT 'workspace_scoped';
ALTER TABLE graph_structural_nodes ALTER COLUMN workspace_scope_state SET DEFAULT 'workspace_scoped';
ALTER TABLE graph_structural_edges ALTER COLUMN workspace_scope_state SET DEFAULT 'workspace_scoped';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.graph_memories'::regclass AND conname='graph_memories_workspace_scope_state_check') THEN
    ALTER TABLE graph_memories ADD CONSTRAINT graph_memories_workspace_scope_state_check CHECK (
      (workspace_scope_state='legacy_quarantined' AND workspace_id IS NULL) OR
      (workspace_scope_state='workspace_scoped' AND workspace_id IS NOT NULL)
    ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.graph_memories'::regclass AND conname='graph_memories_group_workspace_fkey') THEN
    ALTER TABLE graph_memories ADD CONSTRAINT graph_memories_group_workspace_fkey
      FOREIGN KEY(group_id,workspace_id) REFERENCES workspaces(group_id,workspace_id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.graph_memories'::regclass AND conname='graph_memories_scope_identity_key') THEN
    ALTER TABLE graph_memories ADD CONSTRAINT graph_memories_scope_identity_key UNIQUE(group_id,workspace_id,id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.allura_memories'::regclass AND conname='allura_memories_workspace_scope_state_check') THEN
    ALTER TABLE allura_memories ADD CONSTRAINT allura_memories_workspace_scope_state_check CHECK (
      (workspace_scope_state='legacy_quarantined' AND workspace_id IS NULL) OR
      (workspace_scope_state='workspace_scoped' AND workspace_id IS NOT NULL)
    ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.allura_memories'::regclass AND conname='allura_memories_group_workspace_fkey') THEN
    ALTER TABLE allura_memories ADD CONSTRAINT allura_memories_group_workspace_fkey
      FOREIGN KEY(group_id,workspace_id) REFERENCES workspaces(group_id,workspace_id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.promotion_outbox'::regclass AND conname='promotion_outbox_workspace_scope_state_check') THEN
    ALTER TABLE promotion_outbox ADD CONSTRAINT promotion_outbox_workspace_scope_state_check CHECK (
      (workspace_scope_state='legacy_quarantined' AND workspace_id IS NULL) OR
      (workspace_scope_state='workspace_scoped' AND workspace_id IS NOT NULL)
    ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.promotion_outbox'::regclass AND conname='promotion_outbox_group_workspace_fkey') THEN
    ALTER TABLE promotion_outbox ADD CONSTRAINT promotion_outbox_group_workspace_fkey
      FOREIGN KEY(group_id,workspace_id) REFERENCES workspaces(group_id,workspace_id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.promotion_idempotency'::regclass AND conname='promotion_idempotency_workspace_scope_state_check') THEN
    ALTER TABLE promotion_idempotency ADD CONSTRAINT promotion_idempotency_workspace_scope_state_check CHECK (
      (workspace_scope_state='legacy_quarantined' AND workspace_id IS NULL) OR
      (workspace_scope_state='workspace_scoped' AND workspace_id IS NOT NULL)
    ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.promotion_idempotency'::regclass AND conname='promotion_idempotency_group_workspace_fkey') THEN
    ALTER TABLE promotion_idempotency ADD CONSTRAINT promotion_idempotency_group_workspace_fkey
      FOREIGN KEY(group_id,workspace_id) REFERENCES workspaces(group_id,workspace_id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.graph_supersedes'::regclass AND conname='graph_supersedes_workspace_scope_state_check') THEN
    ALTER TABLE graph_supersedes ADD CONSTRAINT graph_supersedes_workspace_scope_state_check CHECK (
      (workspace_scope_state='legacy_quarantined' AND workspace_id IS NULL) OR
      (workspace_scope_state='workspace_scoped' AND workspace_id IS NOT NULL)
    ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.graph_supersedes'::regclass AND conname='graph_supersedes_group_workspace_fkey') THEN
    ALTER TABLE graph_supersedes ADD CONSTRAINT graph_supersedes_group_workspace_fkey
      FOREIGN KEY(group_id,workspace_id) REFERENCES workspaces(group_id,workspace_id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.graph_supersedes'::regclass AND conname='graph_supersedes_newer_scope_fkey') THEN
    ALTER TABLE graph_supersedes ADD CONSTRAINT graph_supersedes_newer_scope_fkey
      FOREIGN KEY(group_id,workspace_id,newer_id) REFERENCES graph_memories(group_id,workspace_id,id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.graph_supersedes'::regclass AND conname='graph_supersedes_superseded_scope_fkey') THEN
    ALTER TABLE graph_supersedes ADD CONSTRAINT graph_supersedes_superseded_scope_fkey
      FOREIGN KEY(group_id,workspace_id,superseded_id) REFERENCES graph_memories(group_id,workspace_id,id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.graph_structural_nodes'::regclass AND conname='graph_structural_nodes_workspace_scope_state_check') THEN
    ALTER TABLE graph_structural_nodes ADD CONSTRAINT graph_structural_nodes_workspace_scope_state_check CHECK (
      (workspace_scope_state='legacy_quarantined' AND workspace_id IS NULL) OR
      (workspace_scope_state='workspace_scoped' AND workspace_id IS NOT NULL)
    ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.graph_structural_nodes'::regclass AND conname='graph_structural_nodes_group_workspace_fkey') THEN
    ALTER TABLE graph_structural_nodes ADD CONSTRAINT graph_structural_nodes_group_workspace_fkey
      FOREIGN KEY(group_id,workspace_id) REFERENCES workspaces(group_id,workspace_id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.graph_structural_edges'::regclass AND conname='graph_structural_edges_workspace_scope_state_check') THEN
    ALTER TABLE graph_structural_edges ADD CONSTRAINT graph_structural_edges_workspace_scope_state_check CHECK (
      (workspace_scope_state='legacy_quarantined' AND workspace_id IS NULL) OR
      (workspace_scope_state='workspace_scoped' AND workspace_id IS NOT NULL)
    ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.graph_structural_edges'::regclass AND conname='graph_structural_edges_group_workspace_fkey') THEN
    ALTER TABLE graph_structural_edges ADD CONSTRAINT graph_structural_edges_group_workspace_fkey
      FOREIGN KEY(group_id,workspace_id) REFERENCES workspaces(group_id,workspace_id) ON DELETE RESTRICT NOT VALID;
  END IF;
END $$;
ALTER TABLE graph_memories VALIDATE CONSTRAINT graph_memories_workspace_scope_state_check;
ALTER TABLE graph_memories VALIDATE CONSTRAINT graph_memories_group_workspace_fkey;
ALTER TABLE allura_memories VALIDATE CONSTRAINT allura_memories_workspace_scope_state_check;
ALTER TABLE allura_memories VALIDATE CONSTRAINT allura_memories_group_workspace_fkey;
ALTER TABLE promotion_outbox VALIDATE CONSTRAINT promotion_outbox_workspace_scope_state_check;
ALTER TABLE promotion_outbox VALIDATE CONSTRAINT promotion_outbox_group_workspace_fkey;
ALTER TABLE promotion_idempotency VALIDATE CONSTRAINT promotion_idempotency_workspace_scope_state_check;
ALTER TABLE promotion_idempotency VALIDATE CONSTRAINT promotion_idempotency_group_workspace_fkey;
ALTER TABLE graph_supersedes VALIDATE CONSTRAINT graph_supersedes_workspace_scope_state_check;
ALTER TABLE graph_supersedes VALIDATE CONSTRAINT graph_supersedes_group_workspace_fkey;
ALTER TABLE graph_supersedes VALIDATE CONSTRAINT graph_supersedes_newer_scope_fkey;
ALTER TABLE graph_supersedes VALIDATE CONSTRAINT graph_supersedes_superseded_scope_fkey;
ALTER TABLE graph_structural_nodes VALIDATE CONSTRAINT graph_structural_nodes_workspace_scope_state_check;
ALTER TABLE graph_structural_nodes VALIDATE CONSTRAINT graph_structural_nodes_group_workspace_fkey;
ALTER TABLE graph_structural_edges VALIDATE CONSTRAINT graph_structural_edges_workspace_scope_state_check;
ALTER TABLE graph_structural_edges VALIDATE CONSTRAINT graph_structural_edges_group_workspace_fkey;
ALTER TABLE promotion_outbox DROP CONSTRAINT IF EXISTS promotion_outbox_group_id_proposal_id_key;
ALTER TABLE promotion_outbox DROP CONSTRAINT IF EXISTS promotion_outbox_scope_proposal_key;
ALTER TABLE promotion_outbox ADD CONSTRAINT promotion_outbox_scope_proposal_key UNIQUE(group_id,workspace_id,proposal_id);
ALTER TABLE promotion_idempotency DROP CONSTRAINT IF EXISTS promotion_idempotency_pkey;
ALTER TABLE promotion_idempotency ALTER COLUMN id SET NOT NULL;
ALTER TABLE promotion_idempotency ADD CONSTRAINT promotion_idempotency_pkey PRIMARY KEY(id);
ALTER TABLE promotion_idempotency DROP CONSTRAINT IF EXISTS promotion_idempotency_scope_key;
ALTER TABLE promotion_idempotency ADD CONSTRAINT promotion_idempotency_scope_key UNIQUE(group_id,workspace_id,idempotency_key);

ALTER TABLE graph_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_memories FORCE ROW LEVEL SECURITY;
ALTER TABLE allura_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE allura_memories FORCE ROW LEVEL SECURITY;
ALTER TABLE promotion_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_outbox FORCE ROW LEVEL SECURITY;
ALTER TABLE promotion_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_idempotency FORCE ROW LEVEL SECURITY;
ALTER TABLE graph_supersedes ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_supersedes FORCE ROW LEVEL SECURITY;
ALTER TABLE graph_structural_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_structural_nodes FORCE ROW LEVEL SECURITY;
ALTER TABLE graph_structural_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_structural_edges FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace_scope_restrictive_policy ON graph_memories;
CREATE POLICY workspace_scope_restrictive_policy ON graph_memories AS RESTRICTIVE FOR ALL TO allura_app
  USING(group_id=current_setting('app.current_group_id',true) AND workspace_id=current_setting('app.current_workspace_id',true) AND workspace_scope_state='workspace_scoped')
  WITH CHECK(group_id=current_setting('app.current_group_id',true) AND workspace_id=current_setting('app.current_workspace_id',true) AND workspace_scope_state='workspace_scoped');
DROP POLICY IF EXISTS workspace_scope_restrictive_policy ON allura_memories;
CREATE POLICY workspace_scope_restrictive_policy ON allura_memories AS RESTRICTIVE FOR ALL TO allura_app
  USING(group_id=current_setting('app.current_group_id',true) AND workspace_id=current_setting('app.current_workspace_id',true) AND workspace_scope_state='workspace_scoped')
  WITH CHECK(group_id=current_setting('app.current_group_id',true) AND workspace_id=current_setting('app.current_workspace_id',true) AND workspace_scope_state='workspace_scoped');
DROP POLICY IF EXISTS workspace_scope_restrictive_policy ON promotion_outbox;
CREATE POLICY workspace_scope_restrictive_policy ON promotion_outbox AS RESTRICTIVE FOR ALL TO allura_app
  USING(group_id=current_setting('app.current_group_id',true) AND workspace_id=current_setting('app.current_workspace_id',true) AND workspace_scope_state='workspace_scoped')
  WITH CHECK(group_id=current_setting('app.current_group_id',true) AND workspace_id=current_setting('app.current_workspace_id',true) AND workspace_scope_state='workspace_scoped');
DROP POLICY IF EXISTS workspace_scope_restrictive_policy ON promotion_idempotency;
CREATE POLICY workspace_scope_restrictive_policy ON promotion_idempotency AS RESTRICTIVE FOR ALL TO allura_app
  USING(group_id=current_setting('app.current_group_id',true) AND workspace_id=current_setting('app.current_workspace_id',true) AND workspace_scope_state='workspace_scoped')
  WITH CHECK(group_id=current_setting('app.current_group_id',true) AND workspace_id=current_setting('app.current_workspace_id',true) AND workspace_scope_state='workspace_scoped');
DROP POLICY IF EXISTS workspace_scope_restrictive_policy ON graph_supersedes;
CREATE POLICY workspace_scope_restrictive_policy ON graph_supersedes AS RESTRICTIVE FOR ALL TO allura_app
  USING(group_id=current_setting('app.current_group_id',true) AND workspace_id=current_setting('app.current_workspace_id',true) AND workspace_scope_state='workspace_scoped')
  WITH CHECK(group_id=current_setting('app.current_group_id',true) AND workspace_id=current_setting('app.current_workspace_id',true) AND workspace_scope_state='workspace_scoped');
DROP POLICY IF EXISTS workspace_scope_restrictive_policy ON graph_structural_nodes;
CREATE POLICY workspace_scope_restrictive_policy ON graph_structural_nodes AS RESTRICTIVE FOR ALL TO allura_app
  USING(group_id=current_setting('app.current_group_id',true) AND workspace_id=current_setting('app.current_workspace_id',true) AND workspace_scope_state='workspace_scoped')
  WITH CHECK(group_id=current_setting('app.current_group_id',true) AND workspace_id=current_setting('app.current_workspace_id',true) AND workspace_scope_state='workspace_scoped');
DROP POLICY IF EXISTS workspace_scope_restrictive_policy ON graph_structural_edges;
CREATE POLICY workspace_scope_restrictive_policy ON graph_structural_edges AS RESTRICTIVE FOR ALL TO allura_app
  USING(group_id=current_setting('app.current_group_id',true) AND workspace_id=current_setting('app.current_workspace_id',true) AND workspace_scope_state='workspace_scoped')
  WITH CHECK(group_id=current_setting('app.current_group_id',true) AND workspace_id=current_setting('app.current_workspace_id',true) AND workspace_scope_state='workspace_scoped');
GRANT SELECT, INSERT, UPDATE, DELETE ON graph_memories, graph_supersedes, graph_structural_nodes, graph_structural_edges, allura_memories, promotion_outbox, promotion_idempotency TO allura_app;

-- Compose workspace scope with heterogeneous earlier policies.
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace_scope_restrictive_policy ON events;
CREATE POLICY workspace_scope_restrictive_policy ON events AS RESTRICTIVE FOR ALL TO allura_app
  USING(group_id=current_setting('app.current_group_id',true) AND workspace_id=current_setting('app.current_workspace_id',true))
  WITH CHECK(group_id=current_setting('app.current_group_id',true) AND workspace_id=current_setting('app.current_workspace_id',true));
ALTER TABLE canonical_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_proposals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace_scope_restrictive_policy ON canonical_proposals;
CREATE POLICY workspace_scope_restrictive_policy ON canonical_proposals AS RESTRICTIVE FOR ALL TO allura_app
  USING(group_id=current_setting('app.current_group_id',true) AND workspace_id=current_setting('app.current_workspace_id',true))
  WITH CHECK(group_id=current_setting('app.current_group_id',true) AND workspace_id=current_setting('app.current_workspace_id',true));

INSERT INTO schema_versions(version,applied_at,description)
VALUES('040',NOW(),'Story 25.2a truthful receipt versions, staged embeddings, scoped promotion and retained knowledge')
ON CONFLICT(version) DO NOTHING;

COMMIT;
