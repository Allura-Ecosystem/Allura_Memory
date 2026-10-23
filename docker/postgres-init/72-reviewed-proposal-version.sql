-- Migration 072: bind every new approval receipt to the exact proposal revision reviewed by a human.
-- Migration identity 071 is reserved for the separately held promotion-disposition candidate.
-- Historical immutable receipts remain NULL because their reviewed revision cannot be reconstructed safely.

DO $$
DECLARE
  existing_found BOOLEAN := FALSE;
  existing_description TEXT;
BEGIN
  SELECT TRUE, description INTO existing_found, existing_description
    FROM schema_versions
   WHERE version = '072';
  IF existing_found
     AND existing_description IS DISTINCT FROM 'Persist the exact human-reviewed proposal version on governance receipts' THEN
    RAISE EXCEPTION 'migration 072 identity collision: existing description is %', existing_description;
  END IF;
END $$;

BEGIN;

ALTER TABLE governance_receipts
  ADD COLUMN IF NOT EXISTS reviewed_proposal_version TEXT;

ALTER TABLE governance_receipts
  DROP CONSTRAINT IF EXISTS governance_receipts_reviewed_proposal_version_check;
ALTER TABLE governance_receipts
  ADD CONSTRAINT governance_receipts_reviewed_proposal_version_check
  CHECK (reviewed_proposal_version IS NULL OR reviewed_proposal_version ~ '^[1-9][0-9]*$');

COMMENT ON COLUMN governance_receipts.reviewed_proposal_version IS
  'Exact canonical_proposals.proposal_version supplied by the human review client; NULL only for receipts created before migration 072 or non-approval actions.';

INSERT INTO schema_versions (version, description)
SELECT '072', 'Persist the exact human-reviewed proposal version on governance receipts'
WHERE NOT EXISTS (SELECT 1 FROM schema_versions WHERE version = '072');

COMMIT;
