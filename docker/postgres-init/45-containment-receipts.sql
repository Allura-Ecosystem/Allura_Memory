-- Migration 45: Governed containment-action receipts
-- Story 26.6 — Containment Connectors and Response Receipts (AC-5)
--
-- Mirrors mitigation_receipts (migration 41) exactly: an immutable receipt
-- for one governed action, gated by a well-formed `approval_ref` (UUID)
-- through the REQ-GOV-008 control-plane syscall path
-- (src/control-plane/syscalls.ts) before this table is ever reached.
--
-- Per AD-58 (docs/allura/RISKS-AND-DECISIONS.md): "security owner" resolves
-- to the existing `admin` RBAC role. actor_role is therefore constrained to
-- 'admin' at the schema level, not just checked in application code.
--
-- authorization_chain (AC-5) is the one field mitigation_receipts does not
-- have: an ordered JSON array recording every authorization step that had
-- to pass (e.g. ["role:admin", "policy:containment-v1", "approval:<uuid>"]).
--
-- MUTABILITY: append-only, identical pattern to mitigation_receipts --
-- UPDATE and DELETE both unconditionally rejected. There is no lifecycle
-- to track (unlike threat_alerts); a containment receipt is a durable,
-- one-time audit record.

CREATE TABLE IF NOT EXISTS containment_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id TEXT NOT NULL CHECK (group_id ~ '^allura-[a-z0-9-]+$'),
  workspace_id TEXT NOT NULL,
  connector TEXT NOT NULL CHECK (connector IN ('mcp_token_revocation', 'workspace_lock', 'endpoint_isolation')),
  action TEXT NOT NULL CHECK (LENGTH(TRIM(action)) > 0),
  target_ref TEXT NOT NULL CHECK (LENGTH(TRIM(target_ref)) > 0),
  approval_ref UUID NOT NULL,
  actor_id TEXT NOT NULL CHECK (LENGTH(TRIM(actor_id)) > 0),
  actor_role TEXT NOT NULL CHECK (actor_role = 'admin'),
  rationale TEXT NOT NULL CHECK (LENGTH(TRIM(rationale)) > 0),
  policy_reference TEXT NOT NULL CHECK (LENGTH(TRIM(policy_reference)) > 0),
  authorization_chain JSONB NOT NULL CHECK (
    jsonb_typeof(authorization_chain) = 'array' AND jsonb_array_length(authorization_chain) > 0
  ),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT containment_receipts_group_workspace_fkey
    FOREIGN KEY (group_id, workspace_id) REFERENCES workspaces(group_id, workspace_id),
  CONSTRAINT containment_receipts_replay_key
    UNIQUE (group_id, workspace_id, connector, target_ref, approval_ref, action)
);

CREATE INDEX IF NOT EXISTS containment_receipts_scope_connector_occurred_idx
  ON containment_receipts (group_id, workspace_id, connector, occurred_at DESC, id);

-- ── Row-level security (mirrors mitigation_receipts, migration 41) ──────────
ALTER TABLE containment_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE containment_receipts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS containment_receipts_workspace_isolation_policy ON containment_receipts;
CREATE POLICY containment_receipts_workspace_isolation_policy ON containment_receipts
  FOR ALL TO allura_app
  USING (
    group_id = current_setting('app.current_group_id', true)
    AND workspace_id = current_setting('app.current_workspace_id', true)
  )
  WITH CHECK (
    group_id = current_setting('app.current_group_id', true)
    AND workspace_id = current_setting('app.current_workspace_id', true)
  );

-- ── Immutability (mirrors mitigation_receipts, migration 41) ────────────────
CREATE OR REPLACE FUNCTION app.prevent_containment_receipt_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'containment_receipts are immutable';
END;
$$;

DROP TRIGGER IF EXISTS containment_receipts_immutable_trigger ON containment_receipts;
CREATE TRIGGER containment_receipts_immutable_trigger
  BEFORE UPDATE OR DELETE ON containment_receipts
  FOR EACH ROW
  EXECUTE FUNCTION app.prevent_containment_receipt_mutation();

GRANT SELECT, INSERT ON containment_receipts TO allura_app;

-- ── Schema version tracking ──────────────────────────────────────────────────
INSERT INTO schema_versions (version, applied_at, description)
VALUES (
    '045',
    NOW(),
    'Story 26.6 AC-5: containment_receipts append-only table for governed containment-action receipts (token revocation, workspace lock, endpoint isolation), gated by REQ-GOV-008 approval_ref and AD-58 admin-role constraint.'
) ON CONFLICT (version) DO NOTHING;
