-- Story 24.4 — Atomic human-governed promotion
-- One approval decision owns exactly one canonical memory and one projection job.

ALTER TABLE canonical_proposals
  ADD COLUMN IF NOT EXISTS approved_memory_id TEXT;

CREATE TABLE IF NOT EXISTS promotion_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id TEXT NOT NULL CHECK (group_id ~ '^allura-[a-z0-9-]+$'),
  proposal_id UUID NOT NULL REFERENCES canonical_proposals(id) ON DELETE CASCADE,
  memory_id TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'canonical_memory_promoted',
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'delivered', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, proposal_id)
);

CREATE INDEX IF NOT EXISTS promotion_outbox_pending_idx
  ON promotion_outbox (status, available_at, created_at)
  WHERE status IN ('pending', 'failed');

CREATE TABLE IF NOT EXISTS promotion_idempotency (
  group_id TEXT NOT NULL CHECK (group_id ~ '^allura-[a-z0-9-]+$'),
  idempotency_key TEXT NOT NULL CHECK (LENGTH(TRIM(idempotency_key)) > 0),
  proposal_id UUID NOT NULL REFERENCES canonical_proposals(id) ON DELETE CASCADE,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, idempotency_key)
);

-- The canonical service writes the one complete approval event in its transaction.
-- The old proposal-update trigger remains for backward compatibility with the
-- existing route.ts flow; the approveProposal service writes its own event
-- explicitly and does not rely on the trigger.

-- Enable RLS on new tenant-scoped tables (Story 24.3 compliance)
ALTER TABLE promotion_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_idempotency ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy ON promotion_outbox;
CREATE POLICY tenant_isolation_policy ON promotion_outbox
  USING (group_id = current_setting('app.current_tenant', true));

DROP POLICY IF EXISTS tenant_isolation_policy ON promotion_idempotency;
CREATE POLICY tenant_isolation_policy ON promotion_idempotency
  USING (group_id = current_setting('app.current_tenant', true));
