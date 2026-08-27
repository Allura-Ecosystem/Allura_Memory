-- Migration 41: Governed mitigation-draft approval receipts
-- Story 26.5 — Governed Mitigation Policy Drafts (AC-6, AC-7)
--
-- The local MitigationDraftRecord (src/lib/mitigation/receipt.ts) is a
-- deliberately non-durable, unauthenticated simulation record — it cannot
-- approve or activate a policy. This table is the canonical receipt for the
-- one governed action Story 26.5 authorizes: a human approving or rejecting a
-- mitigation draft FOR a later, separately authorized enforcement workflow
-- (AD-57). It never records activation, enforcement, schedule changes, or
-- connector actions — those remain out of Bumblebee V1's authority entirely.
--
-- Every row requires a well-formed `approval_ref` (UUID), enforced by the
-- REQ-GOV-008 control-plane gate (src/control-plane/syscalls.ts) before this
-- table is ever reached — rows can only exist if the approval gate passed.
--
-- Unlike governance_receipts, this table is NOT foreign-keyed to
-- canonical_proposals: a mitigation draft is not a curator promotion
-- proposal, so that pipeline's schema does not apply here.
--
-- MUTABILITY: append-only, enforced by trigger below.

CREATE TABLE IF NOT EXISTS mitigation_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id TEXT NOT NULL CHECK (group_id ~ '^allura-[a-z0-9-]+$'),
  workspace_id TEXT NOT NULL,
  draft_id TEXT NOT NULL CHECK (LENGTH(TRIM(draft_id)) > 0),
  approval_ref UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('approved_for_activation', 'rejected')),
  actor_id TEXT NOT NULL CHECK (LENGTH(TRIM(actor_id)) > 0),
  actor_role TEXT NOT NULL CHECK (LENGTH(TRIM(actor_role)) > 0),
  rationale TEXT NOT NULL CHECK (LENGTH(TRIM(rationale)) > 0),
  policy_reference TEXT NOT NULL CHECK (LENGTH(TRIM(policy_reference)) > 0),
  policy_version TEXT NOT NULL CHECK (LENGTH(TRIM(policy_version)) > 0),
  evidence_ids JSONB NOT NULL CHECK (
    jsonb_typeof(evidence_ids) = 'array' AND jsonb_array_length(evidence_ids) > 0
  ),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mitigation_receipts_group_workspace_fkey
    FOREIGN KEY (group_id, workspace_id) REFERENCES workspaces(group_id, workspace_id),
  CONSTRAINT mitigation_receipts_replay_key
    UNIQUE (group_id, workspace_id, draft_id, approval_ref, action)
);

CREATE INDEX IF NOT EXISTS mitigation_receipts_scope_draft_occurred_idx
  ON mitigation_receipts (group_id, workspace_id, draft_id, occurred_at DESC, id);

-- ── Row-level security (mirrors governance_receipts, migration 39) ──────────
ALTER TABLE mitigation_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE mitigation_receipts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mitigation_receipts_workspace_isolation_policy ON mitigation_receipts;
CREATE POLICY mitigation_receipts_workspace_isolation_policy ON mitigation_receipts
  FOR ALL TO allura_app
  USING (
    group_id = current_setting('app.current_group_id', true)
    AND workspace_id = current_setting('app.current_workspace_id', true)
  )
  WITH CHECK (
    group_id = current_setting('app.current_group_id', true)
    AND workspace_id = current_setting('app.current_workspace_id', true)
  );

-- ── Immutability (mirrors governance_receipts, migration 39) ────────────────
CREATE OR REPLACE FUNCTION app.prevent_mitigation_receipt_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'mitigation_receipts are immutable';
END;
$$;

DROP TRIGGER IF EXISTS mitigation_receipts_immutable_trigger ON mitigation_receipts;
CREATE TRIGGER mitigation_receipts_immutable_trigger
  BEFORE UPDATE OR DELETE ON mitigation_receipts
  FOR EACH ROW
  EXECUTE FUNCTION app.prevent_mitigation_receipt_mutation();

GRANT SELECT, INSERT ON mitigation_receipts TO allura_app;

-- ── Schema version tracking ──────────────────────────────────────────────────
INSERT INTO schema_versions (version, applied_at, description)
VALUES (
    '041',
    NOW(),
    'Story 26.5 AC-6/AC-7: mitigation_receipts append-only table for governed draft approval/rejection, gated by REQ-GOV-008 approval_ref through the control-plane syscall path.'
) ON CONFLICT (version) DO NOTHING;
