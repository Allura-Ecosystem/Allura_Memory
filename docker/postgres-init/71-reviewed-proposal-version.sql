-- Migration 071: bind every new approval receipt to the exact proposal revision reviewed by a human.
-- Historical immutable receipts remain NULL because their reviewed revision cannot be reconstructed safely.

BEGIN;

ALTER TABLE governance_receipts
  ADD COLUMN IF NOT EXISTS reviewed_proposal_version TEXT;

ALTER TABLE governance_receipts
  DROP CONSTRAINT IF EXISTS governance_receipts_reviewed_proposal_version_check;
ALTER TABLE governance_receipts
  ADD CONSTRAINT governance_receipts_reviewed_proposal_version_check
  CHECK (reviewed_proposal_version IS NULL OR reviewed_proposal_version ~ '^[1-9][0-9]*$');

COMMENT ON COLUMN governance_receipts.reviewed_proposal_version IS
  'Exact canonical_proposals.proposal_version supplied by the human review client; NULL only for receipts created before migration 071 or non-approval actions.';

INSERT INTO schema_versions (version, description)
VALUES ('071', 'Persist the exact human-reviewed proposal version on governance receipts')
ON CONFLICT (version) DO NOTHING;

COMMIT;
